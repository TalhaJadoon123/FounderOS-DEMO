#!/usr/bin/env python3
"""
jarvis-mt5-adapter.py — push MT5 demo account state to Jarvis.

Connects to your Loopader MT5 bridge TCP server (mt5_bridge.py on port 5555),
verifies the bridge is alive via a ping, reads your forex bot's live account
state from the Loopader RiskEngine, and posts it to Jarvis:

    POST http://localhost:4100/api/trading/snapshot     (account snapshot)
    POST http://localhost:4100/api/jarvis/funding/webhook  (trade P&L)

with source: 'mt5' / 'trade_pnl'. The first real push retires Jarvis's seeded
demo rows and the Robinhood connector on /jarvis/systems flips to `connected`.

Prerequisites:
  1. MT5 terminal running, logged into your demo account
  2. LoopaderBridge.mq5 EA attached to a chart (AlgoTrading enabled)
  3. mt5_bridge.py running: python mt5_bridge.py --port 5555
  4. Jarvis running: pnpm run dev  (or docker)

Run:
    python scripts/jarvis-mt5-adapter.py

Standard library only (urllib, socket, struct, json).
"""

from __future__ import annotations

import json
import socket
import struct
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Path to your Loopader hft folder (so we can import config/risk modules).
# ---------------------------------------------------------------------------
LOADER_HFT_DIR = Path(
    r"C:\Users\mj\Documents\projects\loopader\hft\forex_bot"
)
if str(LOADER_HFT_DIR) not in sys.path:
    sys.path.insert(0, str(LOADER_HFT_DIR))

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MT5_BRIDGE_HOST = "127.0.0.1"
MT5_BRIDGE_PORT = 5555
JARVIS_SNAPSHOT_URL = "http://localhost:4100/api/trading/snapshot"
JARVIS_WEBHOOK_URL = "http://localhost:4100/api/jarvis/funding/webhook"
JARVIS_INGEST_TOKEN = None  # set JARVIS_LOCAL_INGEST_TOKEN env to enable auth
POLL_SECONDS = 30
ACCOUNT_ID = "mt5-demo-1"
ACCOUNT_LABEL = "MT5 Demo Account"
MAGIC = 123456  # must match the magic the EA trades with


# ---------------------------------------------------------------------------
# MT5 bridge TCP client (length-prefixed JSON framing)
# ---------------------------------------------------------------------------

class Mt5BridgeClient:
    """Minimal TCP client for the Loopader MT5 bridge."""

    HEADER_FMT = "!I"  # 4-byte big-endian unsigned int
    HEADER_SIZE = struct.calcsize(HEADER_FMT)

    def __init__(self, host: str, port: int, timeout: float = 5.0):
        self.host = host
        self.port = port
        self.timeout = timeout

    def _send_recv(self, payload: dict) -> dict | None:
        """Send one JSON request, read one JSON response."""
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        try:
            with socket.create_connection(
                (self.host, self.port), timeout=self.timeout
            ) as sock:
                sock.settimeout(self.timeout)
                sock.sendall(struct.pack(self.HEADER_FMT, len(data)))
                sock.sendall(data)

                # Read 4-byte length header
                hdr = b""
                while len(hdr) < self.HEADER_SIZE:
                    chunk = sock.recv(self.HEADER_SIZE - len(hdr))
                    if not chunk:
                        return None
                    hdr += chunk
                (length,) = struct.unpack(self.HEADER_FMT, hdr)
                if length == 0 or length > 1 << 20:
                    return None

                # Read body
                body = b""
                while len(body) < length:
                    chunk = sock.recv(length - len(body))
                    if not chunk:
                        return None
                    body += chunk
                return json.loads(body.decode("utf-8"))
        except (ConnectionRefusedError, socket.timeout, OSError, json.JSONDecodeError):
            return None

    def ping(self) -> bool:
        """Return True if the bridge answers a ping request."""
        resp = self._send_recv({"action": "ping", "id": 1})
        return resp is not None and resp.get("success") is True


# ---------------------------------------------------------------------------
# Jarvis HTTP helpers
# ---------------------------------------------------------------------------

