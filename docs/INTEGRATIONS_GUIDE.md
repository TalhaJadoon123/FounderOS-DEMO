# FounderOS Real Integrations Guide

> **Philosophy**: Every connector returns honest status (`connected` | `not_configured` | `error`). There are no fake green lights. If a key isn't set, you see "not configured" — not a demo number.

---

## Quick Start: Adding a New Integration

1. **Add the environment variable** to `.env.local`
2. **Restart the dev server** (`pnpm run dev`) — the app reads env at startup
3. **Check `/integrations`** — the card will flip from `not_configured` → `connected`
4. **Verify in the relevant page** — e.g. `/social` for social accounts, `/finances` for payments

---

## Core Infrastructure (Required First)

### 1. Database (SQLite) — Always Real
- **File**: `data/founder-os.db` (created on first run)
- **Location**: Controlled by `FOUNDER_OS_DB` env var or `DATA_DIR` (Railway) or `/tmp` (Vercel)
- **Seeding**: Only structural data (6 departments, 13 agents, 5 crons) — **NO demo content**
- **Verify**: `GET /api/health?full=1` → `"database": {"status": "healthy", "details": {"connected": true}}`

### 2. G-Brain (Knowledge Graph) — Local CLI
**What it does**: Hybrid search (vector + keyword) over your markdown files in `knowledge/brain-store/`

| Env Var | Required | How to Get |
|---------|----------|------------|
| `GBRAIN_BIN` | No | Path to `gbrain` binary (defaults to `gbrain` on PATH) |
| `GBRAIN_STORE` | No | Path to brain store (defaults to `knowledge/brain-store`) |
| `BRAIN_PROVIDER` | No | Set to `stub` to disable for testing |

**Setup**:
```bash
# 1. Install gbrain CLI (from your private repo or build from source)
# 2. Point to your markdown knowledge base
export GBRAIN_STORE=/path/to/your/brain-store
export GBRAIN_BIN=/usr/local/bin/gbrain
```

**Verify**: `GET /api/brain` → `"connected": true` with page count
**Pages**: `/brain` (graph), `/doctor` (health), `/brain/overview` (stats)

---

## Payment Processors (Finances)

### 3. Stripe — Fully Wired
**What it does**: Syncs charges, refunds, subscriptions, available balance → `jarvis_revenue` table

| Env Var | Required | How to Get |
|---------|----------|------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe Dashboard → Developers → API Keys → Secret Key (`sk_live_...` or `sk_test_...`) |

**Setup**:
```bash
export STRIPE_SECRET_KEY=sk_live_...
```

**Verify**: 
- `GET /api/health?full=1` → `"stripe": {"state": "connected"}`
- `GET /api/jarvis/funding/reconcile?projectId=jarvis-launchpad-1` → shows Stripe revenue
- `POST /api/finances/sync-revenue` → manual sync

**Primary checkout provider**: Set `JARVIS_PAYMENT_PROVIDER=stripe` (default)

---

### 4. Wise — Revenue Sync (Balance + Transfers)
**What it does**: Syncs incoming/outgoing transfers from your Wise account → `jarvis_revenue`

| Env Var | Required | How to Get |
|---------|----------|------------|
| `WISE_API_KEY` | Yes | Wise → Settings → API tokens → Create token (needs `transfers:read`, `balances:read`) |
| `WISE_PROFILE_ID` | No | Your Wise profile ID (auto-detected if single profile) |

**Setup**:
```bash
export WISE_API_KEY=your_wise_token
```

**Verify**:
- `GET /api/health?full=1` → `"wise": {"state": "connected"}`
- `POST /api/finances/sync-revenue` with `{"projectId": "your-project"}` → syncs transfers

**Note**: Supports multiple accounts — add `WISE_1_TOKEN`, `WISE_2_TOKEN` for additional profiles

---

### 5. NOWPayments — Crypto Checkout + Revenue
**What it does**: Handles crypto payments (BTC, ETH, USDT, etc.) + syncs payment status

