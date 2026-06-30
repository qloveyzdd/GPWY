# Phase 8: Controlled Provider Concurrency - Implementation Patterns

**Mapped:** 2026-06-26

## Role and Data Flow Map

| Planned artifact | Role | Closest existing analog | Required pattern |
|------------------|------|-------------------------|------------------|
| `src/lib/tushare/request-scheduler.ts` | Backend policy/service | `src/lib/refresh/refresh-runner.ts` | Focused module with injectable dependencies and typed result contracts |
| `src/lib/tushare/scheduled-client.ts` | Adapter | `src/lib/tushare/provider.ts` | Preserve `TushareClientLike`, delegate one layer downward |
| `src/lib/tushare/provider-runtime.ts` | Process runtime registry | Existing module-level provider factory | Server-only singleton, no client-visible secrets |
| `src/lib/tushare/tinyshare-client.ts` | Process pool adapter | Current one-shot bridge client | Keep generic Tushare request/response shape and safe `TushareApiError` |
| `scripts/tinyshare_bridge.py` | Python worker protocol | Current single-request bridge | Preserve dataframe mapping and error sanitization; change lifecycle only |
| Refresh/chip/validation callers | Task producers | Existing `client.query()` calls | Add priority metadata, do not implement local retry |

## Reusable Code Patterns

### Generic client boundary

`TushareClientLike` already keeps all callers independent of REST or tinyshare:

```ts
export type TushareClientLike = {
  query: (
    endpoint: TushareEndpoint,
    params?: Record<string, unknown>,
  ) => Promise<TushareDataTable>;
};
```

Extend this contract minimally with optional query metadata. Do not create
separate refresh/chip/validation client interfaces.

### Stable error classification

`classifyTushareError(error, affectedInterface)` is the single source of truth
for retry decisions and safe summaries. Scheduler policy must switch on
`SafeTushareError.category`; it must not reimplement message matching.

### Provider construction

All production call sites already enter through `createTushareClient(token)`.
The provider runtime and scheduled wrapper should be inserted here so callers
cannot accidentally create independent schedulers.

### Injectable tests

Current tests inject `TushareClientLike` and temporary scripts. Preserve this:

- scheduler constructor accepts clock/delay/random/executor dependencies;
- tinyshare client accepts Python executable and script path;
- runtime exposes explicit create/reset or dispose functions for tests;
- workflow tests may continue injecting simple mock clients.

### SQLite boundary

Provider calls remain outside SQLite transactions. For concurrent bootstrap:

1. create/persist pending manifest state;
2. start provider tasks;
3. write each completed date using short synchronous store calls;
4. wait for all task promises to settle;
5. activate on complete success or delete the building generation on failure.

Never clean a generation while queued tasks may still write to it.

## Naming and Configuration Conventions

- Environment variables use uppercase `TUSHARE_` / `TINYSHARE_` prefixes.
- Recommended names:
  - `TUSHARE_MAX_CONCURRENCY=8`
  - `TUSHARE_REQUEST_TIMEOUT_MS=60000`
  - `TINYSHARE_WORKER_COUNT=2`
- Values are parsed in `src/lib/config.ts`; raw strings and `PYTHON_BIN` never
  appear in `SafeConfigStatus`.
- Request priorities use domain names: `validation`, `market`, `chip`.
- Errors remain `TushareApiError` so existing sanitizers and row-level chip
  behavior continue working.

## Test Placement

- Core scheduler tests: `tests/tushare/request-scheduler.test.ts`
- Runtime sharing tests: `tests/tushare/provider-runtime.test.ts`
- Persistent bridge tests: extend `tests/validation/tinyshare-provider.test.ts`
- Workflow regressions: existing refresh, chip, and validation test files

Use `// @vitest-environment node` for all scheduler/process tests.

## Landmines

- `Promise.race` without abort does not enforce real concurrency.
- A tinyshare pool smaller than scheduler concurrency can create hidden
  head-of-line blocking; runtime effective concurrency must be capped by worker
  count when tinyshare is selected.
- `child.on("error")` and `child.on("close")` may both fire; settle exactly once.
- Persistent stderr must be bounded rather than accumulated for process life.
- Existing `fetch-refresh-data.ts` retry loop must be removed when scheduled
  retry is active.
- Concurrent `daily` and `adj_factor` tasks must not overwrite each other's
  manifest state or permit cleanup before all tasks settle.
