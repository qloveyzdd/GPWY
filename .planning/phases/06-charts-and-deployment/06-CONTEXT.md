# Phase 06: Charts and Deployment - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 completes the v1 usable workflow: after the user manually refreshes data, the app should generate current screening results, enrich them with chip peak state, let the user inspect a selected stock chart, and provide self-hosting plus verification instructions.

This phase does:
- Close the current result-generation gap by chaining manual refresh into downtrend screening and chip peak enrichment.
- Let the user select a stock from the results table and view a chart below the table.
- Show the selected stock's latest 60 cached trading days with price, MA20, MA60, interval high, 85% threshold, and chip peak overlays.
- Keep table and chart values consistent with persisted screening/chip records.
- Provide cloud self-hosting instructions and verification commands.

This phase does not:
- Add CSV export, watchlists, search filters, or configurable screening parameters.
- Add automatic daily scheduled refresh.
- Add multi-user permissions or public access controls.
- Add trading advice, backtesting, or order execution.
- Estimate chip peaks when official Tushare/tinyshare chip data is unavailable.

</domain>

<decisions>
## Implementation Decisions

### Result Generation Workflow
- **D-06-01:** The manual refresh action should become a full workflow: refresh stock/cache data, then run downtrend screening, then run chip peak enrichment for matched stocks.
- **D-06-02:** Chip peak failures, permission blocks, empty official data, or rate limits must not block result display. Screening results still update, and chip peak cells/chart overlays show row-level `blocked`, `failed`, or `missing` state.
- **D-06-03:** The current "结果数据不可用" behavior is acceptable only before any screening run exists. After Phase 6, a successful manual refresh should leave the page with usable table/chart data unless there are genuinely no matching stocks.

### Chart Entry
- **D-06-04:** The chart opens inline below the table. The user clicks a table row to change the selected stock; no separate detail page and no extra "view chart" action column in v1.
- **D-06-05:** When results are available, the default selected stock is the first row under the current table ordering. If the user changes sorting later, the planner may keep the current selection if still present or select the new first row, whichever is simpler and least surprising within the existing component structure.

### Chart Presentation
- **D-06-06:** The main chart should be K-line/candlestick, not a close-price-only line chart.
- **D-06-07:** The chart must overlay MA20, MA60, interval high, `intervalHigh * 0.85`, and chip peak price when available.
- **D-06-08:** Do not add a separate volume subplot in v1.
- **D-06-09:** Chart interaction depth is basic: tooltip, legend toggles, and automatic focus on the 60-day window. Do not add dataZoom sliders, crosshair enhancement, or click-to-locate swing-high interactions in v1.

### the agent's Discretion
- Deployment and verification details were not discussed deeply. Follow the existing stack and keep the simplest maintainable self-host path: environment variables, production build/start commands, and either PM2 or systemd guidance if research/planning confirms it fits the project.
- The planner should choose the charting library consistent with prior stack research. ECharts was previously recommended for K-line and overlays; if used, keep it client-side and verify it renders under Next.js.
- Exact chart colors, labels, and layout should match the existing quiet dashboard style in `StatusWorkspace` and `ResultsTable`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` — CHRT-01 through CHRT-06, DEPL-01, and DEPL-03.
- `.planning/ROADMAP.md` — Phase 6 goal, planned plan split, and success criteria.
- `.planning/PROJECT.md` — v1 boundaries, Tushare-only data source, manual refresh mode, and table-plus-chart product intent.

### Prior Phase Decisions
- `.planning/phases/03-downtrend-screening-engine/03-CONTEXT.md` — cached-data-only screening, 60-bar requirement, MA/swing-high definitions, and persisted explainability fields.
- `.planning/phases/04-chip-peak-integration/04-CONTEXT.md` — official `cyq_chips` only, blocked-instead-of-estimate rule, and latest screening enrichment rule.
- `.planning/phases/05-results-table-experience/05-CONTEXT.md` — table state semantics, row-level chip unavailable behavior, and Phase 6 chart boundary.
- `.planning/phases/05-results-table-experience/05-01-SUMMARY.md` — `ResultsSnapshot` and `ResultRow` row shape for table/chart reuse.
- `.planning/phases/05-results-table-experience/05-02-SUMMARY.md` — table sorting behavior and row-level state patterns.
- `.planning/phases/05-results-table-experience/05-VERIFICATION.md` — Phase 5 passed behavior and residual warning about Next.js middleware naming.

### Existing Code
- `src/app/page.tsx` — server-side protected home page data loading.
- `src/components/status/status-workspace.tsx` — protected workspace, manual refresh controls, and status layout.
- `src/components/results/results-table.tsx` — existing results table, sorting state, and row rendering.
- `src/lib/results/results-types.ts` — `ResultsSnapshot` and `ResultRow` types that chart selection should reuse or extend.
- `src/lib/results/results-snapshot.ts` — latest screening/chip snapshot join behavior.
- `src/lib/refresh/refresh-store.ts` — latest cached daily OHLCV readers needed for chart series.
- `src/lib/screening/screening-store.ts` — persisted screening result values that chart overlays must match.
- `src/lib/screening/screening-runner.ts` — existing cached screening runner to chain after refresh.
- `src/lib/chip/chip-runner.ts` — existing chip peak enrichment runner to chain after screening.
- `README.md` — current local run and environment variable documentation.
- `package.json` — current verification scripts and dependency baseline.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ResultsSnapshot` already provides the selected row values that must match the chart summary and overlays.
- `readLatestDailyBars()` can supply cached OHLCV rows for the latest successful refresh job.
- `runDowntrendScreeningFromCache()` and `runChipPeakIntegrationFromLatestScreening()` already exist; Phase 6 should wire them into the user-triggered workflow rather than reimplementing algorithms.
- Existing shadcn-style `Button`, `Badge`, `Alert`, and table primitives should guide chart container and state styling.

### Established Patterns
- Server-side data reads happen in `src/app/page.tsx`, then are passed into client workspace components.
- UI state stays local in focused client components when it is small and table-specific.
- Provider errors and sensitive details must remain sanitized; never expose tokens or raw provider payloads.
- Row-level chip unavailable status does not hide matched stocks.

### Integration Points
- Manual refresh currently writes stock/cache data only. The refresh worker or post-refresh route must be extended so successful refresh triggers screening and chip enrichment.
- Results table row click/selection should connect to a chart section below the table.
- Chart data can be served by a focused server helper or API route that combines cached daily bars with the selected `ResultRow` values.
- Verification should extend existing Vitest UI/component tests and add a browser smoke path if the selected tool supports it.

</code_context>

<specifics>
## Specific Ideas

- First result row should be selected by default so users immediately see a chart after data is available.
- K-line chart should explain why a stock matched: MA20, MA60, interval high, 85% threshold, and chip peak must all be visible when the source data exists.
- If chip peak is unavailable, the chart should still render price/MA/high/threshold and show a clear chip peak unavailable state instead of a fake line.
- Keep all chart values consistent with persisted table values; do not recompute interval high or drawdown differently for the chart.

</specifics>

<deferred>
## Deferred Ideas

- Independent stock detail routes and shareable URLs are deferred beyond v1.
- Volume subplot, dataZoom sliders, crosshair enhancements, and click-to-locate swing-high interactions are deferred beyond v1.
- CSV export, watchlists, search/filter controls, configurable screening parameters, and scheduled refresh remain v2 scope.

</deferred>

---
*Phase: 06-charts-and-deployment*
*Context gathered: 2026-06-23*
