---
phase: 12-decay-based-chip-distribution-model
plan: "12-01"
subsystem: data
tags: [tushare, sqlite, market-cache, turnover, adjustment-factor]
requires:
  - phase: 07-standardized-market-data-cache
    provides: market generation cache and read-time adjustment pattern
provides:
  - daily amount fetch support from Tushare `daily`
  - daily basic turnover fetch and cache support
  - adjusted chip model bar reader with average price and turnover
affects: [chip-model, chip-model-runner, refresh, screening]
tech-stack:
  added: []
  patterns:
    - "Best-effort daily_basic refresh: missing turnover does not block base screening"
key-files:
  created: []
  modified:
    - src/lib/tushare/endpoints.ts
    - src/lib/refresh/fetch-refresh-data.ts
    - src/lib/refresh/market-data-types.ts
    - src/lib/refresh/market-data-store.ts
    - src/lib/refresh/market-data-reader.ts
    - src/lib/refresh/bootstrap-market-data.ts
    - src/lib/refresh/incremental-market-data.ts
    - tests/refresh/fetch-refresh-data.test.ts
    - tests/refresh/market-data-store.test.ts
    - tests/refresh/market-data-reader.test.ts
    - tests/refresh/bootstrap-market-data.test.ts
    - tests/refresh/refresh-runner.test.ts
key-decisions:
  - "daily_basic is cached best-effort and does not block base screening; missing turnover is handled later as calculated distribution unavailable."
  - "Raw daily amount is optional in legacy cache rows but required and validated for newly fetched Tushare daily records."
patterns-established:
  - "Model-specific market reader returns adjusted OHLC, adjusted averagePrice, turnoverRate, amount, and adjFactor without changing screening reader behavior."
requirements-completed: [DATA-11, DATA-12, CMOD-02, CMOD-03, CMOD-04, VAL-01]
duration: 18 min
completed: 2026-07-01
---

# Phase 12 Plan 12-01: Market Model Input Summary

**Market cache now carries amount and turnover data, with a model-specific adjusted reader for chip distribution calculations.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-01T10:10:00+08:00
- **Completed:** 2026-07-01T10:28:00+08:00
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added Tushare `daily.amount` and `daily_basic` turnover fetch support.
- Added SQLite cache support for daily amount and daily basic turnover records.
- Added `readAdjustedChipModelBarsForStock()` for复权一致模型输入，包含 averagePrice 和 turnoverRate。
- Wired bootstrap and incremental refresh to persist daily basic data as best-effort enrichment.
- Preserved base screening behavior when daily basic data is missing.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED:** `49fdd37` test — failing fetch/type tests for amount and daily_basic.
2. **Task 1 GREEN:** `a1be1a0` feat — Tushare endpoint, mapper, and result support.
3. **Task 2 RED:** `496f82e` test — failing cache tests for amount and turnover basics.
4. **Task 2 GREEN:** `9f04e3e` feat — SQLite amount column and `market_daily_basics` table.
5. **Task 3 RED:** `5049b8b` test — failing model reader tests.
6. **Task 3 GREEN:** `c9eec88` feat — adjusted chip model reader.
7. **Plan deviation fix:** `60737cc` feat — persist turnover during refresh and update focused tests.

## Files Created/Modified

- `src/lib/tushare/endpoints.ts` — Added `daily.amount` and `daily_basic` endpoint fields.
- `src/lib/refresh/fetch-refresh-data.ts` — Added daily basic fetch and validated amount/turnover mapping.
- `src/lib/refresh/market-data-types.ts` — Added amount and daily basic record types.
- `src/lib/refresh/market-data-store.ts` — Added amount migration and daily basic read/write cache.
- `src/lib/refresh/market-data-reader.ts` — Added adjusted chip model bar reader.
- `src/lib/refresh/bootstrap-market-data.ts` — Persists daily basic data during bootstrap.
- `src/lib/refresh/incremental-market-data.ts` — Backfills missing daily basic data during incremental refresh.
- `tests/refresh/*.test.ts` — Added and updated focused coverage.

## Decisions Made

- daily basic failures do not fail market generation activation or screening; model computation reports missing turnover later.
- Existing cache rows without `amount` remain readable; fetched Tushare daily rows must contain valid `amount`.
- `turnover_rate_f` is preferred; if null, model reader falls back to `turnover_rate`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Refresh paths did not persist daily_basic**

- **Found during:** Task 3 verification
- **Issue:** Fetch and store layers supported daily basic, but bootstrap/incremental refresh would not write it, so real model reads would still fail with missing turnover.
- **Fix:** Added best-effort daily basic persistence to bootstrap and incremental refresh.
- **Files modified:** `src/lib/refresh/bootstrap-market-data.ts`, `src/lib/refresh/incremental-market-data.ts`, `tests/refresh/bootstrap-market-data.test.ts`, `tests/refresh/refresh-runner.test.ts`
- **Verification:** Focused refresh tests, typecheck, and lint passed.
- **Committed in:** `60737cc`

**Total deviations:** 1 auto-fixed missing-critical issue.
**Impact on plan:** Required for correctness; does not expand feature scope beyond Phase 12 data prerequisites.

## Issues Encountered

- Existing bootstrap scheduler test assumed 60 dates and two provider calls per date. Adding daily basic increased calls, so the test was narrowed to 4 dates while preserving the same concurrency assertion.
- Store generation validation had a pre-existing hardcoded `60`; changed to use `targetTradeDateCount`, which matches existing configurable API behavior.

## User Setup Required

None - no external service configuration required.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/fetch-refresh-data.test.ts tests/refresh/market-data-store.test.ts tests/refresh/market-data-reader.test.ts tests/refresh/bootstrap-market-data.test.ts tests/refresh/refresh-runner.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/tushare src/lib/refresh tests/refresh`

All passed.

## Next Phase Readiness

Plan 12-02 can implement the pure chip decay model using `readAdjustedChipModelBarsForStock()` as its market input contract.

---
*Phase: 12-decay-based-chip-distribution-model*
*Completed: 2026-07-01*
