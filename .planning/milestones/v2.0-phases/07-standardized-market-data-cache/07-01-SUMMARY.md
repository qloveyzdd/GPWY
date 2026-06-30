---
phase: 07-standardized-market-data-cache
plan: "07-01"
subsystem: database
tags: [sqlite, normalized-cache, generation, raw-quotes, adjustment-factors]

requires:
  - phase: 06-charts-and-deployment
    provides: "Legacy refresh-job cache, persisted screening results, and chart reads"
provides:
  - "Generation-scoped raw daily quote and adjustment-factor storage"
  - "Global L/P/D stock master with non-destructive upserts"
  - "Strict 60-date validation and atomic active-generation switching"
  - "Explicit failed-building-generation cleanup"
affects: [standardized-market-data-cache, screening, refresh-workflow]

tech-stack:
  added: []
  patterns:
    - "Build normalized data in an inactive generation, validate, then atomically switch one active pointer"
    - "Use generation-scoped natural keys and retain historical rows without automatic deletion"

key-files:
  created:
    - src/lib/refresh/market-data-types.ts
    - src/lib/refresh/market-data-store.ts
    - tests/refresh/market-data-store.test.ts
  modified: []

key-decisions:
  - "Stock master data is global by ts_code while quotes and factors are generation-scoped."
  - "Activation correctness is derived from exactly 60 paired-success manifest rows, not quote row counts."
  - "Failed building generations are explicitly deleted without relying on SQLite foreign-key cascades."

patterns-established:
  - "Normalized market writes use short prepared-statement transactions outside provider calls."
  - "Only a building generation can be validated, activated, or deleted by the lifecycle APIs."

requirements-completed: [DATA-05]

duration: 3 min
completed: 2026-06-26
---

# Phase 07 Plan 01: Normalized Market Data Store Summary

**SQLite generation storage now preserves raw quotes, independent factors, and L/P/D stock status behind a strict atomic activation boundary.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-26T00:54:29+08:00
- **Completed:** 2026-06-26T00:57:01+08:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added normalized domain types for stock status, raw daily quotes, adjustment factors, generation lifecycle, and date manifests.
- Added idempotent SQLite UPSERT APIs using generation-scoped natural keys without modifying legacy cache tables.
- Added strict 60-date paired-success validation, atomic active-pointer switching, prior-generation retirement, and scoped failed-build cleanup.
- Added integration coverage for duplicate writes, historical retention, incomplete activation rejection, active-generation replacement, and cleanup isolation.

## Task Commits

1. **Task 1: Define normalized types and failing store behavior tests** - `c512395` (`test`)
2. **Task 2: Implement generation schema, writes, validation, activation, and cleanup** - `06de916` (`feat`)

**Plan correction:** `2a582bc` fixed requirement ownership so DATA-09 is completed only by the compatibility/UI plan.

## Files Created/Modified

- `src/lib/refresh/market-data-types.ts` - Normalized cache records and lifecycle types.
- `src/lib/refresh/market-data-store.ts` - Schema, UPSERTs, reads, validation, activation, and cleanup.
- `tests/refresh/market-data-store.test.ts` - Store lifecycle and retention integration tests.

## Decisions Made

- Global stock rows are updated in place but never removed by synchronization.
- Raw quotes and factors remain generation-scoped so future rebuilds can coexist before activation.
- Activation checks the persisted manifest again inside the activation transaction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected shared requirement ownership**
- **Found during:** Plan close-out
- **Issue:** DATA-09 appeared in Plans 07-01 and 07-03, which would mark it complete before legacy-result compatibility was implemented.
- **Fix:** Assigned DATA-09 exclusively to Plan 07-04 while keeping the cross-plan behavior intact.
- **Files modified:** `07-01-PLAN.md`, `07-03-PLAN.md`
- **Verification:** `requirements.extract-from-plans` reports DATA-05/06/08/09 with final ownership.
- **Committed in:** `2a582bc`

**Total deviations:** 1 auto-fixed blocking metadata issue. **Impact:** Requirement completion tracking now matches actual delivery order; production scope is unchanged.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-store.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`

All checks passed.

## Next Phase Readiness

Ready for Plan 07-02 to derive dynamically adjusted 60-day bars and persist screening generation provenance.

---
*Phase: 07-standardized-market-data-cache*
*Completed: 2026-06-26*
