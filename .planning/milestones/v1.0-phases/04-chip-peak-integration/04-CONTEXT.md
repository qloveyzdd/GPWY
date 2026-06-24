# Phase 04: Chip Peak Integration - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Source:** Roadmap, Phase 1 chip validation, Phase 3 screening results

<domain>
## Phase Boundary

Phase 4 enriches latest downtrend screening results with official Tushare/tinyshare chip peak data.

This phase does:
- Use official `cyq_chips` distribution rows.
- Extract the chip peak as the price level with the highest `percent` for the latest queried trade date.
- Persist chip peak price and extraction source per selected stock.
- Persist blocked results when official chip data is unavailable, empty, permission-denied, or config-missing.

This phase does not:
- Estimate chip peaks from price/volume.
- Use `cyq_perf.cost_50pct` as a substitute for chip peak.
- Recompute downtrend screening logic.
- Build the final table or chart UI.
</domain>

<decisions>
## Implementation Decisions

### D-04-01: Official Distribution Only
- Chip peak uses `cyq_chips` rows with `price` and `percent`. Other fields such as `cyq_perf.cost_50pct` are not a chip peak substitute.

### D-04-02: Trade-Date Query
- Query `cyq_chips` with the screening result's latest trade date. Local smoke confirmed `trade_date` works and returns distribution rows.

### D-04-03: Peak Definition
- For a trade date, chip peak price is the `price` with the maximum `percent`. Ties are deterministic: lower price wins.

### D-04-04: Block Instead of Estimate
- Any official data/permission/config failure must be stored as a blocked/failed sanitized status. No approximate chip peak is created.

### D-04-05: Enrich Latest Screening Results
- Phase 4 reads latest screening run/results and writes chip peak results referencing that screening run id.
</decisions>

<canonical_refs>
## Canonical References

### Upstream Screening
- `.planning/phases/03-downtrend-screening-engine/03-03-SUMMARY.md` — latest screening result readers and fields.
- `src/lib/screening/screening-store.ts` — latest screening run/result APIs.

### Provider
- `.planning/phases/01-tushare-data-foundation/01-03-SUMMARY.md` — real tinyshare chip candidate validation.
- `src/lib/tushare/endpoints.ts` — `chipChips` endpoint fields.
- `src/lib/tushare/provider.ts` — provider selection.
</canonical_refs>

<specifics>
## Specific Ideas

- Store chip peak results in separate `chip_peak_runs` and `chip_peak_results` tables to avoid mutating historical screening result rows.
- Keep parser pure and offline-testable before adding provider/store integration.
- Real smoke confirmed:
  - `cyq_chips(ts_code, start_date, end_date)` returns rows.
  - `cyq_chips(ts_code, trade_date)` returns rows for one day.
</specifics>

<deferred>
## Deferred Ideas

- Displaying chip peak in the table is Phase 5.
- Drawing chip peak on charts is Phase 6.
</deferred>

---
*Phase: 04-chip-peak-integration*
*Context gathered: 2026-06-23*
