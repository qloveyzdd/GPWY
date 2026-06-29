---
phase: 11-distribution-comparison-experience
plan: 11-01
subsystem: charts-data
tags: [chart-snapshot, chip-distribution, dto, sqlite]
requires:
  - phase: 10-dual-day-chip-distribution
    provides: stock-date chip distribution cache and per-target statuses
provides:
  - ChartSnapshot DTO with previous/latest chip distribution panels
  - Shared chip distribution price and percent scale
  - Server-side aggregation from Phase 10 chip distribution cache
affects: [stock-detail-chart, results-chart-api, phase-11-ui]
tech-stack:
  added: []
  patterns: [server-side shared-scale DTO, target-level unavailable state]
key-files:
  created: []
  modified:
    - src/lib/results/chart-types.ts
    - src/lib/results/chart-data.ts
    - tests/results/chart-data.test.ts
    - src/components/charts/stock-kline-chart.tsx
    - tests/ui/stock-kline-chart.test.tsx
key-decisions:
  - "ChartSnapshot now owns shared distribution scale so the UI cannot compare two self-scaled charts."
  - "K-line overlays no longer expose legacy chip peak fields."
patterns-established:
  - "Chart chip distribution panels carry status independently from the ready/unavailable state of the whole chart snapshot."
requirements-completed: [CHRT-07, CHRT-08, CHRT-09, CHRT-10, CHRT-11]
duration: 9 min
completed: 2026-06-30
---

# Phase 11 Plan 11-01: Chart Data DTO Summary

**ChartSnapshot now returns previous/latest full chip distribution panels with shared comparison scale instead of legacy chip peak overlays.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-30T06:05:00+08:00
- **Completed:** 2026-06-30T06:14:45+08:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added chart DTO types for previous/latest chip distribution panels, per-panel status, max level, and shared scale.
- Aggregated Phase 10 `chip_distribution_*` cache data into `readLatestChartSnapshot()`.
- Added tests for dual-day successful distributions, missing panels, single-day blocked state, shared scale, and error summary redaction.
- Removed legacy chip peak fields from the K-line overlay contract.

## Task Commits

1. **Tasks 1-3: DTO, aggregation, shared scale** — `0fc1ecf` (`feat(11-01): add dual distribution chart snapshot`)

## Files Created/Modified

- `src/lib/results/chart-types.ts` — adds `ChartChipDistributions` and removes legacy chip peak overlay fields.
- `src/lib/results/chart-data.ts` — reads distribution run/status/levels, computes per-panel max levels and shared scale.
- `tests/results/chart-data.test.ts` — covers dual distributions, missing state, blocked latest with previous success, and sanitized errors.
- `src/components/charts/stock-kline-chart.tsx` — minimal compile fix removing old chip peak overlay reads.
- `tests/ui/stock-kline-chart.test.tsx` — fixture updated to the new chart DTO shape.

## Decisions Made

- Keep whole `ChartSnapshot.status` ready when only one chip distribution target is unavailable.
- Sanitize distribution `errorSummary` defensively at chart DTO boundary, even though Phase 10 already stores sanitized summaries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed old K-line chip peak reads during DTO change**
- **Found during:** Plan verification after Task 1-3
- **Issue:** Removing `chipPeaks/chipPeakState` from `ChartOverlays` broke `stock-kline-chart.tsx` and its test fixture during typecheck.
- **Fix:** Removed the old K-line chip peak markLine/badge reads and updated the component test fixture to the new DTO shape. Full dual-distribution rendering remains assigned to Plan 11-03.
- **Files modified:** `src/components/charts/stock-kline-chart.tsx`, `tests/ui/stock-kline-chart.test.tsx`
- **Verification:** `D:\NodeJS\npm.cmd run typecheck` passed.
- **Committed in:** `0fc1ecf`

---

**Total deviations:** 1 auto-fixed blocking compile issue.  
**Impact on plan:** No scope expansion in behavior; this was required to make the DTO contract compile before Plan 11-03 completes the UI.

## Issues Encountered

None unresolved.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts` — passed
- `D:\NodeJS\npm.cmd run typecheck` — passed
- `D:\NodeJS\npm.cmd run lint -- src/lib/results tests/results` — passed

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 11-02 table simplification and 11-03 full chart UI implementation.

---
*Phase: 11-distribution-comparison-experience*
*Completed: 2026-06-30*

