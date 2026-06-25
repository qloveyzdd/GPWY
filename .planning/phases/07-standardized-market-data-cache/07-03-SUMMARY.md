---
phase: 07-standardized-market-data-cache
plan: "07-03"
subsystem: refresh-workflow
tags: [tushare, trade-calendar, bootstrap, refresh-job, generation]

requires:
  - phase: 07-standardized-market-data-cache
    plan: "07-02"
    provides: "Active-generation screening and exact-source result provenance"
provides:
  - "Trade-calendar-based acquisition of L/P/D stocks, raw daily quotes, and independent factors"
  - "Restart-from-zero 60-day bootstrap with per-date manifest updates"
  - "Automatic first-refresh bootstrap and immediate normalized screening"
  - "Durable bootstrap/ordinary refresh mode with active-generation recovery"
affects: [refresh-ui, incremental-refresh, provider-concurrency]

tech-stack:
  added: []
  patterns:
    - "Provider requests remain serial and outside SQLite transactions"
    - "Manual refresh chooses bootstrap only when no active normalized generation exists"

key-files:
  created:
    - src/lib/refresh/bootstrap-market-data.ts
    - tests/refresh/bootstrap-market-data.test.ts
  modified:
    - src/lib/tushare/endpoints.ts
    - src/lib/refresh/fetch-refresh-data.ts
    - src/lib/refresh/refresh-types.ts
    - src/lib/refresh/refresh-store.ts
    - src/lib/refresh/refresh-runner.ts
    - tests/refresh/fetch-refresh-data.test.ts
    - tests/refresh/refresh-runner.test.ts
    - tests/ui/status-workspace.test.tsx

key-decisions:
  - "Use trade_cal as the sole source of target market dates; do not infer trading days from empty daily responses."
  - "Persist refresh mode on refresh_jobs so bootstrap status remains stable after generation activation."
  - "When an active generation exists, Phase 7 reruns screening without downloading market data; Phase 9 will replace this with incremental acquisition."

patterns-established:
  - "Each date progresses pending -> daily succeeded -> paired succeeded before activation."
  - "Any pre-activation error deletes the entire building generation and the next run creates a new id."

requirements-completed: [DATA-08]

duration: 11 min
completed: 2026-06-26
---

# Phase 07 Plan 03: Safe 60-Day Bootstrap Summary

**The first manual refresh now rebuilds 60 official market dates from Tushare raw data, atomically activates the generation, and immediately publishes normalized screening results.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-26T01:06:33+08:00
- **Completed:** 2026-06-26T01:17:00+08:00
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `trade_cal` acquisition and separate serial fetch helpers for L/P/D stocks, raw daily quotes, and adjustment factors.
- Added a bootstrap orchestrator that writes date-level manifest states, validates exactly 60 paired dates, and deletes failed builds.
- Changed the default manual refresh to bootstrap automatically when no active normalized generation exists.
- Preserved the single-running-job lock, immediate screening, sanitized failures, and non-fatal chip enrichment.
- Added an active-generation recovery path that reruns screening without redownloading market data.

## Task Commits

1. **Task 1 RED: Define raw provider and trade-calendar contract** - `62379ad` (`test`)
2. **Task 1 GREEN: Implement raw provider fetch helpers** - `294f609` (`feat`)
3. **Task 2 RED: Define bootstrap activation and cleanup behavior** - `8071dc8` (`test`)
4. **Task 2 GREEN: Implement safe 60-day bootstrap** - `7be7d2a` (`feat`)
5. **Task 3: Integrate bootstrap with manual refresh and screening** - `535b2a7` (`feat`)

## Files Created/Modified

- `src/lib/tushare/endpoints.ts` - Adds official trade calendar endpoint fields.
- `src/lib/refresh/fetch-refresh-data.ts` - Maps stock statuses, target dates, raw quotes, and factors separately.
- `src/lib/refresh/bootstrap-market-data.ts` - Orchestrates serial fetch, manifest persistence, activation, and cleanup.
- `src/lib/refresh/refresh-types.ts` - Adds bootstrap/ordinary refresh mode.
- `src/lib/refresh/refresh-store.ts` - Persists refresh mode with an additive migration.
- `src/lib/refresh/refresh-runner.ts` - Automatically selects bootstrap or active-generation recovery.
- `tests/refresh/fetch-refresh-data.test.ts` - Covers trade calendar, raw price preservation, statuses, and retries.
- `tests/refresh/bootstrap-market-data.test.ts` - Covers 60/59 dates, provider failure, write failure, cleanup, and restart.
- `tests/refresh/refresh-runner.test.ts` - Covers automatic bootstrap, immediate screening, and active-generation reuse.
- `tests/ui/status-workspace.test.tsx` - Updates refresh fixtures for durable mode.

## Decisions Made

- Full-market request success is represented by the date manifest, not by requiring every stock to have a row.
- The active generation remains valid if screening fails after activation; the next manual refresh retries screening against it.
- Custom injected workers remain ordinary-mode compatibility hooks for existing workflow tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added durable refresh mode to refresh_jobs**
- **Found during:** Task 3
- **Issue:** Deriving bootstrap mode from active-generation existence would change the UI state to ordinary immediately after activation while screening was still running.
- **Fix:** Added an additive `refresh_jobs.mode` column and exposed it through safe refresh status.
- **Files modified:** `src/lib/refresh/refresh-store.ts`, `src/lib/refresh/refresh-types.ts`, `tests/ui/status-workspace.test.tsx`
- **Verification:** Refresh runner/store/UI tests and type checking pass.
- **Committed in:** `535b2a7`

**Total deviations:** 1 auto-fixed missing-critical issue. **Impact:** Bootstrap status remains stable and restart-safe; no scope expansion beyond the approved state requirement.

## Issues Encountered

- The previous provider worker test assumed a one-day legacy snapshot. It was replaced with a real 60-date normalized bootstrap test matching the new contract.

## User Setup Required

None - existing `TUSHARE_TOKEN` configuration is reused.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/fetch-refresh-data.test.ts tests/refresh/bootstrap-market-data.test.ts tests/refresh/refresh-runner.test.ts tests/screening/screening-runner.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/refresh tests/refresh tests/screening/screening-runner.test.ts`

All 22 focused tests, type checking, and focused lint passed.

## Next Phase Readiness

Ready for Plan 07-04 to expose exact bootstrap copy and label persisted legacy results without changing table interactions.

---
*Phase: 07-standardized-market-data-cache*
*Completed: 2026-06-26*