def jarvis_post(url: str, payload: dict) -> tuple[bool, str]:
    """POST JSON to a Jarvis endpoint. Returns (ok, detail)."""
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if JARVIS_INGEST_TOKEN:
        headers["Authorization"] = f"Bearer {JARVIS_INGEST_TOKEN}"
    req = urllib.request.Request(
        url,
        data=data,
        headers=headers,
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


# ---------------------------------------------------------------------------
# Snapshot + P&L builders
# ---------------------------------------------------------------------------

try:
    from config import RISK, INSTRUMENTS  # noqa: E402
    from risk import RiskEngine, RiskConfig, Position  # noqa: E402
except Exception as exc:  # noqa: BLE001
    print(f"[adapter] could not import Loopader modules from {LOADER_HFT_DIR}: {exc}")
    RISK = None
    INSTRUMENTS = {}
    RiskEngine = None
    RiskConfig = None


def build_snapshot() -> dict | None:
    """Build a Jarvis trading snapshot from the Loopader RiskEngine state."""

    if RiskEngine is None or RiskConfig is None:
        return None

    engine = RiskEngine(RiskConfig())
    s = engine.state
    now = datetime.now(timezone.utc).isoformat()

    # ── positions ──────────────────────────────────────────────────────────
    positions = []
    for pos in s.positions:
        spec = INSTRUMENTS.get(pos.pair, {})
        unrealised = float(pos.pnl or 0.0)
        positions.append({
            "capturedAt": now,
            "accountId": ACCOUNT_ID,
            "symbol": pos.pair,
            "quantity": float(pos.lots),
            "avgCostUsd": float(pos.entry_price),
            "marketValueUsd": float(pos.entry_price)
                              + (unrealised / (pos.lots or 1.0)),
            "unrealizedPnlUsd": unrealised,
        })

    # ── snapshot ───────────────────────────────────────────────────────────
    equity = float(s.equity or s.balance or 0.0)
    balance = float(s.balance or 0.0)
    return {
        "snapshot": {
            "accountId": ACCOUNT_ID,
            "accountLabel": ACCOUNT_LABEL,
            "capturedAt": now,
            "accountValueUsd": equity,
            "buyingPowerUsd": balance,
            "cashUsd": balance,
            "dayPnlUsd": 0.0,
            "totalPnlUsd": equity - balance if equity and balance else 0.0,
            "source": "mt5",
        },
        "positions": positions,
    }


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    # Read token from env at runtime (not import time, so `export` works).
    global JARVIS_INGEST_TOKEN
    JARVIS_INGEST_TOKEN = __import__("os").environ.get("JARVIS_LOCAL_INGEST_TOKEN")

    print("[adapter] Jarvis MT5 adapter starting")
    print(f"[adapter] MT5 bridge: {MT5_BRIDGE_HOST}:{MT5_BRIDGE_PORT}")
    print(f"[adapter] Jarvis snapshot: {JARVIS_SNAPSHOT_URL}")
    print(f"[adapter] Jarvis webhook: {JARVIS_WEBHOOK_URL}")
    print(f"[adapter] Ingest auth: {'on' if JARVIS_INGEST_TOKEN else 'off (dev only)'}")
    print(f"[adapter] Poll interval: {POLL_SECONDS}s")
    print(f"[adapter] Ctrl+C to stop")

    bridge = Mt5BridgeClient(MT5_BRIDGE_HOST, MT5_BRIDGE_PORT)
    last_balance = None  # track balance delta to detect realized P&L

    while True:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")

        # 1. Verify MT5 bridge is alive
        alive = bridge.ping()
        if not alive:
            print(f"[{ts}] MT5 bridge not responding — is mt5_bridge.py running?")
            time.sleep(POLL_SECONDS)
            continue

        # 2. Build and push snapshot
        try:
            payload = build_snapshot()
            if payload is None:
                print(f"[{ts}] could not build snapshot (Loopader modules missing)")
                time.sleep(POLL_SECONDS)
                continue

            ok, detail = jarvis_post(JARVIS_SNAPSHOT_URL, payload)
            acct = payload["snapshot"]
            n_positions = len(payload["positions"])
            if ok:
                print(
                    f"[{ts}] snapshot: {acct['accountLabel']} "
                    f"equity=${acct['accountValueUsd']:,.2f} "
                    f"balance=${acct['buyingPowerUsd']:,.2f} "
                    f"positions={n_positions} — {detail}"
                )
            else:
                print(f"[{ts}] snapshot FAILED: {detail}")

            # 3. Detect realized P&L from balance change and post to webhook
            current_balance = acct["buyingPowerUsd"]
            if last_balance is not None:
                delta = current_balance - last_balance
                if abs(delta) >= 0.01:  # ignore sub-cent noise
                    pnl_payload = {
                        "projectId": ACCOUNT_ID,
                        "amountCents": round(delta * 100),
                        "currency": "USD",
                        "reference": f"mt5-{int(datetime.now(timezone.utc).timestamp())}",
                        "symbol": "MT5",
                        "note": f"Realized P&L from MT5 demo account (balance {last_balance:.2f} -> {current_balance:.2f})",
                    }
                    pok, pdetail = jarvis_post(JARVIS_WEBHOOK_URL, pnl_payload)
                    if pok:
                        print(
                            f"[{ts}] trade P&L: ${delta:+,.2f} — {pdetail}"
                        )
                    else:
                        print(f"[{ts}] trade P&L FAILED: {pdetail}")
            last_balance = current_balance

        except Exception as exc:  # noqa: BLE001
            print(f"[{ts}] error: {exc}")

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[adapter] stopped")
        sys.exit(0)
