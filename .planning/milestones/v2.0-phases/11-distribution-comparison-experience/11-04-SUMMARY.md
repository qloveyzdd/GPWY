---
phase: 11-distribution-comparison-experience
plan: 11-04
subsystem: smoke-verification
tags: [playwright, smoke, verification, chip-distribution]
requires:
  - phase: 11-02
    provides: simplified results table without chip peak column
  - phase: 11-03
    provides: stock detail K-line plus dual distribution chart cards
provides:
  - Browser smoke coverage for protected workspace dual distribution path
  - Full phase verification evidence across focused tests, smoke, verify, and static residual checks
  - Build-safe chart DTO aggregation that preserves latest distribution panel in production output
affects: [phase-11-verification, smoke-suite, chart-data-api]
tech-stack:
  added: []
  patterns: [browser-smoke-for-protected-chart-path, build-output-regression-check]
key-files:
  created: []
  modified:
    - tests/smoke/app-smoke.spec.ts
    - src/lib/results/chart-data.ts
    - src/components/charts/stock-kline-chart.tsx
    - tests/ui/stock-kline-chart.test.tsx
key-decisions:
  - "Smoke asserts distribution dates and chart canvases instead of legacy top-three chip peak text."
  - "Chart DTO shared-scale aggregation now materializes previous/latest panels before computing scale to avoid Turbopack reordering."
patterns-established:
  - "Smoke should assert absent legacy UI strings while using seeded chip_distribution_* rows as the behavior source."
  - "Client chart rendering tolerates missing panel keys as missing-state cards without reading legacy chip peak fields."
requirements-completed: [UI-05, CHRT-07, CHRT-08, CHRT-09, CHRT-10, CHRT-11]
duration: 10 min
completed: 2026-06-30
---

# Phase 11 Plan 11-04: Smoke Verification Summary

**Protected workspace smoke now proves the simplified table and inline K-line plus previous/latest distribution experience from seeded distribution data.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-30T06:26:00+08:00
- **Completed:** 2026-06-30T06:35:39+08:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Updated browser smoke from legacy “top three chip peaks” assertions to dual chip distribution assertions.
- Verified the protected workspace shows no full rebuild entry and no chip peak table column.
- Covered 000002 blocked distribution cards without token/path leakage.
- Covered 000001 K-line plus previous/latest distribution chart canvases and max-percent labels.
- Confirmed the existing smoke seed already drives latest/previous succeeded and blocked distribution states; no seed changes were required.
- Ran focused tests, full `verify`, smoke, and static residual checks.

## Task Commits

1. **Tasks 1-3: smoke path, seed validation, full phase gate** — `2428d4d` (`test(11-04): verify dual distribution smoke path`)

## Files Created/Modified

- `tests/smoke/app-smoke.spec.ts` — validates protected login path, no legacy chip peak table surface, blocked distribution cards, and available dual distribution charts.
- `src/lib/results/chart-data.ts` — adjusts shared-scale aggregation shape so production build preserves both previous and latest panels.
- `src/components/charts/stock-kline-chart.tsx` — adds missing-panel fallback that does not depend on legacy chip peak UI fields.
- `tests/ui/stock-kline-chart.test.tsx` — adds regression coverage for incomplete DTO panel data.

## Decisions Made

- Kept legacy chip peak seed rows in smoke data for backward compatibility, but smoke assertions no longer depend on them.
- Used `CI=1` for smoke verification to force Playwright to start a fresh production server instead of reusing a possibly stale local server.
- Treated missing distribution panel keys as missing empty-state cards at the UI boundary, while fixing the server aggregation root cause separately.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prevented production build from omitting `chipDistributions.latest`**
- **Found during:** Task 1 browser smoke.
- **Issue:** Playwright trace showed the browser crashed with `Cannot read properties of undefined (reading 'status')`. The API response in the production build had `chipDistributions.previous` and `scale`, but omitted `latest`. Inspecting the compiled route showed Turbopack had reordered the helper expression so `latest` was read before assignment while `scale` was computed.
- **Fix:** Changed `withSharedScale()` to accept a materialized `{ previous, latest }` panel object and return explicit properties after scale calculation. Added a client missing-panel fallback so malformed DTOs render missing cards instead of crashing.
- **Files modified:** `src/lib/results/chart-data.ts`, `src/components/charts/stock-kline-chart.tsx`, `tests/ui/stock-kline-chart.test.tsx`
- **Verification:** `D:\NodeJS\npm.cmd run build`, compiled route inspection, focused Vitest, full `verify`, and smoke all passed.
- **Committed in:** `2428d4d`

---

**Total deviations:** 1 auto-fixed blocking production-build issue.  
**Impact on plan:** No product scope expansion; the fix was required for the planned smoke path to work in the production build.

## Issues Encountered

None unresolved.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx` — passed, 26 tests
- `D:\NodeJS\npm.cmd run typecheck` — passed
- `D:\NodeJS\npm.cmd run lint -- src/lib/results/chart-data.ts src/components/charts tests/ui/stock-kline-chart.test.tsx tests/smoke/app-smoke.spec.ts` — passed
- `D:\NodeJS\npm.cmd run build` — passed
- `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` with `CI=1` — passed, 1 browser test
- `D:\NodeJS\npm.cmd run verify` — passed, 30 test files and 177 tests
- `rg "chipPeakPrice|筹码峰价格|筹码峰[0-9]|chipPeaks|chipPeakState" src\components\results src\components\charts` — no matches

## Self-Check: PASSED

- Browser smoke covers table simplification, blocked distribution cards, and available previous/latest distribution charts.
- Full verification gate passed after the production-build DTO issue was fixed.
- No legacy chip peak UI display strings remain in the Phase 11 table/chart components.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All Phase 11 plans are complete. Ready for phase-level verification and roadmap completion.

---
*Phase: 11-distribution-comparison-experience*
*Completed: 2026-06-30*