| Env Var | Required | How to Get |
|---------|----------|------------|
| `NOWPAYMENTS_API_KEY` | Yes | NOWPayments Dashboard → Settings → API Key |
| `NOWPAYMENTS_IPN_SECRET` | For webhooks | NOWPayments → Settings → IPN Secret |

**Setup**:
```bash
export NOWPAYMENTS_API_KEY=your_key
export JARVIS_PAYMENT_PROVIDER=nowpayments  # makes it primary checkout
```

**Verify**:
- `GET /api/health?full=1` → `"nowpayments": {"state": "connected"}`
- Creates payment via `POST /api/jarvis/checkout` → returns NOWPayments payment URL

---

### 6. PayKit (PayKit.io) — Vantage + Launchpad Cohort
**What it does**: Syncs PayKit customers/payments for specific brands

| Env Var | Required | How to Get |
|---------|----------|------------|
| `PAYKIT_VANTAGE_KEY` | For Vantage | PayKit Dashboard → API Keys |
| `PAYKIT_LC_KEY` | For Launchpad Cohort | PayKit Dashboard → API Keys |

**Verify**: Shows in `/finances` under PayKit sections

---

## Communications (Unified Inbox)

### 7. Email (IMAP) — Up to 4 Inboxes
**What it does**: Fetches unread counts, recent threads, sends replies via SMTP

| Env Var | Required | Pattern | Example |
|---------|----------|---------|---------|
| `INBOX_1_HOST` | Yes | `imap.provider.com` | `imap.gmail.com` |
| `INBOX_1_USER` | Yes | Email address | `you@gmail.com` |
| `INBOX_1_PASS` | Yes | App password | `abcd efgh ijkl mnop` |
| `INBOX_1_SMTP_HOST` | No | Defaults to `smtp.` + host | `smtp.gmail.com` |
| `INBOX_1_SMTP_PORT` | No | Defaults to 465 | `465` |

**Repeat for INBOX_2, INBOX_3, INBOX_4**

**Gmail Setup**:
1. Enable 2FA on Google account
2. Generate App Password: Google Account → Security → App Passwords
3. Use that 16-char password as `INBOX_1_PASS`

**Verify**: 
- `GET /api/comms` → shows unread counts per inbox
- `/comms` page → unified inbox with email, Slack, WhatsApp lanes

---

### 8. Slack — Bot Token
**What it does**: Reads channels, posts messages, reacts, thread replies

| Env Var | Required | How to Get |
|---------|----------|------------|
| `SLACK_BOT_TOKEN` | Yes | Slack App → OAuth & Permissions → Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | For webhooks | Slack App → Basic Information |

**Required Scopes**: `channels:read`, `channels:history`, `groups:read`, `groups:history`, `im:read`, `im:history`, `mpim:read`, `mpim:history`, `chat:write`, `reactions:read`, `users:read`

**Verify**: 
- `GET /api/connections` → Slack shows `connected`
- `/comms` → Slack lane with channels/DMs

---

### 9. WhatsApp Business API
**What it does**: Receives inbound messages via webhook, sends outbound

| Env Var | Required | How to Get |
|---------|----------|------------|
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | Meta Business → WhatsApp → Configuration |
| `WHATSAPP_ACCESS_TOKEN` | Yes | Meta Business → WhatsApp → Access Token |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Yes | Your custom verify string |
| `MANYCHAT_WEBHOOK_SECRET` | For DM webhook | ManyChat Settings → API → Secret |

**Webhook URL**: `https://your-domain.com/api/webhooks/manychat`

**Verify**: 
- `GET /api/connections` → WhatsApp shows `connected`
- `/comms` → WhatsApp lane

---

### 10. ManyChat (Instagram DM Automation)
**What it does**: Receives Instagram DM events, powers DM inbox

| Env Var | Required | How to Get |
|---------|----------|------------|
| `MANYCHAT_API_KEY` | Yes | ManyChat → Settings → API |
| `MANYCHAT_WEBHOOK_SECRET` | Yes | ManyChat → Settings → API → Webhook Secret |

