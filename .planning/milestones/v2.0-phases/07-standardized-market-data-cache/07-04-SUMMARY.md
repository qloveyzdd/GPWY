---
phase: 07-standardized-market-data-cache
plan: "07-04"
subsystem: results-ui
tags: [bootstrap-status, legacy-results, provenance, concurrency]

requires:
  - phase: 07-standardized-market-data-cache
    plan: "07-03"
    provides: "Durable bootstrap mode and automatic normalized-cache activation"
provides:
  - "Safe legacy/normalized result-source metadata"
  - "Exact bootstrap status copy and persistent legacy-result marker"
  - "Normalized cache statistics in refresh status"
  - "Run-consistent screening, chip, and chart reads"
affects: [refresh-ui, results-table, chart-data, incremental-refresh]

tech-stack:
  added: []
  patterns:
    - "Client DTOs expose cache source categories without internal generation identifiers"
    - "Persisted run IDs are used for all dependent reads instead of repeated latest queries"

key-files:
  created: []
  modified:
    - src/lib/results/results-types.ts
    - src/lib/results/results-snapshot.ts
    - src/components/status/status-workspace.tsx
    - src/components/results/results-table.tsx
    - src/lib/refresh/market-data-store.ts
    - src/lib/refresh/refresh-runner.ts
    - src/lib/screening/screening-store.ts
    - src/lib/chip/chip-store.ts
    - src/lib/results/chart-data.ts
    - tests/results/results-snapshot.test.ts
    - tests/ui/status-workspace.test.tsx
    - tests/ui/results-table.test.tsx
    - tests/refresh/refresh-runner.test.ts
    - tests/screening/screening-store.test.ts
    - tests/chip/chip-store.test.ts

key-decisions:
  - "Legacy-result labeling is derived only from persisted screening provenance."
  - "Bootstrap status exposes mode and copy but never generation ids, table names, paths, or provider payloads."
  - "Dependent result and chart reads remain bound to one screening/chip run even when a new refresh commits concurrently."

patterns-established:
  - "A ready results snapshot has a safe cacheSource category; empty and unavailable snapshots use null."
  - "Active normalized cache statistics take precedence over legacy refresh-job table counts."

requirements-completed: [DATA-09]

duration: 12 min
completed: 2026-06-26
---

# Phase 07 Plan 04: Cache Compatibility UI Summary

**Bootstrap now has explicit user-facing state, legacy results remain usable and labeled, and result/chart provenance stays consistent during concurrent refresh completion.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-26T01:17:00+08:00
- **Completed:** 2026-06-26T01:29:00+08:00
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Added safe `legacy`/`normalized` result-source metadata without exposing storage internals.
- Added the exact `正在初始化缓存` state and explanatory copy while preserving the existing polling loop.
- Added one `旧缓存结果` marker for non-empty legacy screening results without changing table sorting or chart interaction.
- Corrected refresh status to report active normalized-cache counts after bootstrap.
- Bound screening rows, chip rows, and chart provenance to exact persisted run IDs to prevent cross-run mixing.

## Task Commits

1. **Task 1: Expose safe result cache source** - `9294a28` (`feat`)
2. **Task 2: Show bootstrap and legacy result states** - `5a84387` (`feat`)
3. **Compatibility fix: Report normalized cache statistics** - `fc9a087` (`fix`)
4. **Review fix: Keep dependent reads on one source run** - `7479887` (`fix`)

## Decisions Made

- Empty results do not display a legacy marker because there are no usable old rows to identify.
- Bootstrap mode remains a refresh-job property so activation does not prematurely change the running UI state.
- Exact-run store APIs are the consistency boundary for results and charts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Normalized cache status still read legacy counts**
- **Found during:** Phase compatibility review
- **Issue:** A successful bootstrap could display zero cached stocks and bars because status statistics came from legacy refresh tables.
- **Fix:** Added active normalized-cache statistics and preferred them in refresh status.
- **Committed in:** `fc9a087`

**2. [Rule 1 - Bug] Latest-run queries could mix concurrent screening generations**
- **Found during:** Required code review gate
- **Issue:** Separate latest-run queries could combine old provenance with newly committed screening or chip rows.
- **Fix:** Added exact-run readers and made results/chart reads follow one persisted screening run.
- **Committed in:** `7479887`

**3. [Rule 1 - Bug] Activation error handling could attempt rollback after commit**
- **Found during:** Required code review gate
- **Issue:** A post-commit validation failure would enter a catch block that always rolled back.
- **Fix:** Validate the active generation row before committing the activation transaction.
- **Committed in:** `7479887`

## Verification

- `D:\NodeJS\npm.cmd run verify`
- 26 test files and 113 tests passed.
- Type checking, ESLint, and the production Next.js build passed.
- `gsd-sdk query verify.schema-drift 7` reported no schema drift.

## Next Phase Readiness

Phase 7 implementation is ready for final goal verification. Phase 8 can add controlled provider concurrency without changing the normalized storage or provenance contracts.

---
*Phase: 07-standardized-market-data-cache*
*Completed: 2026-06-26*
