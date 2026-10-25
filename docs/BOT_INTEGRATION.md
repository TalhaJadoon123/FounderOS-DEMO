# Bot → FounderOS integration

This is the contract between FounderOS and a local trading bot (Loopader/MT5).
It is intentionally small: one snapshot endpoint, one transfer endpoint, and a
read-only ledger. Everything is versioned by the OpenAPI spec at
`GET /api/openapi`.

> **Real data only.** `/trading` renders the latest row in
> `trading_snapshots`. Seeded demo rows are used only until the first real
> snapshot arrives; that first sync deletes every `source = 'seed'` row and its
> positions. There is no fake “connected” state.

---

## 1. Authentication

Set one shared secret in FounderOS `.env.local`:

```dotenv
JARVIS_LOCAL_INGEST_TOKEN=<random 48-char hex>
```

Every write sends it as either header:

```http
Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN>
# or
x-jarvis-token: <JARVIS_LOCAL_INGEST_TOKEN>
```

- If the token is **unset**, writes are allowed for local development and the
  app logs a warning on every write. Never expose that mode beyond localhost.
- If `FOUNDER_OS_ACCESS_TOKEN` (the whole-app browser gate) is set, the
  middleware still lets `/api/finances/*` and `/api/trading/snapshot` through
  when they carry the ingest bearer token. `/api/health` (without `?full=1`) is
  also open so Docker health checks keep working. Everything else stays gated.
- The Loopader CLI reads the same value from `LOOPADER_CLI_AUTH_TOKEN`.

Generate a token:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## 2. Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/finances/bot-sync` | Account snapshot + open positions + closed trades |
| `POST` | `/api/finances/transfer` | Deposit / withdrawal between FounderOS and the bot |
| `GET` | `/api/jarvis/funding/ledger?projectId=loopader-bot` | Paginated ledger |
| `GET` | `/api/jarvis/funding/reconcile?projectId=loopader-bot` | Gross / fees / net / count |
| `GET` | `/api/jarvis/funding/export?projectId=loopader-bot` | CSV with a TOTALS row |
| `GET` | `/api/trading` | What `/trading` reads |
| `GET` | `/api/health?full=1` | Database, disk, and configured providers |

All write responses are JSON. Errors are `{ "ok": false, "error": ... }` with a
4xx/5xx status.

---

## 3. `POST /api/finances/bot-sync`

This is the exact shape the MT5 bridge returns, with the optional `trades`
array added:

```json
{
  "source": "loopader",
  "projectId": "loopader-bot",
  "timestamp": "2026-10-25T10:00:00.000Z",
  "account": {
    "success": true,
    "account_balance": 10000,
    "account_equity": 10500,
    "account_margin_free": 9000,
    "positions": [
      {
        "ticket": 123456,
        "symbol": "EURUSD",
        "volume": 0.1,
        "price_open": 1.1,
        "price_current": 1.105,
        "profit": 50,
        "commission": 0.5
      }
    ]
  },
  "trades": [
    {
      "ticket": "987654",
      "symbol": "EURUSD",
      "profit": 12.5,
      "commission": 0.5
    }
  ]
}
```

Normalization rules:

| Input | Meaning |
| --- | --- |
| `account.account_equity` / `equity` / `accountValueUsd` | `accountValueUsd` (falls back to balance) |
| `account.account_balance` / `balance` / `cashUsd` | `cashUsd` |
| `account.account_margin_free` / `margin_free` | `buyingPowerUsd` (falls back to equity) |
| `account.day_pnl` / `dayPnlUsd` | `dayPnlUsd` (default `0`) |
| `account.profit` or `equity - balance` | `totalPnlUsd` |
| `positions` array **or** JSON string | open positions (both accepted) |
| `positions[].volume` / `quantity` | quantity |
| `positions[].price_open` | `avgCostUsd` |
| `positions[].price_current` | used for market value when absent |
| `positions[].profit` | `unrealizedPnlUsd` |
| `trades[].profit` / `pnl` | dollars → `amountCents` |
| `trades[].commission` | dollars → `feeCents` |
| `trades[].feeCents` | already cents |
| `trades[].ticket` / `reference` / `id` | idempotency key (`external_id`) |

- `source` must be a real provider name (`loopader`, `mt5`, …). Never send
  `seed`.
