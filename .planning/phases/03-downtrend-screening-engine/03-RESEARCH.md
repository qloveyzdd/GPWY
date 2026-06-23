# Phase 03: Downtrend Screening Engine - Research

## Existing Interfaces

- `readLatestSuccessfulRefreshJob()` returns the latest succeeded refresh job and its id.
- `readLatestStockBasics()` returns stock code/name metadata from the latest successful refresh.
- `readLatestDailyBars()` returns OHLCV bars ordered by `ts_code, trade_date`.

## Algorithm Notes

- Moving averages should be calculated from close prices in chronological order.
- MA20 and MA60 for the latest date require at least 60 bars.
- MA20 slope can be evaluated from the latest 5 MA20 points once MA20 exists.
- Swing high detection must exclude the first and last 3 bars because those lack the required comparison window.
- Strict comparison avoids treating flat highs or tied highs as local swing highs.
- Fallback to 60-day high keeps the result explainable when price action has no strict local high.

## Storage Notes

- Use the same SQLite database path as refresh cache (`REFRESH_DB_PATH` default `.data/refresh.sqlite`) so later phases can read one local cache.
- A screening run should reference the source refresh job id.
- Results should persist the computed values required by Phase 5/6:
  stock code, name, latest trade date, current price, interval high, interval high date/source, ratio, drawdown, MA20, MA60, MA20 slope.

## Risks

- If cached data is incomplete, false positives are worse than skipped stocks. Skip insufficient series and record skip count.
- If bars are not sorted before calculation, MA and swing high results will be wrong. Sort by `tradeDate` inside the algorithm.
- If result values are rounded too early, table/chart consistency may suffer. Store raw decimal numbers and format only in UI later.

---
*Phase: 03-downtrend-screening-engine*
*Research completed: 2026-06-23*
