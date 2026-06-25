---
phase: 07-standardized-market-data-cache
status: passed
verified_at: 2026-06-26T01:32:04+08:00
verified_by: codex
score: 24/24
requirements:
  - DATA-05
  - DATA-06
  - DATA-08
  - DATA-09
---

# Phase 07 Verification

## Result

Passed. Phase 7 establishes a generation-based normalized market-data cache,
computes front-adjusted prices at read time, safely bootstraps 60 official
trading dates, and preserves usable legacy results until normalized screening
results are published.

## Goal and Must-Haves

- **24/24 plan truths verified.**
- All declared artifacts exist and are used by their intended consumers.
- All declared key links are implemented:
  - generation activation switches one active pointer after 60 paired date
    manifests validate;
  - screening reads normalized raw quotes and factors through the dynamic
    adjustment reader;
  - screening provenance binds chart reads to the same generation;
  - bootstrap mode and result cache source flow through safe DTOs to the
    existing UI.

## Requirements Checked

- **DATA-05:** Raw daily quotes use generation, stock code, and trade date
  natural keys with idempotent UPSERT behavior. Legacy snapshot tables remain
  untouched.
- **DATA-06:** Adjustment factors are stored independently and prices are
  calculated as `raw × factor_at_day / latest_factor_for_stock`. Missing
  factors produce a structured skip and never fall back to raw prices.
- **DATA-08:** With no active generation, manual refresh fetches L/P/D stock
  status, official trading dates, raw daily quotes, and factors for 60 dates.
  Failed builds are deleted; complete builds activate atomically and screen
  immediately.
- **DATA-09:** Existing persisted screening rows remain readable during
  bootstrap or failure. Legacy rows receive one `旧缓存结果` marker, while
  normalized rows remove it.

## Automated Evidence

- `D:\NodeJS\npm.cmd run verify`
  - TypeScript passed.
  - ESLint passed.
  - Vitest: 26 files, 113 tests passed.
  - Next.js production build passed.
- `gsd-sdk query verify.schema-drift 7`
  - `drift_detected: false`
  - `blocking: false`
- Required standard-depth code review completed with status `clean`.
- Full-suite execution includes all existing v1 test files, satisfying the
  cross-phase regression gate.

## Safety and Compatibility

- Provider calls execute outside SQLite write transactions.
- Activation and failed-build cleanup use short transactions.
- Refresh and result DTOs do not expose tokens, database paths, table names,
  generation identifiers, or raw provider payloads.
- Results, chip data, and charts read by exact persisted run IDs, preventing
  cross-run mixing when refresh completion races with a page request.

## Operational Note

Live Tushare/tinyshare permissions and production data volume remain
environment-dependent deployment checks. Mocked provider integration covers
the API shapes and failure boundaries required by this phase; a live-token
smoke run is recommended before production rollout but is not a code-completion
gap.