**Webhook URL**: `https://your-domain.com/api/webhooks/manychat`

**Verify**: `/social` DM inbox shows Instagram conversations

---

## Social & Growth

### 11. Zernio (Late) — Social Analytics + Publishing
**What it does**: Live follower counts, posting history, post scheduling for IG, TikTok, Twitter, YouTube, LinkedIn

| Env Var | Required | How to Get |
|---------|----------|------------|
| `ZERNIO_API_KEY` | Yes | Zernio/Late Dashboard → Settings → API Key |

**Optional local config** (`~/.founder-os/social.json`):
```json
{
  "accounts": {
    "instagram": { "handle": "@yourhandle", "followers": 10000 },
    "tiktok": { "handle": "@yourhandle", "followers": 5000 }
  }
}
```

**Verify**:
- `GET /api/social` → shows 5 platforms with live follower counts
- `GET /api/social/instagram` → detailed analytics
- `POST /api/social/posts` → schedules a post

---

### 12. Beehiiv — Email List Analytics
**What it does**: Subscriber count, newsletter posts, open/click rates

| Env Var | Required | How to Get |
|---------|----------|------------|
| `BEEHIIV_API_KEY` | Yes | Beehiiv → Settings → API Keys |
| `BEEHIIV_PUBLICATION_ID` | Yes | Beehiiv URL → `pub_xxxxxxxx` |

**Verify**:
- `GET /api/social` → email list card with subscriber count
- `GET /api/health?full=1` → `"beehiiv": {"state": "connected"}`

---

### 13. Postly — Social Scheduling (via Zernio)
**What it does**: Actually publishes posts to platforms (Zernio reads, Postly writes)

| Env Var | Required | How to Get |
|---------|----------|------------|
| `POSTLY_API_KEY` | Yes | Postly Dashboard → Settings → API |

**Used by**: Social Agent cron (18:00 daily) → generates posts → schedules via Postly

---

### 14. Adsmith (Arcads) — UGC Ad Generation
**What it does**: Generates AI UGC video ads for campaigns

| Env Var | Required | How to Get |
|---------|----------|------------|
| `ARCADES_API_KEY` | Yes | Arcads Dashboard → API Key |

**Used by**: Social Agent + Adsmith Creative agent

---

## CRM & Funnel

### 15. Attio — CRM Sync
**What it does**: Pulls companies, people, deals, list entries → funnel pipeline

| Env Var | Required | How to Get |
|---------|----------|------------|
| `ATTIO_API_KEY` | Yes | Attio → Settings → API Keys |
| `FUNNEL_PROVIDER` | No | Set to `attio` (default) or `seed` for testing |

**Verify**:
- `GET /api/funnel` → pipeline stages with real deals
- `/funnel` page → neural flow + radial wheel

---

### 16. GoHighLevel (GHL) — Funnel + Pipeline
**What it does**: Alternative CRM for Vantage/Launchpad Cohort pipelines

| Env Var | Required | How to Get |
|---------|----------|------------|
| `GHL_API_KEY` | Yes | GHL → Settings → Integrations → Private Integration |
| `GHL_LOCATION_ID` | Yes | Sub-account Location ID (from URL: `/v2/location/<id>/`) |

**Verify**: `/funnel` with `?provider=ghl` or `FUNNEL_PROVIDER=ghl`

---

### 17. Trakyo — Revenue Attribution
**What it does**: Attributes revenue to marketing touchpoints

| Env Var | Required | How to Get |
|---------|----------|------------|
| `TRAKYO_API_KEY` | Yes | Trakyo Dashboard → API |

**Verify**: Shows in `/brand-deals` attribution, `/funnel` revenue breakdown

---

## Content & Marketing

### 18. Reelkit — Video Editing Pipeline
**What it does**: Manages editing workflow for social clips

| Env Var | Required | How to Get |
|---------|----------|------------|
| `REELKIT_API_KEY` | Yes | Reelkit Dashboard → API |

**Used by**: Social Agent + Reelkit Editor agent

---

