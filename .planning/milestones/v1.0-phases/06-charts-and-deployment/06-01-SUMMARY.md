---
phase: 06-charts-and-deployment
plan: "06-01"
subsystem: data-workflow
tags: [refresh, screening, chip-peak, chart-data, api, sqlite]

requires:
  - phase: 05-results-table-experience
    provides: "ResultsSnapshot and ResultRow table data shape"
provides:
  - "Manual refresh now runs cache refresh, downtrend screening, and chip enrichment as one workflow"
  - "Job-scoped cache readers for table/chart consistency"
  - "Selected-stock chart snapshot helper and protected chart API"
  - "Workspace server-prop refresh after background refresh completion"
affects: [charts-and-deployment, results-table, manual-refresh]

tech-stack:
  added: []
  patterns:
    - "Job-scoped cache reads for persisted screening/chart parity"
    - "Chip enrichment is non-fatal; screening remains the authoritative result source"

key-files:
  created:
    - src/app/api/results/chart/[tsCode]/route.ts
    - src/lib/results/chart-data.ts
    - src/lib/results/chart-types.ts
    - tests/results/chart-data.test.ts
  modified:
    - src/components/status/status-workspace.tsx
    - src/lib/refresh/refresh-runner.ts
    - src/lib/refresh/refresh-store.ts
    - src/lib/screening/screening-runner.ts
    - tests/refresh/refresh-runner.test.ts
    - tests/ui/results-table.test.tsx
    - tests/ui/status-workspace.test.tsx

key-decisions:
  - "Screening runs against the refresh job that just wrote cache data instead of latest successful cache lookup."
  - "Chip peak enrichment errors are swallowed at workflow level because row-level chip state already captures provider failures."
  - "The client workspace uses App Router refresh after polling observes completion, avoiding a separate result snapshot polling API."

patterns-established:
  - "Chart data helpers must combine persisted ResultRow values with daily bars from the same sourceRefreshJobId."
  - "Workflow completion can trigger server component re-read through router.refresh after polling finishes."

requirements-completed: [CHRT-06]

duration: 8 min
completed: 2026-06-23
---

# Phase 06 Plan 01: Refresh Workflow And Chart Data Summary

**Manual refresh now produces screening-ready result data and selected-stock chart snapshots from the same cached refresh job.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-23T14:12:38Z
- **Completed:** 2026-06-23T14:20:10Z
- **Tasks:** 4
- **Files modified:** 11

## Accomplishments

- Upgraded manual refresh to run cache write, downtrend screening, and chip enrichment in one background workflow.
- Added job-scoped cache readers so screening and chart data use the refresh job that produced the latest screening run.
- Added `ChartSnapshot` types, `readLatestChartSnapshot()`, and authenticated `/api/results/chart/[tsCode]`.
- Added client-side `router.refresh()` after refresh polling completes so the results table can update without a manual browser reload.

## Task Commits

Tasks 1-4 were implemented in a combined inline execution commit:

1. **Tasks 1-4: Refresh workflow, chart data API, and workspace refresh** - `bd96656` (`feat(06-01): connect refresh workflow and chart data`)

**Plan metadata:** committed separately with this summary.

## Files Created/Modified

- `src/lib/refresh/refresh-runner.ts` - Orchestrates cache refresh, screening, and non-fatal chip enrichment.
- `src/lib/refresh/refresh-store.ts` - Adds job-scoped stock basic and daily bar readers.
- `src/lib/screening/screening-runner.ts` - Accepts a `sourceRefreshJobId` for current-job screening.
- `src/lib/results/chart-types.ts` - Defines chart snapshot shape.
- `src/lib/results/chart-data.ts` - Builds selected-stock chart snapshots from persisted results and matching bars.
- `src/app/api/results/chart/[tsCode]/route.ts` - Protected chart data route.
- `src/components/status/status-workspace.tsx` - Refreshes server props after background refresh completion.
- `tests/refresh/refresh-runner.test.ts` - Covers full workflow and failure semantics.
- `tests/results/chart-data.test.ts` - Covers chart snapshot parity and job-scoped bars.
- `tests/ui/status-workspace.test.tsx` - Covers refresh completion re-read behavior.
- `tests/ui/results-table.test.tsx` - Mocks App Router for workspace wiring tests.

## Decisions Made

- Screening failure fails the refresh workflow because no usable result set can be produced.
- Chip peak enrichment failure does not fail the refresh workflow because chip availability is explicitly row-level.
- Chart API returns `unavailable`, `not_found`, or `ready`; it does not fabricate chart data when no latest result row exists.

## Deviations from Plan

None - plan executed within the intended scope.

## Issues Encountered

- `react-hooks/set-state-in-effect` flagged a synchronous state update in the refresh completion effect. The marker was changed from state to `useRef`, which matches its non-rendering purpose.

## User Setup Required

None - no external service configuration required.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/refresh-runner.test.ts`
- `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts`
- `D:\NodeJS\npm.cmd run test -- --run tests/ui/status-workspace.test.tsx`
- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/refresh-runner.test.ts tests/screening/screening-runner.test.ts tests/chip/chip-runner.test.ts tests/results/chart-data.test.ts tests/ui/status-workspace.test.tsx`
- `D:\NodeJS\npm.cmd run verify`

All verification commands passed. The build still reports the known Next.js `middleware` deprecation warning, scheduled for 06-03.

## Next Phase Readiness

Ready for 06-02. The UI can now fetch selected-stock chart data from a stable API whose values match the persisted results table.

---
*Phase: 06-charts-and-deployment*
*Completed: 2026-06-23*
