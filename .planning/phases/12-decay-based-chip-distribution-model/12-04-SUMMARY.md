---
phase: 12-decay-based-chip-distribution-model
plan: "12-04"
subsystem: results-ui
tags: [chip-distribution, chart-dto, echarts, smoke]
requires:
  - plan: "12-03"
    provides: calculated chip distribution cache and background runner
provides:
  - chart DTO exposing official and calculated chip distributions separately
  - stock detail coefficient selector for fixed decay coefficients
  - calculated distribution latest/previous charts with model metadata
  - smoke coverage for calculated succeeded and unavailable paths
affects: [results-chart, smoke-db, phase-12-validation]
tech-stack:
  added: []
  patterns:
    - "ChartSnapshot keeps official chipDistributions and calculatedChipDistributions as separate DTO branches."
    - "Coefficient switching is local UI state over cached DTO data; it does not trigger runtime calculation."
key-files:
  created: []
  modified:
    - src/lib/results/chart-types.ts
    - src/lib/results/chart-data.ts
    - src/components/charts/stock-kline-chart.tsx
    - tests/results/chart-data.test.ts
    - tests/ui/stock-kline-chart.test.tsx
    - tests/smoke/seed-smoke-db.ts
    - tests/smoke/app-smoke.spec.ts
key-decisions:
  - "Calculated distributions are rendered in a separate section labeled model output, not mixed into official cyq_chips panels."
  - "The default coefficient is derived from the DTO default 0.5; user selection is local per stock."
  - "Unavailable calculated panels show a reason while official distribution cards remain visible."
requirements-completed: [CMOD-03, CMOD-04, CMOD-05, UI-08, UI-09, UI-10, VAL-02]
duration: 24 min
completed: 2026-07-01
---

# Phase 12 Plan 12-04: 图表 DTO 与计算分布 UI 总结

12-04 已把计算筹码分布接入股票详情页：服务端返回官方分布与计算分布两个独立 DTO 分支，前端默认展示 0.5 系数，并支持固定系数集合的本地切换。

## 完成内容

- `ChartSnapshot` 新增 `calculatedChipDistributions`，按 `0.3 / 0.5 / 0.8 / 1 / 1.2 / 1.5 / 2` 分组返回 latest/previous 计算分布。
- `chart-data.ts` 从 `chip_model_*` 表读取最新计算 run/status/levels，并对错误摘要做脱敏。
- `StockKlineChart` 在官方双日分布下方新增“计算分布”区域，明确显示“模型输出，不等同官方 cyq_chips”。
- 衰减系数选择器默认 0.5，只切换本地 DTO 数据，不触发 API 计算。
- 计算分布卡片显示目标日、种子日、模型版本、衰减系数；不可用时显示原因，官方分布不被覆盖。
- smoke seed 新增计算分布成功与不可用样例；Playwright smoke 覆盖官方 fallback、计算分布标签、系数切换和 canvas 渲染。
- fixture 测试复放 `002565.SZ` 20260629 场景，证明 0.5 与 1.5 系数会产生不同峰值占比。

## 任务提交

1. `34b6b23` test — Chart DTO 计算分布 RED 测试。
2. `1ae1fb3` feat — 服务端 calculated chart DTO 聚合。
3. `e71a665` test — UI 系数选择与计算分布 RED 测试。
4. `52b3f07` feat — 详情页计算分布 selector 与双日图表。
5. `c24995d` test — smoke 与 fixture 对比 RED 覆盖。
6. `413c87d` feat — smoke seed 计算分布数据与不可用原因展示。

## 偏差与修正

### Auto-fixed Issues

**1. [Rule 3 - Blocking] smoke 中交易日标题变为官方/计算双份后 strict locator 冲突**

- **Found during:** Task 3 smoke RED/GREEN。
- **Issue:** Phase 12 增加计算分布卡片后，`最新有效交易日 20260060` 和 `前一有效交易日 20260059` 同时出现在官方卡片和计算卡片，旧 smoke 的 `toBeVisible()` strict locator 不再唯一。
- **Fix:** smoke 改为断言数量，明确验证官方和计算分布各一份。
- **Files modified:** `tests/smoke/app-smoke.spec.ts`
- **Verification:** `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line`
- **Committed in:** `413c87d`

**2. [Rule 3 - Blocking] 计算分布不可用原因在 smoke 中不够稳定**

- **Found during:** Task 3 smoke GREEN。
- **Issue:** 切换到 1.0 系数后，blocked 卡片只稳定暴露状态与目标/种子日；不可用原因没有在卡片头部呈现。
- **Fix:** 在计算分布不可用卡片头部增加 `原因：...`，保留正文说明，便于用户快速识别不可用原因。
- **Files modified:** `src/components/charts/stock-kline-chart.tsx`, `tests/smoke/app-smoke.spec.ts`
- **Verification:** UI 单测、lint、typecheck、smoke 和 full verify 全部通过。
- **Committed in:** `413c87d`

---

**Total deviations:** 2 auto-fixed blocking issues.
**Impact on plan:** 修正均服务于原计划的 UI-10 fallback 与 smoke 可验证性，无范围扩张。

## 验证

- `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/stock-kline-chart.test.tsx` — 2 files / 18 tests passed.
- `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` — 1 browser smoke passed.
- `D:\NodeJS\npm.cmd run verify` — typecheck、lint、33 个测试文件 / 213 tests、Next build 全部通过。
- `D:\NodeJS\gsd-sdk.cmd query verify.schema-drift "12"` — `drift_detected: false`。

## 后续衔接

Phase 12 的数据输入、模型、缓存 runner 和 UI 路径已经闭环。下一步可以执行里程碑收尾，或基于该模型继续规划新的需求。

