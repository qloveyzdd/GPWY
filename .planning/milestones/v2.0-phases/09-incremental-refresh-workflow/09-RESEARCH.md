# Phase 09 — Incremental Refresh Workflow Research

> Status: complete  
> Date: 2026-06-27  
> Scope: plan-phase research for incremental refresh, resumable market cache, staged refresh status, background chip processing, and full rebuild operations.

## Research Summary

Phase 09 should change the refresh workflow from “single long-running refresh job” into a staged workflow:

1. Ordinary refresh uses the active normalized market cache and only fetches missing or failed `daily` / `adj_factor` data for the target 60 valid trade dates.
2. Screening publishes as soon as market data and screening are complete.
3. Chip peak processing becomes a separate background stage and must not hold refresh job success open.
4. Full rebuild stays outside the web UI and writes a new building generation before atomically activating it.
5. The status API/UI should expose stage-level progress instead of a single opaque refresh state.

The current code already has several useful foundations: generation-based market cache, per-date `daily_status` / `factor_status`, provider concurrency scheduler, sanitized error helper, 2-second polling UI, and chip runner isolation. The main missing pieces are active-generation incremental gap planning, stage-progress persistence, success-boundary separation between screening and chip, and an operations-only full rebuild command.

## Existing System Facts

### Market data cache

- `market_cache_generations` supports `building` and `active` generations.
- `market_generation_dates` already tracks each date independently with `daily_status` and `factor_status`.
- `market_daily_quotes` and `market_adjustment_factors` are keyed by generation/date/stock and can be safely overwritten for a date.
- `validateGenerationInDatabase` is strict and appropriate for bootstrap/full rebuild, but not enough by itself for ordinary incremental resume on an existing active generation.
- `readAdjustedMarketData` currently reads from the active generation without enforcing a paired-success target-date set at read time. Phase 09 should either validate before reading or add a helper that returns the latest 60 paired-success dates.

### Refresh runner

- `startManualRefresh` creates one running job through the existing refresh-job lock.
- With no active generation, refresh still performs bootstrap through `bootstrapMarketData`.
- With an active generation, `createActiveGenerationRefreshWorker` currently only counts tradable stocks and does not download missing market data.
- `finishRefreshJob` currently awaits `chipPeakRunner` before completing the refresh job. This directly conflicts with Phase 09: chip must be background work after screening publication.
- `sanitizeErrorSummary` already strips token/path/secret-like details and should be reused for UI-visible failures.

### Bootstrap and provider access

- `bootstrapMarketData` already fetches target dates, creates pending date rows, fans out per-date daily/factor fetching, waits all settled results, and only activates a building generation after validation.
- The provider scheduler from Phase 08 is already the right concurrency boundary. Phase 09 should reuse it instead of adding a separate queueing abstraction.
- `fetchMarketStocks`, `fetchTargetTradeDates`, `fetchDailyQuotesForDate`, and `fetchAdjustmentFactorsForDate` are reusable building blocks for both ordinary incremental refresh and full rebuild.

### Screening and results

- `screeningRunner` reads the active generation and writes a new screening run.
- `writeLatestResultsSnapshot` exists and can publish the new result immediately after screening.
- Current tests already encode the old behavior where refresh remains running until chip completes. That expectation must be replaced.

### Chip processing

- `chipPeakRunner` reads the latest screening run and processes candidates with scheduled provider concurrency.
- Row-level chip failures are isolated and produce partial results.
- `chip_peak_runs` currently records terminal chip states, not in-progress stage snapshots. Phase 09 can represent in-progress chip state in refresh stage progress without changing Phase 10’s dual-day chip schema.

### UI status

- `StatusWorkspace` currently renders high-level validation cards and a single refresh summary.
- It polls `/api/refresh/status` every ~2 seconds while `isRunning` is true and refreshes the page when the job stops.
- Phase 09 needs polling to continue while either refresh or chip background work is active, and page data should refresh when the screening stage completes, not only when chip completes.

### Operations

