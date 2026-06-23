# Phase 06 Research: Charts and Deployment

**Date:** 2026-06-23  
**Scope:** 手动刷新全流程、单股 K 线图、云端自托管与页面冒烟验证。

## Inputs Read

- `.planning/phases/06-charts-and-deployment/06-CONTEXT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `src/lib/refresh/refresh-runner.ts`
- `src/lib/refresh/refresh-store.ts`
- `src/lib/screening/screening-runner.ts`
- `src/lib/chip/chip-runner.ts`
- `src/lib/results/results-snapshot.ts`
- `src/components/status/status-workspace.tsx`
- `src/components/results/results-table.tsx`
- `package.json`

## Findings

### 1. Result generation is the real first gap

Current manual refresh writes `stock_basic` and `daily_bars` only. The results table reads persisted `screening_runs`, `screening_results`, and matching `chip_peak_runs`; the local database can therefore have a successful refresh cache while the page still shows "结果数据不可用". This is expected before Phase 6, but it violates D-06-01 and D-06-03 once Phase 6 is complete.

Recommended implementation:

- Keep the refresh job active until cache write, screening, and chip enrichment have been attempted.
- Reuse `runDowntrendScreeningFromCache()` and `runChipPeakIntegrationFromLatestScreening()` instead of reimplementing algorithms.
- Extend the cached-data readers so screening/chart helpers can read by the refresh job that produced the screening run, not merely by "latest successful refresh". This preserves table/chart consistency if a later refresh fails or is still running.
- Treat screening failure as a refresh workflow failure because no usable results can be produced.
- Treat chip peak provider failures as non-fatal because `chip-runner` already records row-level `blocked`/`failed`/`missing` states.

### 2. The chart data helper must use persisted screening values

`ResultRow` already contains the values that must match the table: current price, interval high, ratio, drawdown, MA20, MA60, and chip peak state/price. Chart data should not recompute the match result. It may compute MA20/MA60 series from the same cached bars for display, but overlay summary values must come from the persisted screening/chip rows.

Recommended data shape:

- `ChartSnapshot.status`: `ready`, `not_found`, or `unavailable`.
- `ChartSnapshot.row`: selected `ResultRow` for parity with the table.
- `ChartSnapshot.bars`: 60 cached OHLC rows ordered by trade date.
- `ChartSnapshot.ma20Series` and `ma60Series`: display-only moving average series.
- `ChartSnapshot.overlays`: interval high, `intervalHigh * 0.85`, and optional chip peak.

### 3. The page must refresh server props after a background job completes

`StatusWorkspace` receives `initialResultsSnapshot` from `src/app/page.tsx`, and that prop does not change during client polling. After the polling loop observes that refresh is no longer running, the workspace should call `router.refresh()` once so the server component re-reads validation, refresh, and result snapshots.

This is simpler than creating a second client-side results snapshot API for v1 and fits the existing App Router pattern.

### 4. Use direct ECharts integration

`npm view echarts version` returned `6.1.0` on 2026-06-23. Apache ECharts officially supports candlestick chart types and flexible chart composition, which fits K-line plus MA/high/threshold/chip overlays. Direct `echarts` integration inside a client component avoids adding a React wrapper compatibility surface for Next.js 16 and React 19.

Implementation notes:

- Import `echarts` inside a client component or dynamic path so no chart code runs during server render.
- Dispose chart instances on unmount.
- Add resize handling for responsive layouts.
- Use candlestick + line series and `markLine` overlays.
- Keep interactions to tooltip and legend toggles; do not add volume, dataZoom, or crosshair enhancements in v1.

Sources:

- https://echarts.apache.org/en/feature.html
- `npm view echarts version`

### 5. Next.js 16 deployment should migrate `middleware.ts` to `proxy.ts`

The project uses Next.js 16.2.9. Official Next.js docs state that starting with Next.js 16, Middleware is called Proxy and the file convention is `proxy.ts`; the older `middleware.ts` convention is deprecated. The current auth gate is already network-bound request protection, so migrating the filename and exported function is a deployment hardening cleanup rather than a behavior change.

Sources:

- https://nextjs.org/docs/app/getting-started/proxy
- https://nextjs.org/docs/messages/middleware-to-proxy

### 6. Playwright smoke tests should avoid real Tushare calls

`npm view @playwright/test version` returned `1.61.0` on 2026-06-23. Playwright Test officially supports a `webServer` option that launches a local app before tests. For this project, the smoke test should seed a temporary SQLite database and verify protected login, table rendering, row selection, and chart rendering without calling Tushare/tinyshare.

Recommended smoke strategy:

- Add `@playwright/test` as a dev dependency.
- Add `playwright.config.ts` with a local web server command.
- Use test env vars: `APP_PASSWORD`, `TUSHARE_TOKEN` dummy value, `REFRESH_DB_PATH` pointing to a temporary seeded DB.
- Seed one ready screening result and matching daily bars before the browser test.
- Assert login works, the result table is visible, the default selected row appears, and the chart container/canvas/SVG is non-empty.

Sources:

- https://playwright.dev/docs/test-webserver
- `npm view @playwright/test version`

## Risk Notes

- Long full-market refresh plus chip enrichment may take longer than cache-only refresh. The UI already polls status; Phase 6 should keep the job active until the full workflow finishes.
- Chip enrichment can be rate-limited or permission-blocked. This must remain row-level and must not erase screening results.
- Chart data for all result rows could grow if many stocks match. Prefer a selected-stock chart API/helper over embedding every row's chart data in the initial page.
- Smoke tests must not require the real token or the external provider; otherwise deployment verification becomes flaky and unsafe.

## Requirement Coverage

| Requirement | Research conclusion |
| --- | --- |
| CHRT-01 | Use row selection plus selected-stock chart helper/API. |
| CHRT-02 | Use candlestick series and MA20/MA60 line series. |
| CHRT-03 | Use persisted `intervalHigh` and `intervalHighTradeDate` overlay. |
| CHRT-04 | Use persisted `intervalHigh * 0.85` threshold overlay. |
| CHRT-05 | Overlay chip peak only when row state is `available`. |
| CHRT-06 | Chart helper must bind to the screening run's source refresh job and persisted `ResultRow`. |
| DEPL-01 | README and `.env.example` should document self-host env vars and prod commands. |
| DEPL-03 | Keep `npm run verify`; add focused smoke command with Playwright. |
