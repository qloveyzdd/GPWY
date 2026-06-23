# Phase 04: Chip Peak Integration - Research

## Provider Evidence

Local tinyshare bridge smoke, without printing token:

- `cyq_chips(ts_code=000001.SZ, start_date=20260204, end_date=20260211)` returned fields `ts_code, trade_date, price, percent` and 624 rows.
- `cyq_chips(ts_code=000001.SZ, trade_date=20260211)` returned fields `ts_code, trade_date, price, percent` and 104 rows.

This supports a simpler per-selected-stock query using `trade_date` from screening results.

## Extraction Rule

For one stock and trade date:

1. Map `TushareDataTable` rows by field names.
2. Keep rows for the latest `trade_date` present in the table.
3. Choose the row with the largest numeric `percent`.
4. If percent ties, choose the lower numeric `price` for deterministic behavior.
5. Persist:
   - `chipPeakPrice`
   - `peakPercent`
   - `tradeDate`
   - `source = cyq_chips_highest_percent`

## Blocking Rule

- `permission_denied`, `empty_data`, `missing_config`, unsupported/unknown official response => blocked.
- `rate_limited` or `network_or_service` => failed, but still sanitized and persisted.
- No fallback approximation.

## Storage Notes

Use the existing SQLite file:

- `chip_peak_runs`: one run per enrichment attempt, keyed to `screening_run_id`.
- `chip_peak_results`: one row per screened stock with succeeded/blocked/failed status.

This keeps Phase 5 able to join the latest screening output and latest chip enrichment state.

---
*Phase: 04-chip-peak-integration*
*Research completed: 2026-06-23*
