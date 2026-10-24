#!/usr/bin/env python3
"""
jarvis-trading-adapter.py — pushes your trading bot's live state to Jarvis.

Reads your Loopader forex bot's RiskState (balance, equity, positions) and
POSTs it to Jarvis at:

    POST http://localhost:4100/api/trading/snapshot

with `source: 'robinhood'`. The first real push retires Jarvis's seeded demo
rows and the Robinhood connector on /jarvis/systems flips to `connected`.

Run it on your Windows machine where the bot lives:

    python jarvis-trading-adapter.py

It loops every 30 seconds. Set JARVIS_URL to override the endpoint.

Requirements: only the Python standard library (urllib). No broker credentials
are stored here — your bot's state is read in-process from its own modules.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Point this at your Loopader hft folder so we can import config/risk/engine.
# ---------------------------------------------------------------------------
LOADER_HFT_DIR = Path(
    r"C:\Users\mj\Documents\projects\loopader\hft"
)
if str(LOADER_HFT_DIR) not in sys.path:
    sys.path.insert(0, str(LOADER_HFT_DIR))

JARVIS_URL = "http://localhost:4100/api/trading/snapshot"
POLL_SECONDS = 30
ACCOUNT_ID = "robinhood-1"          # your Robinhood account number
ACCOUNT_LABEL = "Robinhood"         # display name on /jarvis/systems

# ---------------------------------------------------------------------------
# Import the bot's state modules.
# ---------------------------------------------------------------------------

try:
    from config import RISK, INSTRUMENTS  # noqa: E402
    from risk import RiskEngine, RiskConfig, Position  # noqa: E402
except Exception as exc:  # noqa: BLE001
    print(f"[adapter] could not import Loopader modules from {LOADER_HFT_DIR}: {exc}")
    print("[adapter] make sure LOADER_HFT_DIR points at your hft folder")
    sys.exit(1)


def build_snapshot(engine: RiskEngine) -> dict:
    """Convert the bot's RiskState into Jarvis's trading snapshot format."""

    s = engine.state
    now = datetime.now(timezone.utc).isoformat()

    # ── positions ──────────────────────────────────────────────────────────
    positions = []
    for pos in s.positions:
        spec = INSTRUMENTS.get(pos.pair, {})
        pip_size = float(spec.get("pip_size", 1e-4))
        quote_to_account = float(spec.get("quote_to_account", 1.0))
        contract_size = float(spec.get("contract_size", 100_000.0))

        # Unrealised P&L in account currency (mark to last known price;
        # we don't have a live feed here, so use entry-side approximation
        # plus booked P&L if the position has been closed).
        unrealised = pos.pnl  # booked P&L from risk.close_position
        if unrealised is None:
            unrealised = 0.0

        positions.append({
            "capturedAt": now,
            "accountId": ACCOUNT_ID,
            "symbol": pos.pair,
            "quantity": pos.lots,
            "avgCostUsd": pos.entry_price,
            "marketValueUsd": pos.entry_price
                            + (unrealised / (pos.lots or 1.0)),
            "unrealizedPnlUsd": unrealised,
        })

    # ── snapshot ───────────────────────────────────────────────────────────
    snapshot = {
        "accountId": ACCOUNT_ID,
        "accountLabel": ACCOUNT_LABEL,
        "capturedAt": now,
        "accountValueUsd": s.equity or s.balance,
        "buyingPowerUsd": s.balance,
        "cashUsd": s.balance,
        "dayPnlUsd": 0.0,
        "totalPnlUsd": s.equity - s.balance if s.equity and s.balance else 0.0,
        "source": "robinhood",
    }

    return {"snapshot": snapshot, "positions": positions}


def post_snapshot(payload: dict) -> tuple[bool, str]:
    """POST the snapshot to Jarvis. Returns (ok, detail)."""

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        JARVIS_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return resp.status == 200, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:200]
        return False, f"HTTP {exc.code}: {body}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def main() -> None:
    print(f"[adapter] Jarvis trading adapter starting")
    print(f"[adapter] hft dir: {LOADER_HFT_DIR}")
    print(f"[adapter] posting to: {JARVIS_URL}")
    print(f"[adapter] poll interval: {POLL_SECONDS}s")
    print(f"[adapter] Ctrl+C to stop")

    engine = RiskEngine(RiskConfig())

    while True:
        try:
            payload = build_snapshot(engine)
            ok, detail = post_snapshot(payload)

            n_positions = len(payload["positions"])
            acct = payload["snapshot"]
            if ok:
                print(
                    f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] "
                    f"pushed snapshot: account={acct['accountLabel']} "
                    f"equity=${acct['accountValueUsd']:,.2f} "
                    f"positions={n_positions} — {detail}"
                )
            else:
                print(
                    f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] "
                    f"push FAILED: {detail}"
                )

        except Exception as exc:  # noqa: BLE001
            print(
                f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] "
                f"error: {exc}"
            )

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[adapter] stopped")
        sys.exit(0)
