---
phase: 12-decay-based-chip-distribution-model
status: passed
verified_at: 2026-07-01T11:24:00+08:00
requirements:
  - DATA-10
  - DATA-11
  - DATA-12
  - CMOD-01
  - CMOD-02
  - CMOD-03
  - CMOD-04
  - CMOD-05
  - UI-08
  - UI-09
  - UI-10
  - VAL-01
  - VAL-02
source_plans:
  - 12-01-PLAN.md
  - 12-02-PLAN.md
  - 12-03-PLAN.md
  - 12-04-PLAN.md
source_summaries:
  - 12-01-SUMMARY.md
  - 12-02-SUMMARY.md
  - 12-03-SUMMARY.md
  - 12-04-SUMMARY.md
---

# Phase 12 Verification: Decay-Based Chip Distribution Model

## Result

**PASSED.** Phase 12 achieved its roadmap goal: the system can use a 60-trading-day-prior official seed distribution, transform it with daily trading data and fixed decay coefficients, compute target-day distributions on demand in stock detail, and display them with explicit model labeling.

## Requirement Traceability

| Requirement | Verification Result | Evidence |
|-------------|---------------------|----------|
| DATA-10 | Passed | 12-03 seed resolver locates the 60-trading-day-prior target and reads/fetches official `cyq_chips`; runner tests cover seed lookup and missing seed status. |
| DATA-11 | Passed | 12-01 market reader exposes adjusted OHLC, amount-derived average price, turnover rate, and adjustment factor; refresh/fetch tests passed. |
| DATA-12 | Passed | `chip_distribution_*` stores official distributions and `chip_model_seed_snapshots` stores adjusted seed snapshots; chart-data tests assert target-day calculated levels are not written to `chip_model_levels`. |
| CMOD-01 | Passed | `calculateDecayChipDistribution` applies day-by-day transformations from seed date to target date; model tests and fixture replay passed. |
| CMOD-02 | Passed | The model uses turnover rate, daily price interval, average price, and adjustment factor; invalid/missing inputs return structured unavailable results. |
| CMOD-03 | Passed | Supported coefficient set is fixed at `0.3 / 0.5 / 0.8 / 1 / 1.2 / 1.5 / 2`; DTO and UI selector expose only that set. |
| CMOD-04 | Passed | On-demand result keys include stock, target date, seed date, coefficient, and model version; unavailable statuses keep reason/error fields without requiring a persisted calculated run. |
| CMOD-05 | Passed | Runner and UI handle latest and previous targets independently; tests cover one day available while the other is blocked/missing. |
| UI-08 | Passed | `StockKlineChart` renders a coefficient selector and switches chart data locally; component and smoke tests assert default 0.5 and switch to 1. |
| UI-09 | Passed | UI labels the section “计算分布” and shows “模型输出，不等同官方 cyq_chips”, target day, seed day, coefficient, and model version. |
| UI-10 | Passed | Calculated unavailable cards display `原因：...`; official distribution charts remain visible in component and smoke tests. |
| VAL-01 | Passed | Algorithm tests cover coefficient parsing, decay behavior, adjustment factors, missing inputs, and dual target dates. |
| VAL-02 | Passed | Fixture `002565-20260626-20260629.json` is replayed in tests; 0.5 and 1.5 produce different peak percentages. |

## Must-Haves Checked

- Official distributions, seed snapshots, and on-demand calculated DTOs remain separate; target-day calculated levels are not persisted by default.
- Default detail view uses coefficient 0.5.
- Selector allows only the fixed coefficient set.
- Coefficient switching uses the current chart DTO; the chart API calculates all supported coefficients on demand when stock detail is opened.
- Calculated charts show latest and previous target dates.
- Calculated unavailable state does not remove official distribution cards.
- Error summaries are sanitized before reaching UI.
- Full production build and browser smoke pass.

## Automated Verification

| Check | Status | Notes |
|-------|--------|-------|
| Focused chart/UI tests | Passed | `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/stock-kline-chart.test.tsx` — 18 tests. |
| Browser smoke | Passed | `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` — protected workspace, official fallback, calculated section, selector switch. |
| Full verify | Passed | `D:\NodeJS\npm.cmd run verify` — typecheck, lint, 33 test files / 213 tests, Next build. |
| Schema drift | Passed | `D:\NodeJS\gsd-sdk.cmd query verify.schema-drift "12"` returned `drift_detected: false`. |
| Sensitive output guard | Passed | chart-data/UI tests assert token/header/local path snippets are removed from returned/displayed errors. |

## Manual Verification

No mandatory human verification remains. Visual similarity to Tongdaxin/Tonghuashun remains out of scope for v2.1 because those algorithms are not public; Phase 12 only claims a labeled, reproducible internal model.

## Gaps

None.

## Final Status

Phase 12 is ready for milestone close-out.
