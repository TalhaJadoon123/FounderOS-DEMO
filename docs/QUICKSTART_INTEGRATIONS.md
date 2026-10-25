# Quick-Start: Making Integrations Live

> **One page per integration** — copy the env vars, add to `.env.local`, restart, verify.

---

## Priority Order (Recommended)

### 1. Core (Do First)
| Integration | Env Vars | Verify |
|-------------|----------|--------|
| **Stripe** | `STRIPE_SECRET_KEY` | `/api/health?full=1` → stripe connected |
| **G-Brain** | `GBRAIN_STORE`, `GBRAIN_BIN` | `/api/brain` → page count > 0 |
| **Email (IMAP)** | `INBOX_1_HOST`, `INBOX_1_USER`, `INBOX_1_PASS` | `/api/comms` → unread count > 0 |

### 2. Communications
| Integration | Env Vars | Verify |
|-------------|----------|--------|
| **Slack** | `SLACK_BOT_TOKEN` | `/api/connections` → slack connected |
| **WhatsApp** | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `/api/connections` → whatsapp connected |
| **ManyChat** | `MANYCHAT_API_KEY`, `MANYCHAT_WEBHOOK_SECRET` | `/social` → DM inbox loads |

### 3. Social & Growth
| Integration | Env Vars | Verify |
|-------------|----------|--------|
| **Zernio** | `ZERNIO_API_KEY` | `/api/social` → 5 platforms with followers |
| **Beehiiv** | `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` | `/api/social` → email list shows subscribers |
| **Postly** | `POSTLY_API_KEY` | `POST /api/social/posts` → post queued |

### 4. CRM & Funnel
| Integration | Env Vars | Verify |
|-------------|----------|--------|
| **Attio** | `ATTIO_API_KEY` | `/api/funnel` → pipeline stages with deals |
| **GHL** | `GHL_API_KEY`, `GHL_LOCATION_ID` | `/api/funnel?provider=ghl` → pipeline |

### 5. Brand Deals
| Integration | Env Vars | Verify |
|-------------|----------|--------|
| **Notion (Brand Deals)** | `NOTION_API_KEY`, `NOTION_BRAND_DEALS_SOURCE` | `/brand-deals` → live pipeline from Notion |

### 6. AI & Content
| Integration | Env Vars | Verify |
|-------------|----------|--------|
| **Vercel AI Gateway** | `AI_GATEWAY_API_KEY` | `/chats` → agent chat works |
| **Plaud** | `PLAUD_API_KEY`, `PLAUD_REFRESH_TOKEN` | `/plaud/ingest` → recordings ingested |
| **Arcads** | `ARCADES_API_KEY` | Social Agent → ad generation works |

### 7. Bot / Trading
| Integration | Env Vars | Verify |
|-------------|----------|--------|
| **Loopader/MT5** | `JARVIS_LOCAL_INGEST_TOKEN` (in bot) | `/api/trading` → real MT5 account |

---

## Minimal `.env.local` Template

```bash
# Core
STRIPE_SECRET_KEY=sk_live_...
GBRAIN_STORE=/path/to/your/brain-store
GBRAIN_BIN=/usr/local/bin/gbrain

# Email (Gmail example)
INBOX_1_HOST=imap.gmail.com
INBOX_1_USER=you@gmail.com
INBOX_1_PASS=abcd efgh ijkl mnop  # Gmail App Password

# Communications
SLACK_BOT_TOKEN=xoxb-...
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token
MANYCHAT_API_KEY=...
MANYCHAT_WEBHOOK_SECRET=...

# Social
ZERNIO_API_KEY=...
BEEHIIV_API_KEY=...
BEEHIIV_PUBLICATION_ID=pub_...
POSTLY_API_KEY=...

# CRM
ATTIO_API_KEY=...

# Brand Deals
NOTION_API_KEY=secret_...
NOTION_BRAND_DEALS_SOURCE=...

# AI
AI_GATEWAY_API_KEY=...

# Plaud
PLAUD_API_KEY=...
PLAUD_REFRESH_TOKEN=...

# Jarvis
JARVIS_LOCAL_INGEST_TOKEN=fa569f30bf41587ae6a6757212c1e3d5a6b9666d74d85cba
JARVIS_PAYMENT_PROVIDER=stripe
```

---

## Verify All at Once

```bash
# Health check (shows all connectors)
curl http://localhost:4100/api/health?full=1 | jq .

# Connections board
curl http://localhost:4100/api/connections | jq .

# Specific pages
curl http://localhost:4100/api/social | jq .
curl http://localhost:4100/api/funnel | jq .
curl http://localhost:4100/api/trading | jq .
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| "Key set but API check failed" | Check API key scopes/permissions |
| "not_configured" but key in `.env.local` | Restart dev server (`pnpm run dev`) |
| Gmail "invalid credentials" | Use **App Password**, not login password |
| Slack "missing scope" | Add all required scopes in Slack App config |
| Notion "object not found" | Share database with the integration |

---

## Next Steps

1. **Start with Stripe + G-Brain + Email** — core trio
2. **Add Slack + WhatsApp** — comms working
3. **Add Zernio + Beehiiv** — social live
4. **Add Attio/Notion** — funnel + brand deals live
4. **Add AI Gateway** — agent chat working
5. **Add MT5 bridge** — trading real

Each integration is independent — add one, verify, move to next.