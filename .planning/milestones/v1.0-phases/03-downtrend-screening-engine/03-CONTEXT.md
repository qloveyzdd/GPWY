# Phase 03: Downtrend Screening Engine - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Source:** Roadmap and Phase 2 completion artifacts

<domain>
## Phase Boundary

Phase 3 turns the latest successful SQLite refresh cache into explainable downtrend screening results.

This phase does:
- Compute MA20 and MA60 from cached close prices.
- Evaluate `MA20 < MA60`.
- Evaluate MA20 recent 5-point slope as negative.
- Find the latest 60-day local swing high using strict high comparison against previous and next 3 trading days.
- Fall back to the latest occurrence of the 60-day highest high when no local swing high exists.
- Select stocks where latest close `<= intervalHigh * 0.85`.
- Persist selected results with current price, interval high, current/high ratio, drawdown, MA values, slope, and high source.

This phase does not:
- Fetch fresh data from Tushare/tinyshare.
- Fetch or compute chip peaks.
- Build the final result table or charts.
</domain>

<decisions>
## Implementation Decisions

### D-03-01: Cached Data Only
- Screening reads from `readLatestStockBasics()` and `readLatestDailyBars()` produced by Phase 2. It must not call Tushare/tinyshare directly.

### D-03-02: 60-Bar Requirement
- A stock needs at least 60 cached daily bars to be evaluated. Insufficient data is skipped and counted, not silently treated as a failed condition.

### D-03-03: MA Slope Definition
- "MA20 最近 5 日斜率为负" means the latest MA20 value is lower than the first value in the latest 5 MA20 points.

### D-03-04: Swing High Definition
- A swing high is a bar whose high is strictly greater than each of the previous 3 and next 3 trading-day highs. The latest qualifying bar in the 60-day window wins.

### D-03-05: Fallback High
- Superseded on 2026-06-24: start from the latest trading day and move backward only while the previous day's high is strictly greater than the current candidate; stop otherwise and use the current candidate as the interval high. There is no separate 60-day-high fallback.

### D-03-06: Explainability
- Persist all user-visible numeric values needed later by table/chart phases instead of recomputing them only in the UI.
</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — SCRN-01 through SCRN-08.

### Upstream Cache
- `.planning/phases/02-manual-refresh-cache/02-03-SUMMARY.md` — available cache APIs and daily OHLCV data shape.
- `src/lib/refresh/refresh-store.ts` — latest successful cache readers.
- `src/lib/refresh/refresh-types.ts` — cached daily bar and stock basic records.
</canonical_refs>

<specifics>
## Specific Ideas

- Keep the algorithm pure and separately testable before adding persistence.
- Store ratios as decimals, e.g. `0.84`, and drawdown as decimal, e.g. `0.16`.
- Sort bars ascending by `tradeDate` before all calculations.
</specifics>

<deferred>
## Deferred Ideas

- Chip peak enrichment is Phase 4.
- Table sorting and empty states are Phase 5.
- Chart overlays are Phase 6.
</deferred>

---
*Phase: 03-downtrend-screening-engine*
*Context gathered: 2026-06-23*