### 19. Renderly — Creative Generation
**What it does**: Generates campaign visuals, product assets

| Env Var | Required | How to Get |
|---------|----------|------------|
| `RENDERLY_API_KEY` | Yes | Renderly Dashboard → API |

**Used by**: Social Agent + Renderly Creative agent

---

### 20. DMFlow — DM Automation
**What it does**: Instagram DM flows, lead capture

| Env Var | Required | How to Get |
|---------|----------|------------|
| `DMFLOW_API_KEY` | Yes | DMFlow Dashboard → API |

---

## AI & LLMs

### 21. Vercel AI Gateway — Agent Chat
**What it does**: Routes agent chat through Vercel's multi-model gateway

| Env Var | Required | How to Get |
|---------|----------|------------|
| `AI_GATEWAY_API_KEY` | Yes | Vercel Dashboard → AI Gateway → API Key |
| `LLM_PROVIDER` | No | `gateway` (default) or `stub` for testing |
| `LLM_MODEL` | No | e.g. `anthropic/claude-sonnet-4-6` |

**Without key**: Agent chat shows "not configured" — no fake responses

**Verify**: `/chats` → pick an agent → chat works with real model

---

### 22. Plaud — Call Recording + Transcription
**What it does**: Ingests Plaud recordings, files transcripts to G-Brain, extracts action items

| Env Var | Required | How to Get |
|---------|----------|------------|
| `PLAUD_API_KEY` | Yes | Plaud App → Profile → API Key |
| `PLAUD_REFRESH_TOKEN` | Yes | Plaud → Developer Settings |
| `FATHOM_API_KEY` | Optional | Fathom → Settings → API Key |

**Cron**: `*/30 * * * *` → `sales-calls-data` agent ingests new recordings

**Verify**: `/plaud/ingest` endpoint, G-Brain gets new docs

---

## Brand Deals

### 21. Notion (Brand Deals Hub Only)
**What it does**: Reads your Brand Deals Hub database for sponsorship pipeline

| Env Var | Required | How to Get |
|---------|----------|------------|
| `NOTION_API_KEY` | Yes | Notion → Settings → Integrations → Internal Integration |
| `NOTION_BRAND_DEALS_SOURCE` | Yes | Data Source ID from Brand Deals Hub database |

**Setup**:
1. Create internal integration in Notion
2. Share Brand Deals Hub database with that integration
3. Copy integration secret → `NOTION_API_KEY`
3. Open database → `...` → Copy link → extract data source ID → `NOTION_BRAND_DEALS_SOURCE`

**Verify**: 
- `GET /api/brand-deals` → live deals from Notion
- `/brand-deals` page → pipeline board with live data
- **No seeded deals** — board is empty until you add deals in Notion

---

## Project Management

### 22. Paperclip (Agent Harness) — Optional
**What it does**: Reads your private agent board (Conductor + workers) for `/org`, `/agents`

| Env Var | Required | How to Get |
|---------|----------|------------|
| `PAPERCLIP_API_URL` | Yes | Your Paperclip board URL |
| `PAPERCLIP_BOARD_KEY` | Yes | Board API key (acts as your user) |
| `PAPERCLIP_COMPANY_ID` | Yes | Company ID on Paperclip |
| `PAPERCLIP_COCKPIT_ISSUE_ID` | Optional | Pinned cockpit issue ID |

**Without**: `/org`, `/agents` show local seed agents only

---

## Jarvis Automation

### 23. Jarvis Local Ingest Auth
**What it does**: Protects `/api/finances/*` and `/api/trading/snapshot` from public access

| Env Var | Required | How to Get |
|---------|----------|------------|
| `JARVIS_LOCAL_INGEST_TOKEN` | For production | `openssl rand -hex 24` |
| `JARVIS_PAYMENT_PROVIDER` | No | `stripe` | `wise` | `nowpayments` (default) |
| `JARVIS_ALLOW_NEGATIVE_WITHDRAWALS` | No | `0` or `1` (default 0) |
| `JARVIS_KILL_SWITCH` | No | `0` (running) or `1` (halt all) |

