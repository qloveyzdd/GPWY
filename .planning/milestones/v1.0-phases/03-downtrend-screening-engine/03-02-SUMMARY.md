---
phase: 03-downtrend-screening-engine
plan: "03-02"
subsystem: downtrend-stock-evaluator
tags: [swing-high, fallback-high, threshold, ma-trend, pure-functions]
requires:
  - phase: 03-01
    provides: "MA and slope helpers"
provides:
  - "Strict local swing-high detection"
  - "60-day highest-high fallback"
  - "Per-stock downtrend evaluator"
  - "Explainable accepted/rejected/skipped result types"
affects: [03-03, 04-chip-peak-integration, 05-results-table-experience, 06-charts-and-deployment]
key-files:
  created:
    - src/lib/screening/downtrend-screen.ts
    - tests/screening/downtrend-screen.test.ts
  modified:
    - src/lib/screening/screening-types.ts
requirements-completed: [SCRN-02, SCRN-03, SCRN-04, SCRN-05, SCRN-06, SCRN-07, SCRN-08]
duration: 3min
completed: 2026-06-23
---

# Phase 03-02: Downtrend Evaluator Summary

**Added pure per-stock downtrend screening logic with strict swing-high detection and 85% threshold evaluation.**

## Accomplishments

- 新增严格波段高点判断：高点必须大于前后各 3 个交易日高点。
- 新增最近波段高点选择：多个波段高点存在时取最新一个。
- 新增 fallback：无严格波段高点时使用最近 60 日最高价的最新出现日期。
- 新增 `evaluateDowntrendStock()`，同时判断 `MA20 < MA60`、MA20 5-point 负斜率和 `current <= high * 0.85`。
- 结果类型区分 `matched`、`rejected`、`skipped`，保留后续表格/图表需要的可解释数值。
- 测试覆盖 swing high、fallback、85% 边界、匹配结果和 60 条数据不足跳过。

## Task Commits

1. **Task 1/2: Downtrend evaluator tests and implementation** - `e3f34a0` (`feat`)

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests\screening\indicators.test.ts tests\screening\downtrend-screen.test.ts` - PASS，9 个测试通过。
- `D:\NodeJS\npm.cmd run typecheck` - PASS。

## Next Phase Readiness

03-03 可以直接复用：

- `evaluateDowntrendStock()` 对每只股票生成筛选状态。
- `DowntrendMatchedResult` 包含当前价、区间高点、比例、下跌幅度、MA20、MA60、MA20 slope 和高点来源。

## Self-Check: PASSED

- 算法仍为纯函数，无数据库/provider 耦合。
- 数据不足明确返回 `skipped`，不会伪造筛选结果。
- 定向测试和类型检查通过。

---
*Phase: 03-downtrend-screening-engine*
*Completed: 2026-06-23*
