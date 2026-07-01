---
phase: 12-decay-based-chip-distribution-model
plan: "12-02"
subsystem: chip-model
tags: [chip-distribution, decay-model, pure-function, tests]
requires:
  - plan: "12-01"
    provides: adjusted chip model bars with turnover and average price
provides:
  - pure decay-based chip distribution algorithm
  - fixed decay coefficient contract
  - structured unavailable reasons for missing model inputs
affects: [chip-model, chip-model-runner, chart-data, ui]
tech-stack:
  added: []
  patterns:
    - "Pure algorithm: no database access, no provider calls, deterministic input/output."
    - "Expected trade-date list can be supplied by runner to detect missing intermediate bars."
key-files:
  created:
    - src/lib/chip/chip-model.ts
    - tests/chip/chip-model.test.ts
  modified:
    - src/lib/chip/chip-types.ts
key-decisions:
  - "The model output source is explicitly `calculated_decay_model` and remains separate from official cyq_chips data."
  - "Daily decay is `clamp(turnoverRate / 100 * decayCoefficient, 0, 1)`."
  - "Newly decayed weight is redistributed into the adjusted daily `[low, high]` range with a triangular kernel centered on adjusted averagePrice."
requirements-completed: [CMOD-01, CMOD-02, CMOD-03, CMOD-04, CMOD-05, VAL-01]
duration: 20 min
completed: 2026-07-01
---

# Phase 12 Plan 12-02: 衰减筹码纯算法总结

12-02 已完成不依赖数据库和网络的纯算法层。算法从种子筹码分布出发，按交易日升序逐日衰减旧筹码，并把被衰减的权重按三角分布分配到当日复权价格区间内。

## 完成内容

- 定义模型版本 `decay-triangle-v1`、固定衰减系数集合和默认系数 `0.5`。
- 新增 `calculateDecayChipDistribution()`，返回 `succeeded` 或结构化 `unavailable`。
- 新增 `applyChipDecayDay()`，实现单日旧筹码衰减和新增筹码三角分布。
- 支持 `expectedTradeDates`，让后续 runner 可以严格发现中间交易日缺失。
- 单元测试覆盖系数校验、单日衰减、目标日推演、缺 seed、缺交易数据、缺换手率、缺复权因子和双目标日期独立计算。

## 任务提交

1. `98283c7` test — 模型公共契约 RED 测试。
2. `d7b1a7e` feat — 模型版本、系数集合、seed 快照返回。
3. `979b671` test — 单日衰减 RED 测试。
4. `4775d5f` feat — 单日衰减和三角分布实现。
5. `4701295` test — 完整推演 RED 测试。
6. `8ec75b1` feat — seed 到 target 的完整逐日推演。
7. `65592f7` test — 中间交易日缺失 RED 测试。
8. `bb4710a` feat — `expectedTradeDates` 覆盖校验。

## 计划内偏差

- 发现算法如果只接收 bars，无法从事实层面判断“中间交易日缺失”；它只能知道目标日是否缺失。
- 修复方式是在纯算法输入中增加可选 `expectedTradeDates`。后续 runner 从 market generation 日期表传入该列表，即可严格校验 seed 后一日至 target 的覆盖关系。

## 验证

- `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-model.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/chip tests/chip`

全部通过。

## 后续衔接

12-03 可以基于该纯算法实现计算分布缓存和后台 runner。runner 需要传入：

- 60 日前官方 seed distribution；
- 12-01 提供的复权一致 model bars；
- generation 内 seed 后一日至 target 的预期交易日列表；
- 固定衰减系数。

