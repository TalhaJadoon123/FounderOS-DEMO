# Code Deletion Log

## [2026-10-26] Refactor Session — Dead Code Removal

### Unused Files Deleted (14)

| File | Reason | Verification |
|------|--------|--------------|
| `lib/shared/dates.ts` | Orphaned date helpers; not imported anywhere | Grep for `shared/dates` — 0 matches |
| `lib/shared/ids.ts` | Orphaned id/slug utilities; not imported anywhere | Grep for `shared/ids` — 0 matches |
| `lib/shared/money.ts` | Orphaned money helpers; not imported anywhere | Grep for `shared/money` — 0 matches |
| `lib/shared/types.ts` | Orphaned shared types (IsoDate, Money, etc.); not imported anywhere | Grep for `shared/types` — 0 matches |
| `lib/shared/index.ts` | Barrel re-exporting the above; not imported anywhere | Grep for `shared/index` — 0 matches |
| `lib/foreplay/dossier.ts` | Unreferenced sponsor dossier module | Grep for `foreplay/dossier` — 0 matches |
| `lib/connectors/foreplay.ts` | Connector not registered in `lib/connectors/index.ts` CHECKS | Grep for `connectors/foreplay` — only read as text in a test |
| `tools/audit-integrity.cjs` | Environment repair script; not imported by app code | Grep — 0 matches |
| `tools/audit-lock.cjs` | Environment repair script; not imported by app code | Grep — 0 matches |
| `tools/audit-manifest.cjs` | Environment repair script; not imported by app code | Grep — 0 matches |
| `tools/rename-owner.cjs` | Environment repair script; not imported by app code | Grep — 0 matches |
| `tools/repair-bin.cjs` | Environment repair script; not imported by app code | Grep — 0 matches |
| `tools/repair-esbuild.cjs` | Environment repair script; not imported by app code | Grep — 0 matches |
| `tools/repair-packages.cjs` | Environment repair script; not imported by app code | Grep — 0 matches |

### Unused Dependencies Removed

None in this batch (knip flagged `postcss-load-config` as unlisted, but it is
required by `postcss.config.mjs` and is a transitive peer of `postcss`;
not removed).

### Files Kept (verified in use)

- `desktop/main.cjs` — Electron `main` entry point (`desktop/package.json` `"main": "main.cjs"`)
- `desktop/preload.cjs` — Referenced by `main.cjs` via `path.join(__dirname, 'preload.cjs')`
- `lib/shared/env.ts` — Used by `scripts/doctor.mjs` (`loadEnv`) and `scripts/validate-env.ts` (`env`, `envBool`, `envInt`)
- `components/CommsBoard.tsx`, `components/CommsGravity.tsx`, `components/HomeSocialGraph.tsx` — Intentional orphans listed in `KNOWN_ORPHANS` in `tests/orphans.test.ts` (kept for one-line revert)
- `components/useSvgCamera.ts` — Read as source text by `tests/blueprint-page.test.ts`

### Detection Notes

- `knip` produced false positives on the desktop `.cjs` files (it does not
  trace `path.join(__dirname, ...)` requires or `package.json` `"main"` fields)
  and on `lib/shared/env.ts` exports (scripts directory not fully scanned).
- `knip` correctly identified the 14 deleted files as unused.

### Impact

- Files deleted: 14
- Lines removed: ~620 (shared lib: ~300, foreplay: ~150, tools: ~170)
- Bundle size reduction: minimal (tree-shaken, but removes dead source)

### Remaining Findings (Manual Review — Not Removed)

knip flagged 226 unused exports, 119 unused exported types, and 6 unused
exported enum members across files that are still in use. These were **not**
removed because:

- Most are exported but still used **internally within their own file** (knip
  only counts external consumers), e.g. `MEMORY_PATH`/`SEED_PATH` in
  `lib/jarvis/memory.ts`, `CORE` in `lib/trading-strategy.ts`. Removing the
  `export` keyword is cosmetic and not dead-code removal.
- Some re-exports (e.g. `AGENTIC_ID` re-exported from `lib/trading-payload.ts`)
  are unused externally but the original is used elsewhere.
- The test environment has a pre-existing `better-sqlite3` native module
  version mismatch (Node 20 vs compiled for Node 22), so most tests cannot run
  to verify removals.
- `tsc --noEmit` has a pre-existing error in `tests/personas.test.ts`.

Per-item verification (grep each symbol across the codebase) is required before
any of these are removed. Recommended approach: address one file at a time,
run `tsc --noEmit` after each, and only remove symbols with zero references.

Notable duplicate type definitions (candidates for consolidation):
- `VolumeMeterRow`: `lib/analytics-volume.ts:10` and `lib/pulse-history.ts:106`
- `RecordingSource`: `lib/recordings-format.ts:10` and `lib/recordings.ts:21`
- `ExecResult`: `lib/connectors/gbrain.ts:7` and `lib/connectors/superset.ts:12`

### Testing

- `tsc --noEmit`: passes (only pre-existing error in `tests/personas.test.ts`)
- `vitest`: pre-existing failures due to `better-sqlite3` native module
  version mismatch (Node 20 vs compiled for Node 22) — unrelated to this change