- `package.json` has `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `smoke`, and `verify`.
- No full-rebuild CLI/npm script exists yet.
- Full rebuild must not be exposed as a web action.

## Recommended Plan Slices

### Slice 1 — Store and progress model

- Add a small refresh-stage progress persistence layer instead of overloading `refresh_jobs`.
- Track stages from the Phase 09 context: 股票列表, 行情/复权, 筛选, 筹码处理.
- Store status, total, completed, failed, started/finished timestamps, duration, retry count where meaningful, and sanitized error summary.
- Add helpers for:
  - planning missing/failed active-generation date items;
  - checking whether the active generation has a complete latest-60 paired-success target set;
  - exposing a stable status snapshot for the API/UI.

### Slice 2 — Ordinary incremental refresh

- On ordinary refresh:
  - fetch/update stock list;
  - fetch target 60 trade dates;
  - compare target dates with `market_generation_dates`;
  - request only missing or failed `daily` / `adj_factor` items;
  - preserve partial successes on failure;
  - run screening only after all target 60 dates have both data types succeeded;
  - keep old screening result if market or screening fails.
- If no new target date exists and all target 60 dates are already complete, skip market/factor downloads and rerun screening only if the plan chooses to refresh stock metadata/screening deterministically.

### Slice 3 — Refresh success boundary and background chip

- Complete the refresh job after market/factor completion and screening publication.
- Start chip processing asynchronously after screening success.
- Chip failures should update the chip stage status but not change the refresh job from succeeded to failed.
- The manual refresh lock should still block while any ordinary refresh, chip background stage, or full rebuild is active.

### Slice 4 — Full rebuild CLI

- Add an operations-only command/script for full rebuild.
- Reuse the existing building-generation bootstrap behavior:
  - write building generation;
  - validate all 60 target dates;
  - activate only after validation;
  - preserve old active cache/results on failure.
- Do not add a webpage full-rebuild button.

### Slice 5 — Status API and UI

- Extend `/api/refresh/status` with stage-level progress and a `resultVersion` or equivalent marker that changes after screening publication.
- UI should show stage cards for 股票列表, 行情/复权, 筛选, 筹码处理.
- UI should show sanitized summary and failure count only.
- UI should refresh result data immediately when screening completion is observed, while still showing chip processing progress if chip continues.

## Implementation Recommendations

- Keep the implementation inside the existing `src/lib/refresh`, `src/lib/screening`, `src/lib/chip`, `src/app/api/refresh`, and status UI boundaries.
- Do not introduce Redis or a separate queue. The current single-process/manual-refresh scope can be handled with SQLite state plus the existing provider scheduler.
- Prefer small helpers over broad abstractions:
  - `planActiveGenerationMarketWork`
  - `refreshActiveGenerationMarketData`
  - `assertActiveGenerationReadyForScreening`
  - `startChipStageInBackground`
  - `readRefreshStageSnapshot`
- Treat bootstrap/full rebuild and ordinary incremental refresh as different workflows. Bootstrap/full rebuild can remain strict and all-or-nothing for a new generation; ordinary refresh must be resumable on the active generation.
- Use the existing sanitized error helper consistently before persisting or returning UI-facing errors.

## Risks / Pitfalls

- If `readAdjustedMarketData` reads an active generation without paired-success validation, screening can accidentally include incomplete or stale date windows.
- If chip work still shares the refresh job terminal status, the user will continue seeing refresh durations measured by chip latency rather than actionable screening latency.
- If the UI only polls while `refreshStatus.isRunning`, background chip progress will disappear after refresh success.
- If full rebuild and ordinary refresh are not mutually exclusive, active-generation writes and building-generation activation can race.
- If retry counts are modeled too early, complexity can grow without improving Phase 09 acceptance. Store retry count only where existing provider retries expose meaningful data.
- If all failures are compressed into one job-level error, users cannot distinguish market data failure from chip partial failure.

## Validation Architecture

Phase 09 needs validation at three levels: store behavior, refresh orchestration, and UI status behavior.

### Store and orchestration tests

- Add/extend `tests/refresh/market-data-store.test.ts` for:
  - identifying missing target dates;
  - identifying failed `daily` and failed `adj_factor` independently;
  - confirming paired-success readiness for latest 60 target dates;
  - preserving active generation while a building/full rebuild generation fails.
- Add/extend `tests/refresh/refresh-runner.test.ts` for:
  - no redownload when all target 60 dates are complete;
  - fetching only missing/failed date items;
  - retaining partial successful date writes across a failed run;
  - not publishing new screening when market data is incomplete;
  - completing refresh after screening while chip continues in background;
  - blocking a new refresh while background chip/full rebuild is active.
- Add/extend `tests/refresh/bootstrap-market-data.test.ts` only where full rebuild behavior diverges from bootstrap.

### Chip tests

- Extend `tests/chip/chip-runner.test.ts` or add a refresh-stage test to prove chip failure updates chip-stage status without failing the completed refresh.
- Phase 10 owns dual-day chip distribution semantics; Phase 09 only needs background progress and failure isolation.

### UI tests

- Extend `tests/ui/status-workspace.test.tsx` for:
  - rendering all four stage cards;
  - continuing polling while chip is active after refresh success;
  - refreshing page data when screening completion marker changes;
  - showing sanitized errors without token/path leakage.

### CLI and command verification

- Add a test or smoke check for the full rebuild command path if practical.
- Required verification commands:
  - `npm run test -- --run tests/refresh/market-data-store.test.ts`
  - `npm run test -- --run tests/refresh/refresh-runner.test.ts`
  - `npm run test -- --run tests/ui/status-workspace.test.tsx`
  - `npm run test -- --run tests/chip/chip-runner.test.ts`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run verify`

## Files to Plan

- `src/lib/refresh/refresh-runner.ts`
- `src/lib/refresh/market-data-store.ts`
- `src/lib/refresh/bootstrap-market-data.ts`
- `src/lib/refresh/fetch-refresh-data.ts`
- `src/lib/refresh/refresh-store.ts`
- `src/lib/refresh/refresh-types.ts`
- `src/lib/refresh/market-data-reader.ts`
- `src/lib/screening/screening-runner.ts`
- `src/lib/results/results-snapshot.ts`
- `src/lib/chip/chip-runner.ts`
- `src/lib/chip/chip-store.ts`
- `src/app/api/refresh/run/route.ts`
- `src/app/api/refresh/status/route.ts`
- `src/components/status/status-workspace.tsx`
- `src/app/page.tsx`
- `package.json`
- `tests/refresh/market-data-store.test.ts`
- `tests/refresh/refresh-runner.test.ts`
- `tests/refresh/bootstrap-market-data.test.ts`
- `tests/ui/status-workspace.test.tsx`
- `tests/chip/chip-runner.test.ts`

## Open Questions (RESOLVED)

No blocking product question remains for planning. The remaining gate is procedural: this phase has UI scope and should receive a `09-UI-SPEC.md` before detailed implementation planning, unless the user explicitly chooses to skip the UI gate.

## RESEARCH COMPLETE
