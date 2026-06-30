---
phase: 07-standardized-market-data-cache
plan: "07-02"
subsystem: data-workflow
tags: [dynamic-adjustment, screening, provenance, chart-data, sqlite]

requires:
  - phase: 07-standardized-market-data-cache
    plan: "07-01"
    provides: "Generation-scoped raw quotes, factors, stock master, and active generation pointer"
provides:
  - "Dynamic front-adjusted 60-day bars using each stock's latest factor basis"
  - "Structured missing-factor and insufficient-history screening skips"
  - "Screening-run generation provenance and exact-source chart reads"
  - "Legacy reads only for screening runs without normalized generation provenance"
affects: [bootstrap, screening, results, charts]

tech-stack:
  added: []
  patterns:
    - "Resolve legacy versus normalized source once before screening evaluation"
    - "Persist screening source generation and skip reasons for reproducibility"

key-files:
  created:
    - src/lib/refresh/market-data-reader.ts
    - tests/refresh/market-data-reader.test.ts
  modified:
    - src/lib/screening/screening-types.ts
    - src/lib/screening/screening-store.ts
    - src/lib/screening/screening-runner.ts
    - src/lib/results/chart-data.ts
    - tests/screening/screening-store.test.ts
    - tests/screening/screening-runner.test.ts
    - tests/results/chart-data.test.ts

key-decisions:
  - "Each stock uses its own latest selected bar factor as the front-adjustment basis."
  - "A normalized screening run never falls back to legacy bars when factor coverage is invalid."
  - "Chart reads follow persisted screening provenance, including retired generations."

patterns-established:
  - "Screening skips are immutable child rows of a screening run."
  - "Bulk normalized screening reads quotes and factors once, then groups in memory by stock."

requirements-completed: [DATA-06]

duration: 6 min
completed: 2026-06-26
---

# Phase 07 Plan 02: Dynamic Adjustment And Provenance Summary

**Screening and charts now derive front-adjusted prices from raw generation data and remain bound to the exact generation that produced each result.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-26T00:59:17+08:00
- **Completed:** 2026-06-26T01:04:30+08:00
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added a normalized reader that selects the latest 60 raw bars per stock and applies `raw × dayFactor / latestStockFactor`.
- Excluded non-listed stocks from screening without deleting their history.
- Added structured `missing_adjustment_factor` and `insufficient_bars` skip persistence.
- Added additive screening schema migration for `source_market_generation_id`.
- Changed chart reads to use the screening run's exact generation and prohibited normalized-to-legacy fallback.

## Task Commits

1. **Task 1 RED: Define dynamic adjustment behavior** - `903bcc5` (`test`)
2. **Task 1 GREEN: Implement normalized adjustment reader** - `af58c56` (`feat`)
3. **Task 2 RED: Cover provenance, skips, and chart source routing** - `5b255c4` (`test`)
4. **Task 2 GREEN: Persist provenance and route screening/chart reads** - `92def64` (`feat`)

## Files Created/Modified

- `src/lib/refresh/market-data-reader.ts` - Bulk dynamic adjustment reader and exact-stock chart reader.
- `src/lib/screening/screening-types.ts` - Generation provenance and screening skip contracts.
- `src/lib/screening/screening-store.ts` - Additive schema migration and immutable skip storage.
- `src/lib/screening/screening-runner.ts` - One-time legacy/normalized source resolution.
- `src/lib/results/chart-data.ts` - Exact generation chart reads.
- `tests/refresh/market-data-reader.test.ts` - Factor basis, windowing, status filtering, and missing-factor coverage.
- `tests/screening/screening-store.test.ts` - Provenance and skip persistence coverage.
- `tests/screening/screening-runner.test.ts` - Active generation screening coverage.
- `tests/results/chart-data.test.ts` - Exact generation and no-fallback coverage.

## Decisions Made

- Stocks with no bars continue to the existing evaluator and become `insufficient_bars`; only invalid factor coverage is rejected by the reader.
- Exact-generation chart reads do not filter on the stock's current L/P/D status because historical results must remain reproducible.
- Screening keeps the legacy refresh-job id for compatibility while adding nullable generation provenance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Exact floating-point equality in one adjustment assertion differed at the final decimal; the test now uses a strict `toBeCloseTo` tolerance.

## User Setup Required

None - no external service configuration required.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-reader.test.ts tests/screening/screening-store.test.ts tests/screening/screening-runner.test.ts tests/results/chart-data.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`

All 13 focused tests and type checking passed.

## Next Phase Readiness

Ready for Plan 07-03 to fetch raw provider data, build the first 60-day generation, activate it, and immediately run normalized screening.

---
*Phase: 07-standardized-market-data-cache*
*Completed: 2026-06-26*