**Generate token**:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**Loopader CLI** uses same token:
```bash
export LOOPADER_CLI_AUTH_TOKEN=<same_token>
export LOOPADER_CLI_ALLOW_MUTATIONS=1
python loopader-cli.py --confirm-token <token> sync
```

---

## Webhooks (Inbound)

| Webhook | URL | Auth |
|---------|-----|------|
| ManyChat (Instagram DM) | `/api/webhooks/manychat` | `x-manychat-secret` header |
| Stripe | `/api/webhooks/stripe` | Stripe signature |
| WhatsApp | `/api/webhooks/whatsapp` | Meta signature |

---

## Verification Checklist

After adding keys, run through each:

```bash
# 1. Health check
curl http://localhost:4100/api/health?full=1

# 2. Connections board
curl http://localhost:4100/api/connections

# 3. Specific integration
curl http://localhost:4100/api/social          # social
curl http://localhost:4100/api/funnel          # funnel
curl http://localhost:4100/api/jarvis/funding/reconcile?projectId=loopader-bot  # funding
curl http://localhost:4100/api/brain           # G-Brain
```

---

## Adding a New Connector (For Developers)

1. **Create connector module**: `lib/connectors/your-service.ts`
2. **Implement status function**: Returns `ConnectorStatus` (`connected` | `not_configured` | `error`)
3. **Add to registry**: `lib/connectors/index.ts` → `listSystems()`
3. **Add to catalog**: `lib/integrations-catalog.ts` → `INTEGRATIONS` array
4. **Add env vars** to `.env.example` and `.env.docker.example`
5. **Write tests**: `tests/connectors.test.ts` + integration test

**Status function template**:
```typescript
export async function yourServiceStatus(
  env: Record<string, string | undefined> = process.env
): Promise<ConnectorStatus> {
  const key = env.YOUR_API_KEY;
  if (!key) {
    return {
      id: 'your-service',
      name: 'Your Service',
      kind: 'payments', // or 'social', 'orchestration', etc.
      state: 'not_configured',
      detail: 'Set YOUR_API_KEY in .env.local.',
    };
  }
  try {
    const res = await fetch('https://api.your-service.com/health', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      id: 'your-service',
      name: 'Your Service',
      kind: 'payments',
      state: 'connected',
      detail: 'Live data flowing',
    };
  } catch (err) {
    return {
      id: 'your-service',
      name: 'Your Service',
      kind: 'payments',
      state: 'error',
      detail: `Key set but API check failed: ${err.message}`,
    };
  }
}
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `not_configured` but key is set | Env var name mismatch | Check exact spelling in `.env.local` |
| `error` with valid key | Network/permission issue | Check API key scopes, IP allowlist |
| Connector shows `connected` but page empty | No data in source yet | Add data in the external service first |
| `/api/health?full=1` times out | Slow external API | Check `AbortSignal.timeout` in connector |
| Cron not running | `JARVIS_DISABLE_TICK=1` or no schedule | Check `JARVIS_SCHEDULE_INTERVAL_MS` |

---

## Security Notes

- **Never commit `.env.local`** — it's in `.gitignore`
- **Rotate keys** if accidentally exposed
- **Use least-privilege tokens** — only grant scopes the connector needs
- **`JARVIS_LOCAL_INGEST_TOKEN`** protects money/trading endpoints — treat like a password
- **Production**: Set `FOUNDER_OS_ACCESS_TOKEN` to gate the entire app behind a token

---

## Architecture: Why This Works

```
.env.local (your keys)
      ↓
lib/connectors/*.ts (honest status functions)
      ↓
lib/connectors/index.ts (registry)
      ↓
/api/connections → /integrations page (honest badges)
      ↓
Pages read via lib/social, lib/funnel, lib/jarvis/revenue, etc.
      ↓
Real data or honest "not_configured" — never fake numbers
```

**Key principle**: If a key isn't set, the UI tells you exactly what to add. No demo data, no fake green lights, no surprises.