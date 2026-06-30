---
phase: 08-controlled-provider-concurrency
status: passed
verified_at: 2026-06-26T07:55:46+08:00
verified_by: codex
score: 24/24
requirements:
  - REFR-06
  - REFR-07
  - REFR-08
---

# Phase 08 Verification

## Result

Passed. Phase 8 establishes one process-level provider scheduler, bounded retry
and adaptive concurrency, abortable REST requests, persistent tinyshare worker
pools, and controlled workflow fan-out for market and chip data.

## Goal and Must-Haves

- **24/24 plan truths verified.**
- REST and tinyshare production clients are wrapped by
  `ScheduledTushareClient` and share one `globalThis` runtime scheduler.
- Scheduler behavior is covered for hard peak limits, three attempts,
  exponential backoff, rate-limit reduction, recovery, priority, aging and
  actual AbortSignal propagation.
- tinyshare uses fixed persistent slots with request IDs, per-slot serial
  execution, bounded rebuilds, safe terminal pool failure and idempotent close.
- Market bootstrap and chip enrichment submit independent tasks concurrently
  while retaining Phase 7 activation, cleanup and row-level failure semantics.

## Requirements Checked

- **REFR-06:** `TUSHARE_MAX_CONCURRENCY`,
  `TUSHARE_REQUEST_TIMEOUT_MS` and `TINYSHARE_WORKER_COUNT` are server-only,
  range-validated settings. Runtime and workflow integration tests prove
  underlying request peaks do not exceed the configured scheduler limit.
- **REFR-07:** Only `rate_limited` and `network_or_service` retry, with at most
  three total attempts and exponential jittered backoff. Permission, token,
  config, empty and unknown failures do not receive workflow-local retries.
  REST timeout aborts fetch; tinyshare timeout terminates its worker.
- **REFR-08:** tinyshare initializes `pro_api()` once per persistent worker,
  reuses worker PIDs across queries, runs one request per slot, and rebuilds
  failed slots within a fixed budget instead of spawning Python per request.

## Key-Link Evidence

- `provider.ts` calls `getProviderRuntime(env).createClient(token)`;
  `provider-runtime.ts` constructs `ScheduledTushareClient` with its shared
  scheduler.
- `scheduled-client.ts` submits every query to
  `ProviderRequestScheduler.schedule()` and passes the attempt signal to the
  raw client.
- `client.ts` passes that signal into fetch; `tinyshare-client.ts` maps abort
  and timeout to worker termination.
- Validation, market and chip callers explicitly pass `validation`, `market`
  and `chip` priorities respectively.
- `bootstrap-market-data.ts` persists all pending manifests, uses
  `Promise.allSettled`, and only then activates or deletes the generation.
- `chip-runner.ts` reads candidates with `readScreeningResultsForRun(id)` and
  preserves Promise.all input ordering for one transactional run write.

## Automated Evidence

- `D:\NodeJS\npm.cmd run verify`
  - TypeScript passed.
  - ESLint passed.
  - Vitest: 28 files, 149 tests passed.
  - Next.js production build passed.
- Phase-focused matrix: 9 files, 53 tests passed before review fixes.
- Post-review tinyshare/runtime/scheduler matrix: 3 files, 26 tests passed.
- `gsd-sdk query verify.schema-drift 8`
  - `drift_detected: false`
  - `blocking: false`
- Standard-depth code review completed with status `clean`; two worker-init
  recovery issues found during review were fixed and regression-tested.

## Safety and Compatibility

- Tokens are sent to tinyshare only through the init stdin message and are not
  present in argv, snapshots or safe errors.
- Runtime snapshots exclude token, Python path and raw environment values.
- No automatic tinyshare-to-REST fallback exists.
- Provider work runs outside SQLite transactions; writes and activation use
  short synchronous transactions.
- Failed bootstrap cleanup occurs only after all date tasks settle, preventing
  late writes into deleted generations.

## Operational Note

Live provider quotas, account permissions and actual cloud refresh duration
remain deployment measurements rather than code-completion gaps. The new
architecture supplies the controlled concurrency needed to collect those
measurements in Phase 9.
