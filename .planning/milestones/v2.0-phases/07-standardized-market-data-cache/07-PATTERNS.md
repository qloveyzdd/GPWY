# Phase 7: Implementation Pattern Map

**Mapped:** 2026-06-25
**Purpose:** Identify the closest existing code analogs for each Phase 7 file before execution.

## Data Flow

```text
POST /api/refresh/run
  -> refresh-runner.ts
  -> bootstrap-market-data.ts
  -> TushareClientLike
  -> market-data-store.ts
  -> market-data-reader.ts
  -> screening-runner.ts
  -> screening-store.ts
  -> results-snapshot.ts / chart-data.ts
  -> StatusWorkspace / ResultsTable
```

## File Classification

| New or modified file | Role | Closest analog | Pattern to preserve |
|----------------------|------|----------------|---------------------|
| `src/lib/refresh/market-data-types.ts` | Normalized market-data and generation types | `src/lib/refresh/refresh-types.ts` | Plain domain types, no database row names leaking into consumers |
| `src/lib/refresh/market-data-store.ts` | Schema, UPSERTs, generation lifecycle, activation | `src/lib/refresh/refresh-store.ts` | Server-only `better-sqlite3`, prepared statements, short explicit transactions, environment-selected DB path |
| `tests/refresh/market-data-store.test.ts` | Store integration tests | `tests/refresh/refresh-store.test.ts` | Per-test temp database via `REFRESH_DB_PATH`, cleanup after each test |
| `src/lib/refresh/market-data-reader.ts` | Active-generation raw-to-adjusted read model | `src/lib/refresh/fetch-refresh-data.ts` | Pure mapping and validation helpers; same front-adjustment formula |
| `tests/refresh/market-data-reader.test.ts` | Adjustment and skip tests | `tests/refresh/fetch-refresh-data.test.ts` | Injected fixtures, exact factor-ratio assertions, no real provider calls |
| `src/lib/screening/screening-runner.ts` | Select normalized or legacy source | Existing file | Keep `evaluateDowntrendStock` unchanged; isolate source resolution before grouping bars |
| `src/lib/screening/screening-store.ts` | Persist generation provenance | Existing file | Additive schema evolution and immutable screening runs |
| `src/lib/results/chart-data.ts` | Read bars from screening's exact source | Existing file | Reuse persisted row values; do not recompute interval-high semantics |
| `src/lib/refresh/bootstrap-market-data.ts` | Serial first-use 60-day build and activation | `src/lib/refresh/refresh-runner.ts` + `fetch-refresh-data.ts` | Injectable client/clock, sanitized failures, orchestration outside database transactions |
| `tests/refresh/bootstrap-market-data.test.ts` | Bootstrap integration | `tests/refresh/refresh-runner.test.ts` | Injectable workers/runners and deterministic provider tables |
| `src/lib/refresh/fetch-refresh-data.ts` | Provider row mapping for raw quotes/factors/statuses | Existing file | Keep retry/error classification and mapping helpers; remove pre-persistence adjustment |
| `src/lib/refresh/refresh-runner.ts` | Detect bootstrap, complete job, immediately screen | Existing file | Single running-job lock and latest-success failure semantics |
| `src/lib/results/results-types.ts` | Cache-source metadata | Existing file | Discriminated snapshot status plus safe presentation fields |
| `src/lib/results/results-snapshot.ts` | Legacy-result source marker | Existing file | Join persisted screening/chip data without provider calls |
| `src/components/status/status-workspace.tsx` | Bootstrap status copy | Existing component | Reuse status card, button, polling, warning tone, and router refresh |
| `src/components/results/results-table.tsx` | `旧缓存结果` badge | Existing component | Reuse `Badge`, header wrapping, and current table behavior |

## Established Constraints

- Keep `REFRESH_DB_PATH` as the single database location.
- Do not import old adjusted `daily_bars` into raw quote tables.
- Do not perform provider calls inside SQLite transactions.
- Preserve old `stock_basics` and `daily_bars` tables.
- Preserve the existing screening algorithm and chip workflow.
- Normalized-source errors after activation must not silently use legacy bars.
- All user-visible errors remain sanitized.

## Shared Patterns

- Server-side SQLite modules use `REFRESH_DB_PATH`, prepared statements, and short explicit transactions.
- Provider calls stay outside SQLite transactions and return sanitized errors.
- New normalized reads preserve the existing screening algorithm instead of duplicating it.
- UI changes reuse existing components, polling, responsive layout, and warning semantics.

## Test Reuse

- Extend `tests/refresh/refresh-store.test.ts` only for legacy compatibility; put normalized behavior in focused new test files.
- Extend `tests/screening/screening-runner.test.ts` for source selection and missing-factor skips.
- Extend `tests/results/chart-data.test.ts` for exact generation provenance.
- Extend `tests/ui/status-workspace.test.tsx` and `tests/ui/results-table.test.tsx` for the exact UI-SPEC copy.

## Avoided Patterns

- No new ORM or migration framework.
- No parallel provider fetching in Phase 7.
- No global UI redesign or new registry components.
- No cleanup command, disk usage display, or old-table deletion.
