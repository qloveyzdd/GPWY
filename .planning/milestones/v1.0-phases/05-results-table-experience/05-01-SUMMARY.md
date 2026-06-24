---
phase: 05-results-table-experience
plan: "05-01"
subsystem: ui
tags: [react, nextjs, sqlite, results-table]
requires:
  - phase: 03-downtrend-screening-engine
    provides: persisted screening runs and matched stock rows
  - phase: 04-chip-peak-integration
    provides: persisted chip peak runs and per-stock chip peak states
provides:
  - typed latest results snapshot joining screening rows with matching chip peak rows
  - protected workspace results table with required stock columns
  - tests for snapshot state, stale chip joins, and required table rendering
affects: [phase-06-charts, results-ui, status-workspace]
tech-stack:
  added: []
  patterns:
    - server-side snapshot helper for UI-ready persisted data
    - focused results component under src/components/results
key-files:
  created:
    - src/lib/results/results-types.ts
    - src/lib/results/results-snapshot.ts
    - src/components/results/results-table.tsx
    - tests/results/results-snapshot.test.ts
    - tests/ui/results-table.test.tsx
  modified:
    - src/app/page.tsx
    - src/components/status/status-workspace.tsx
key-decisions:
  - "Join chip peak data only when the latest chip peak run references the latest screening run id."
  - "Represent abnormal succeeded-without-price chip rows as missing instead of exposing an invalid UI state."
patterns-established:
  - "Results UI consumes a typed ResultsSnapshot instead of recomputing or joining persisted data inside React."
  - "Chip peak unavailable states are row-level labels and do not hide matched screening rows."
requirements-completed: [UI-01, UI-02]
duration: 4 min
completed: 2026-06-23
---

# Phase 05 Plan 01: Latest Results Snapshot And Required Columns Summary

**Server-side persisted results snapshot with a required-column stock table in the protected workspace**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-23T21:25:00+08:00
- **Completed:** 2026-06-23T21:29:10+08:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `readLatestResultsSnapshot()` to read the latest screening run/results and join only matching chip peak runs.
- Added explicit row-level chip states: `available`, `blocked`, `failed`, and `missing`.
- Rendered the latest results table in `StatusWorkspace` with stock code, name, current price, interval high, current/high ratio, drawdown, and chip peak price/state.
- Added unit and component tests for result snapshot behavior and required table rendering.

## Task Commits

1. **Tasks 1-3: Latest results snapshot and required table rendering** - `85d91b5` (feat)

## Files Created/Modified

- `src/lib/results/results-types.ts` - Defines `ResultsSnapshot`, `ResultRow`, and empty snapshot constants.
- `src/lib/results/results-snapshot.ts` - Builds UI-ready latest results from persisted screening and chip stores.
- `src/components/results/results-table.tsx` - Renders the required stock results table and chip state labels.
- `src/components/status/status-workspace.tsx` - Includes the results table in the protected workspace.
- `src/app/page.tsx` - Reads the results snapshot server-side and passes it to the workspace.
- `tests/results/results-snapshot.test.ts` - Covers unavailable, empty, ready, stale chip, and row-level chip states.
- `tests/ui/results-table.test.tsx` - Covers required columns, numeric formatting, unavailable chip marker, and workspace wiring.

## Decisions Made

- Stale chip data is ignored unless `chipPeakRun.screeningRunId` matches the latest screening run id.
- A chip result marked `succeeded` without a numeric price is treated as `missing`, because the table cannot safely display it as available.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript caught a possible `succeeded` chip status without a price. The implementation now maps that invalid persisted shape to `missing`; tests and typecheck pass.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/results/results-snapshot.test.ts` - passed
- `D:\NodeJS\npm.cmd run test -- --run tests/results/results-snapshot.test.ts tests/ui/results-table.test.tsx` - passed
- `D:\NodeJS\npm.cmd run typecheck` - passed

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 05-02 to add user-controlled sorting and distinguish empty, unavailable, and chip unavailable states more completely.

---
*Phase: 05-results-table-experience*
*Completed: 2026-06-23*
