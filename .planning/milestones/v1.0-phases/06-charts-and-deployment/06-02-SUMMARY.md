---
phase: 06-charts-and-deployment
plan: "06-02"
subsystem: ui
tags: [echarts, candlestick, react, results-table, chart]

requires:
  - phase: 06-charts-and-deployment
    provides: "06-01 selected-stock chart API and ChartSnapshot types"
provides:
  - "Inline selected-stock K-line chart under the results table"
  - "ECharts candlestick rendering with MA20, MA60, interval high, 85% threshold, and chip peak overlays"
  - "Clickable/accessibly selectable table rows that drive chart selection"
affects: [results-table, stock-chart, deployment-smoke]

tech-stack:
  added:
    - echarts@6.1.0
  patterns:
    - "Direct client-side ECharts integration inside a focused React component"
    - "Table owns selected result row and passes only selected tsCode to chart loader"

key-files:
  created:
    - src/components/charts/stock-kline-chart.tsx
    - tests/ui/stock-kline-chart.test.tsx
  modified:
    - package.json
    - package-lock.json
    - src/components/results/results-table.tsx
    - tests/ui/results-table.test.tsx

key-decisions:
  - "Use direct `echarts` instead of a React wrapper to keep React 19 / Next 16 compatibility surface smaller."
  - "The table preserves the selected row across sort changes when that row still exists; otherwise it falls back to the first row under current sorting."
  - "Unavailable chip peak state is rendered as text and does not draw a fake chart line."

patterns-established:
  - "Chart components fetch selected-stock data lazily from protected API routes instead of embedding all chart data in server props."
  - "ECharts instances are initialized client-side, resized on window resize, and disposed on unmount."

requirements-completed: [CHRT-01, CHRT-02, CHRT-03, CHRT-04, CHRT-05, CHRT-06]

duration: 10 min
completed: 2026-06-23
---

# Phase 06 Plan 02: Inline K-line Chart Experience Summary

**Results table rows now drive an inline ECharts candlestick chart with MA and downtrend overlay lines.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-23T14:21:58Z
- **Completed:** 2026-06-23T14:28:00Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Installed `echarts@6.1.0`.
- Added `StockKlineChart`, which fetches the selected stock chart snapshot and renders K-line, MA20, MA60, interval high, 85% threshold, and optional chip peak.
- Made result rows selectable by click, Enter, or Space, with `aria-selected` reflecting current selection.
- Rendered the chart inline below the table without adding a detail route or action column.

## Task Commits

Tasks 1-4 were implemented in a combined inline execution commit:

1. **Tasks 1-4: ECharts dependency, chart component, row selection, and chart API loading** - `8e349ca` (`feat(06-02): add inline kline chart experience`)

**Plan metadata:** committed separately with this summary.

## Files Created/Modified

- `src/components/charts/stock-kline-chart.tsx` - Client-side ECharts K-line chart component and chart data loading states.
- `src/components/results/results-table.tsx` - Row selection and inline chart placement.
- `tests/ui/stock-kline-chart.test.tsx` - Chart state and ECharts option tests.
- `tests/ui/results-table.test.tsx` - Selection and table/chart wiring tests.
- `package.json` - Adds `echarts`.
- `package-lock.json` - Locks ECharts transitive dependencies.

## Decisions Made

- Used direct `echarts` integration rather than `echarts-for-react`.
- Kept chart interaction to tooltip and legend toggles from the ECharts option; no volume subplot or dataZoom was added.
- Preserved selection when sorting if the selected row still exists, which is simpler and avoids surprising chart resets.

## Deviations from Plan

None - plan executed within the intended scope.

## Issues Encountered

- ECharts markLine type inference needed an explicit dashed/solid union type for TypeScript.
- `npm install` reported 2 moderate vulnerabilities. No force upgrade was applied because that would be a dependency policy change outside this plan.

## User Setup Required

None - no external service configuration required.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/ui/stock-kline-chart.test.tsx`
- `D:\NodeJS\npm.cmd run test -- --run tests/ui/results-table.test.tsx`
- `D:\NodeJS\npm.cmd run test -- --run tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint`
- `D:\NodeJS\npm.cmd run verify`

All verification commands passed. The remaining Next.js middleware deprecation warning is scheduled for 06-03.

## Next Phase Readiness

Ready for 06-03. The browser smoke test can now assert login, table visibility, row selection, and chart rendering.

---
*Phase: 06-charts-and-deployment*
*Completed: 2026-06-23*
