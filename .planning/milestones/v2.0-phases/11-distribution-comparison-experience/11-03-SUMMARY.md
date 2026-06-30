---
phase: 11-distribution-comparison-experience
plan: 11-03
subsystem: charts-ui
tags: [echarts, chip-distribution, stock-detail, react]
requires:
  - phase: 11-01
    provides: ChartSnapshot previous/latest chip distribution panels and shared scale
provides:
  - Stock detail layout with K-line chart above dual chip distribution charts
  - Previous/latest horizontal distribution cards using shared price and percent scale
  - Panel-local unavailable states for missing, blocked, and failed distribution targets
affects: [stock-detail-chart, chart-smoke-tests, phase-11-verification]
tech-stack:
  added: []
  patterns: [independent-echarts-card-lifecycle, panel-local-unavailable-state]
key-files:
  created: []
  modified:
    - src/components/charts/stock-kline-chart.tsx
    - tests/ui/stock-kline-chart.test.tsx
key-decisions:
  - "Each chip distribution card owns its own ECharts instance so K-line, previous, and latest charts do not share lifecycle state."
  - "Missing distribution data is rendered as a neutral empty state, while blocked/failed states stay isolated to the affected day."
patterns-established:
  - "Distribution chart series are mapped against the shared DTO priceLevels so absent per-day price levels render as zero."
requirements-completed: [CHRT-07, CHRT-08, CHRT-09, CHRT-10, CHRT-11]
duration: 9 min
completed: 2026-06-30
---

# Phase 11 Plan 11-03: Stock Detail Dual Distribution Summary

**Stock detail now shows K-line context above comparable previous/latest chip distribution charts with isolated per-day unavailable states.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-30T06:16:00+08:00
- **Completed:** 2026-06-30T06:25:13+08:00
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Rendered previous and latest chip distribution cards below the K-line chart.
- Built horizontal ECharts bar options from the shared `chipDistributions.scale.priceLevels` and `maxPercent`.
- Marked each successful panel's own maximum-percent level inside that panel only.
- Replaced legacy chip peak component assertions with tests for no K-line chip peak overlays, dual distribution charts, shared scales, blocked latest isolation, and neutral missing previous state.

## Task Commits

1. **Tasks 1-3: K-line cleanup, dual distribution charts, unavailable cards** — `26ef66e` (`feat(11-03): render dual chip distribution charts`)

## Files Created/Modified

- `src/components/charts/stock-kline-chart.tsx` — adds independent dual distribution chart cards, shared-scale series mapping, max-level marking, and panel-local unavailable cards.
- `tests/ui/stock-kline-chart.test.tsx` — covers K-line overlay cleanup, shared-scale previous/latest bars, latest blocked isolation, and missing previous neutral state.

## Decisions Made

- Used one ECharts instance per distribution card to avoid cross-chart resize/dispose coupling.
- Kept previous/latest cards visually parallel and independent; no hover or click linkage was added.
- Sanitized unavailable summaries again at the UI boundary before display, even though the DTO already redacts provider-sensitive details.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None unresolved.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/ui/stock-kline-chart.test.tsx tests/results/chart-data.test.ts` — passed
- `D:\NodeJS\npm.cmd run typecheck` — passed
- `D:\NodeJS\npm.cmd run lint -- src/components/charts tests/ui/stock-kline-chart.test.tsx` — passed
- `rg "筹码峰|chipPeakColors|chipPeaks|chipPeakState" src\components\charts\stock-kline-chart.tsx` — no matches

## Self-Check: PASSED

- K-line markLine only contains interval high and 85% threshold.
- Previous/latest successful cards use the same y-axis price levels and x-axis max percent.
- A blocked or missing day does not prevent the other day's distribution chart from rendering.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 11-04 smoke and full phase verification.

---
*Phase: 11-distribution-comparison-experience*
*Completed: 2026-06-30*
