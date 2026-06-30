---
phase: 11-distribution-comparison-experience
status: passed
verified_at: 2026-06-30T06:36:30+08:00
requirements:
  - UI-05
  - CHRT-07
  - CHRT-08
  - CHRT-09
  - CHRT-10
  - CHRT-11
source_plans:
  - 11-01-PLAN.md
  - 11-02-PLAN.md
  - 11-03-PLAN.md
  - 11-04-PLAN.md
source_summaries:
  - 11-01-SUMMARY.md
  - 11-02-SUMMARY.md
  - 11-03-SUMMARY.md
  - 11-04-SUMMARY.md
---

# Phase 11 Verification: Distribution Comparison Experience

## Result

**PASSED.** Phase 11 achieved its roadmap goal: users can compare the latest and previous valid trading day's complete chip distributions in stock detail without relying on table chip peak fields.

## Requirement Traceability

| Requirement | Verification Result | Evidence |
|-------------|---------------------|----------|
| UI-05 | Passed | `results-table.tsx` no longer renders chip peak column, chip status badge, or chip peak sort key; `tests/ui/results-table.test.tsx` passed. |
| CHRT-07 | Passed | `StockKlineChart` renders latest valid trading day distribution from `chipDistributions.latest`; component and smoke tests assert latest distribution chart/date. |
| CHRT-08 | Passed | `StockKlineChart` renders previous valid trading day distribution from `chipDistributions.previous`; component and smoke tests assert previous distribution chart/date. |
| CHRT-09 | Passed | Distribution cards display exact trade dates such as `20260059` and `20260060`; smoke asserts both labels. |
| CHRT-10 | Passed | Component tests cover latest blocked with previous succeeded; smoke covers blocked cards without page failure or secret leakage. |
| CHRT-11 | Passed | K-line markLine only contains interval high and 85% threshold; static grep confirms no legacy chip peak UI strings in chart/table components. |

## Must-Haves Checked

- Results table removes chip peak fields and chip peak sorting.
- Stock detail keeps K-line chart on top and renders previous/latest distribution cards below.
- Distribution charts use shared price levels and max-percent scale from the DTO.
- Successful panels mark only their own maximum-percent level.
- Single-day unavailable states remain local to the affected card.
- Missing panel data degrades to a missing empty-state card instead of crashing the page.
- Browser smoke verifies the protected workspace path, not just isolated components.

## Automated Verification

| Check | Status | Notes |
|-------|--------|-------|
| Focused Vitest | Passed | `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx` — 26 tests. |
| TypeScript | Passed | `D:\NodeJS\npm.cmd run typecheck`. |
| Targeted lint | Passed | `D:\NodeJS\npm.cmd run lint -- src/lib/results/chart-data.ts src/components/charts tests/ui/stock-kline-chart.test.tsx tests/smoke/app-smoke.spec.ts`. |
| Production build | Passed | `D:\NodeJS\npm.cmd run build`. |
| Browser smoke | Passed | `CI=1 D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` — 1 test. |
| Full verify | Passed | `D:\NodeJS\npm.cmd run verify` — 30 test files, 177 tests, build passed. |
| Legacy UI residual grep | Passed | `rg "chipPeakPrice|筹码峰价格|筹码峰[0-9]|chipPeaks|chipPeakState" src\components\results src\components\charts` — no matches. |
| Schema drift | Passed | `D:\NodeJS\gsd-sdk.cmd query verify.schema-drift "11"` returned `drift_detected: false`. |

## Production-Build Finding

Smoke exposed one blocking issue before final pass: the production route build omitted `chipDistributions.latest` because the shared-scale helper was optimized into a bad evaluation order. This was fixed in `src/lib/results/chart-data.ts` by materializing `{ previous, latest }` before scale calculation, and covered by component fallback regression plus production smoke.

## Manual Verification

No mandatory human verification remains. The validation plan listed visual balance as supplementary manual review; automated browser smoke confirms the DOM structure, dates, canvases, and unavailable-card behavior.

## Gaps

None.

## Final Status

Phase 11 is ready to mark complete in the roadmap.
