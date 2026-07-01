---
phase: 12-decay-based-chip-distribution-model
plan: "12-03"
subsystem: chip-model-runner
tags: [chip-distribution, cache, background-runner, refresh]
requires:
  - plan: "12-01"
    provides: model bars with amount, turnover, and adjustment factors
  - plan: "12-02"
    provides: pure decay-based chip distribution algorithm
provides:
  - calculated chip distribution cache
  - seed snapshot cache
  - background calculated distribution runner
  - refresh background integration
affects: [chip-model, chip-store, refresh-runner, smoke-db]
tech-stack:
  added: []
  patterns:
    - "Official cyq_chips, seed snapshots, and calculated distributions are stored in separate tables."
    - "Default market cache window is 62 trading dates; screening still reads latest 60 bars."
key-files:
  created:
    - src/lib/chip/chip-model-store.ts
    - src/lib/chip/chip-model-runner.ts
    - tests/chip/chip-model-store.test.ts
    - tests/chip/chip-model-runner.test.ts
    - tests/fixtures/chip-model/002565-20260626-20260629.json
  modified:
    - src/lib/chip/chip-types.ts
    - src/lib/refresh/refresh-runner.ts
    - src/lib/refresh/fetch-refresh-data.ts
    - tests/refresh/*.test.ts
    - tests/smoke/seed-smoke-db.ts
key-decisions:
  - "Cache key includes tsCode, targetTradeDate, seedTradeDate, decayCoefficient, and modelVersion."
  - "Seed snapshot is adjusted into target-date price scale and keyed by tsCode, targetTradeDate, seedTradeDate, and modelVersion."
  - "Default refresh chip background now runs official distribution first, then calculated distribution."
requirements-completed: [DATA-10, DATA-11, DATA-12, CMOD-01, CMOD-03, CMOD-04, CMOD-05, VAL-01, VAL-02]
duration: 45 min
completed: 2026-07-01
---

# Phase 12 Plan 12-03: 计算分布缓存与后台 runner 总结

12-03 已完成计算筹码分布的持久化、seed 定位、后台预计算和刷新后处理接入。

## 完成内容

- 新增独立 `chip_model_*` 表，计算结果不写入官方 `chip_distribution_levels`。
- 新增 seed snapshot 存储，保存复权到目标日口径后的种子分布。
- 新增 seed resolver：按 target 向前 60 个有效交易日定位 seed，并优先复用官方缓存；缺失时可通过 `cyq_chips` provider 获取。
- 新增 calculated runner：仅对当前筛选结果计算 latest/previous × 7 个固定衰减系数。
- 默认刷新后处理改为先跑官方双日分布，再跑计算分布；用户注入 runner 时仍保持原有覆盖语义。
- 默认 market cache 窗口从 60 扩到 62，以支持 latest 和 previous 各自向前 60 日 seed；筛选 reader 仍截取最新 60 日，不改变筛选窗口。
- 新增 `002565.SZ` 两目标日、多系数 fixture，用于观察衰减系数对分布形态的影响。

## 任务提交

1. `457027f` test — 计算分布 store RED 测试。
2. `7a6d593` feat — 独立 calculated store、seed snapshot、run/status/work planner。
3. `12c4c88` test — seed resolver RED 测试。
4. `e149b76` feat — 60 日前 seed 定位、官方 seed 获取、seed snapshot 复权转换。
5. `70c39dc` test — calculated runner RED 测试。
6. `720ee6b` test — refresh 默认后处理接入 RED 测试。
7. `ca4b9ee` feat — 后台计算 runner、刷新后处理接入、fixture。
8. `93e7f49` fix — 默认缓存窗口扩展为 62 日，避免真实刷新无法定位 latest/previous seed。

## 偏差与修正

- 计划中指出 60 日 generation 不足以定位 seed。实现过程中确认这会导致真实默认刷新无法计算 latest/previous 的 60 日前 seed。
- 已将默认缓存窗口扩展为 62 日；由于筛选读取层仍 `slice(-60)`，筛选语义不变。

## 验证

- `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-model-store.test.ts tests/chip/chip-model-runner.test.ts tests/refresh/refresh-runner.test.ts tests/refresh/fetch-refresh-data.test.ts tests/refresh/bootstrap-market-data.test.ts tests/refresh/full-rebuild-runner.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/chip src/lib/refresh tests/chip tests/refresh`

全部通过。

## 后续衔接

12-04 可以从 `chip_model_*` 表读取 calculated distribution，并在图表 DTO/UI 中提供默认 `0.5` 和固定系数切换。