- `projectId` defaults to `loopader-bot` for `source = "loopader"`, otherwise
  `bot-<source>`. The project is created on first sync and never overwrites an
  operator-edited project.
- Trades are idempotent on `(source, external_id)`: replaying the same ticket
  does not double-count money.
- If the account has no balance/equity, the endpoint still returns `200` but
  reports `snapshot.recorded = false` with a reason. It does not invent a value.

---

## 4. `POST /api/finances/transfer`

Accepts both the FounderOS shape and the Loopader CLI shape.

```json
{
  "type": "withdraw",
  "from": "loopader",
  "to": "founderos",
  "amount": 50,
  "currency": "USD",
  "reference": "wd-2026-10-25-1"
}
```

- `amount` is major units (dollars); `amountCents` is accepted too.
- `withdraw` / `withdrawal` stores a **negative** `amountCents`.
- The write is rejected if the projected ledger balance would go below zero,
  unless `JARVIS_ALLOW_NEGATIVE_WITHDRAWALS=1`.
- `deposit` stores a positive row.
- Idempotent on `(source, external_id)`; send a stable `reference`.

---

## 5. Loopader CLI

The CLI lives in the bot repo (`hft/cli/loopader-cli.py`). Point it at the
FounderOS host URL, not the Docker-only DNS name, unless the CLI itself runs in
a container on the shared network.

```powershell
$env:LOOPADER_FOUNDEROS_URL = "http://localhost:4100"   # host
# $env:LOOPADER_FOUNDEROS_URL = "http://founder-os:4100" # inside Docker network
$env:LOOPADER_CLI_AUTH_TOKEN = "<JARVIS_LOCAL_INGEST_TOKEN>"
$env:LOOPADER_CLI_ALLOW_MUTATIONS = "1"

python loopader-cli.py status
python loopader-cli.py --confirm-token <token> sync
```

The confirm token is the first 16 hex chars of:

```text
sha256(LOOPADER_CLI_AUTH_TOKEN + json.dumps({"command": "<cmd>", "args": <args>}, sort_keys=True))
```

`--confirm-token` is a **global** flag: put it before the subcommand.

- `status` reads the MT5 bridge only.
- `sync` POSTs the bridge account + timestamp to `/api/finances/bot-sync`.
- `deposit <amount>` / `withdraw <amount>` POST to `/api/finances/transfer`.

---

## 6. Docker networking

FounderOS exposes the bridge network as **`founder-os-net`** (stable name, not
prefixed by the compose project directory). The FounderOS container is
`founder-os` on port `4100`.

If the bot runs in its own compose project, join the same network:

```yaml
services:
  loopader-bot:
    # ...
    networks:
      - founder-os-net

networks:
  founder-os-net:
    external: true
```

or attach an existing container:

```bash
docker network connect founder-os-net loopader-bot
```

Inside the network use `http://founder-os:4100`. From the host use
`http://localhost:4100`. `founderos:4100` does **not** resolve on the host.

### MT5 bridge checklist

The `/trading` page stays on seeded data until all of these are true:

1. MetaTrader 5 is running and logged into the account you want to show.
2. `LoopaderBridge.mq5` is attached to a chart (any symbol/timeframe).
3. **Algo Trading** is enabled in MT5 (toolbar button + Tools → Options →
   Expert Advisors → *Allow Algo Trading*).
4. The Python bridge (`hft/executor/mt5_bridge.py`) is listening on port `5555`.
5. `python loopader-cli.py status` returns account balance/equity.
6. `python loopader-cli.py --confirm-token <token> sync` returns HTTP 200.
7. `curl http://localhost:4100/api/trading` shows `"source":"loopader"` and the
   account values from MT5.

If step 5 times out, the EA is not running or Algo Trading is off; FounderOS
cannot fix that from the web app.

---

## 7. Health & observability

- `GET /api/health` — liveness (DB read only). Used by Docker.
- `GET /api/health?full=1` — database, real disk free/total, and Stripe / Wise /
  NOWPayments **only when their keys are configured**. No fake green checks.
- `GET /api/openapi` — OpenAPI 3.1 spec.
- `/api-docs` — human-readable endpoint list.
- Funding writes are append-only in `jarvis_revenue`; the audit trail is in
  `lib/jarvis/audit.ts` (`JSONL`).
