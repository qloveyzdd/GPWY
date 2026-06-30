# Phase 10: Dual-Day Chip Distribution - Pattern Map

**Generated:** 2026-06-29
**Status:** Ready for planning

## Purpose

Map Phase 10 planned files to existing analogs so executors reuse current database, runner, result snapshot, and test conventions instead of inventing new patterns.

## File Pattern Map

| Planned file / area | Closest existing analog | Pattern to reuse |
|---------------------|-------------------------|------------------|
| `src/lib/chip/chip-types.ts` | Existing `ChipPeakRunRecord`, `ChipPeakResultRecord`, `ChipDistributionRow` | Keep DTOs plain TypeScript types; use explicit status unions; keep Tushare error category nullable on row-level results. |
| `src/lib/chip/chip-peak.ts` | `mapCyqChipsTable()`, `extractChipPeaks()` | Reuse row validation for `ts_code`, `trade_date`, `price`, `percent`; sort peaks by `percent desc`, then `price asc` for compatibility derivation. |
| `src/lib/chip/chip-store.ts` | Existing `openDatabase()`, `writeChipPeakRun()`, `readChipPeakResultsForRun()` | Use `better-sqlite3`, additive `create table if not exists`, short transactions, mapper functions, temp DB tests via `REFRESH_DB_PATH`. |
| `src/lib/chip/chip-runner.ts` | Existing `runChipPeakIntegrationFromLatestScreening()` | Read latest screening run, process candidates with `Promise.all`, use `TUSHARE_ENDPOINTS.chipChips`, pass `{ priority: "chip" }`, classify provider errors with `classifyTushareError()`, isolate row/date failures. |
| `src/lib/results/results-snapshot.ts` | Current `chipState()` and `toRow()` join | Keep latest screening run as source of truth; join only chip data for the same screening run; blocked/failed/missing rows remain visible. |
| `src/lib/results/chart-data.ts` | Current `readLatestChartSnapshot()` overlay construction | Do not change chart UI contract in Phase 10; continue feeding `row.chipPeaks` until Phase 11. |
| `src/lib/refresh/refresh-runner.ts` | Phase 9 `startChipBackground()` | Keep chip processing as `chip_background` operation; update `chip` stage with total/completed/failed counts; do not block refresh job success. |
| `tests/chip/*` | `tests/chip/chip-store.test.ts`, `tests/chip/chip-runner.test.ts` | Use temp SQLite DB via `mkdtempSync` + `vi.stubEnv("REFRESH_DB_PATH", ...)`; mock `TushareClientLike`; assert persisted rows and exact provider params. |
| `tests/results/*` | `tests/results/results-snapshot.test.ts`, `tests/results/chart-data.test.ts` | Seed screening + chip store rows, then assert user-facing DTO state; do not inspect private SQL when behavior DTO is enough. |

## Data Flow Pattern

```text
latest screening run
  -> screening rows + source market generation
  -> resolve target dates per stock from same valid bar sequence
  -> plan stock-date chip work from cache statuses
  -> cyq_chips range request per stock when needed
  -> complete stock-date distribution cache
  -> latest screening run distribution summary
  -> compatibility chip peak DTO for current table/K-line
```

## Store Conventions

- `openDatabase()` must create parent directory before opening SQLite.
- Schema changes should be additive and idempotent.
- Write APIs that replace multiple rows must use `begin` / `commit` / `rollback`.
- Public read APIs should return mapped DTOs, not raw SQL rows.
- Error summaries are already sanitized before or during classification; never expose token, headers, local paths, or raw provider payloads in result DTOs.

## Runner Conventions

- Provider requests must go through `TushareClientLike.query(endpoint, params, { priority: "chip" })`.
- Do not add a private retry loop; Phase 8 scheduler owns retries and backoff.
- `Promise.all` / `Promise.allSettled` is acceptable only when underlying client is scheduler-backed.
- Progress callback failures must be swallowed; progress reporting cannot change row/date result semantics.
- Result run status should be derived from persisted target counts: succeeded, partial, blocked, failed.

## Compatibility Conventions

- Phase 10 must not remove `ResultRow.chipPeakState`, `chipPeakPrice`, `chipPeakTradeDate`, `chipPeakSource`, or `chipPeaks`.
- Those fields must be derived from latest target-date complete distribution only.
- Previous target-date success must never fill latest-date compatibility fields.
- Phase 11 owns chart replacement and table column removal.

## Test Fixtures

- Use local helper `table(items)` returning `TushareDataTable` with fields `["ts_code", "trade_date", "price", "percent"]`.
- For date resolution tests, seed a normalized generation and `writeScreeningRun({ sourceMarketGenerationId })`.
- For legacy fallback tests, seed a refresh job with `writeDailyBars()` only if the implementation deliberately supports legacy screening runs.
- Use exact provider parameter assertions for `start_date`, `end_date`, and omission/presence of `trade_date`.

## Risks to Watch During Execution

- Accidentally making run id the cache identity and losing cross-refresh reuse.
- Leaving old `chip_peak_levels` rank constraint in the full distribution path.
- Treating `empty_data` as `failed` and causing repeated automatic retries.
- Letting result snapshot read stale chip rows from a prior screening run.
- Updating UI behavior early in Phase 10 instead of preserving compatibility for Phase 11.
