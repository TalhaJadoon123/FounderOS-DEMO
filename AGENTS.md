# AI Agent Context for Founder OS

This file provides context for AI agents (GitHub Copilot, Cursor, OpenCode, etc.)
working on the Founder OS codebase.

## Project Overview

**Founder OS** is a personal operating system for a one-person business: a live
web command center that runs your company as a set of AI-assisted departments.

Unified comms, client funnel, social growth, finances, knowledge graph, and a
roster of named AI agents that each own a real job. Demo ships seeded with
realistic placeholder data — no accounts, no API keys, nothing to configure.

**Jarvis** — the autonomous team layer — watches, verifies, ships, announces,
sells and reports across projects you connect in `/jarvis/settings`.

## Architecture

```
app/                 Next.js App Router (pages + API routes)
components/          UI primitives (Slab kit, motion, pressable)
lib/
  shared/            Zero-dependency utilities: env, dates, money, ids
  data.ts            App DB singleton (better-sqlite3, seeded on first touch)
  db.ts              Repository layer + typed repositories (~2000 lines)
  seed.ts            All seeded demo content (idempotent re-seed)
  schemas.ts         Zod schemas validated at every DB/API boundary
  connectors/        20+ honest-status integrations
  agents/            Agent registry + runtimes
  jarvis/            Autonomous team: policy, orchestrator, executor, actions,
                     discovery, memory, audit, metrics
scripts/             doctor.mjs, validate-env.ts, postinstall.mjs, seed.ts
tests/               Vitest suite (one file per module)
```

**Dependency rule**: `lib/shared → lib/db → lib/agents → lib/jarvis → app/` (no cycles)

## Key Files for Agents

| File | Purpose |
|------|---------|
| `README.md` | Full architecture, run/deploy, env vars, API ref, testing |
| `lib/shared/env.ts` | Zero-dependency .env loading |
| `lib/shared/dates.ts` | UTC-anchored date helpers |
| `lib/shared/money.ts` | Money helpers (cents, parse bank formats) |
| `lib/shared/ids.ts` | Prefixed id generation (`jrv_...`) |
| `lib/db.ts` | Repository layer (~2000 lines, all I/O) |
| `lib/jarvis/policy.ts` | Kill switch, autonomy, approval rules |
| `lib/jarvis/orchestrator.ts` | watch→verify→ship→announce→sell→report |
| `lib/jarvis/executor.ts` | Deploy hook, Slack/Resend, Stripe, local actions |
| `lib/jarvis/actions.ts` | Governed local actions with allowlist |
| `lib/jarvis/discovery.ts` | Scan local drives for projects |
| `lib/jarvis/memory.ts` | Human-readable memory.md |
| `lib/jarvis/audit.ts` | Append-only JSONL audit trail |
| `scripts/doctor.mjs` | End-to-end health check |
| `scripts/validate-env.ts` | Fail-fast env validation |
| `vitest.config.ts` | Path aliases, 2 workers, 60s timeout |

## Coding Conventions

### TypeScript
- **Strict mode** (`tsconfig.json`)
- No `any` — use `unknown` + type guards
- `readonly` for immutable arrays/objects
- Interfaces for object shapes, types for unions/primitives

### Pure Functions (lib/shared)
- **No I/O** — no DB, network, filesystem, timers
- **Deterministic** — same input = same output
- **Testable** — no mocking needed

### Jarvis Autonomy
- `observe` — watches, never acts
- `assisted` — proposes, you decide (default)
- `autopilot` — acts on low-risk, asks on money/high-risk
- Money (checkout, price_change) and high-risk always need your explicit yes
- Kill switch: `JARVIS_KILL_SWITCH=1` halts everything

## Running

```bash
pnpm install          # creates .env.local from .env.example
pnpm run dev          # http://localhost:4100
pnpm run doctor       # end-to-end health check
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest suite
pnpm run build        # production build
pnpm run start        # serve production build
```
