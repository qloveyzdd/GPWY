---
phase: 12
slug: decay-based-chip-distribution-model
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-01
---

# Phase 12 Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest + Playwright |
| Quick run command | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/fetch-refresh-data.test.ts tests/chip/chip-model.test.ts tests/chip/chip-model-runner.test.ts tests/results/chart-data.test.ts tests/ui/stock-kline-chart.test.tsx` |
| Full suite command | `D:\NodeJS\npm.cmd run verify` |
| Smoke command | `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` |
| Estimated runtime | focused tests < 120s; full verify depends on Next build |

## Sampling Rate

- 每个计划完成后运行该计划列出的 focused tests。
- Wave 1 完成后运行市场数据和纯模型测试，再运行 typecheck。
- Wave 2 完成后运行 runner/store 测试，再运行 typecheck。
- Wave 3 完成后运行 chart-data、UI、smoke 和 full verify。
- 不允许连续三个任务只靠人工检查；每个计划至少有一个自动化验证命令。

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 12-01 | 1 | DATA-11, CMOD-02 | T-12-01 | 市场缓存包含成交额和换手率，不用 `vol` 伪装换手率。 | unit/type | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/fetch-refresh-data.test.ts tests/refresh/market-data-store.test.ts` | ✓ | passed |
| 12-01-02 | 12-01 | 1 | DATA-11, VAL-01 | T-12-02 | 复权一致模型输入包含 OHLC、均价、换手率和缺失原因。 | unit | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-reader.test.ts` | ✓ | passed |
| 12-02-01 | 12-02 | 1 | CMOD-01, CMOD-02, CMOD-03, VAL-01 | T-12-03 | 衰减系数影响旧筹码留存，新筹码只落在当日价格区间内。 | unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-model.test.ts` | ✓ | passed |
| 12-02-02 | 12-02 | 1 | DATA-12, CMOD-04, VAL-01 | T-12-04 | 种子分布与输出归一化，缺失输入返回结构化不可用。 | unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-model.test.ts` | ✓ | passed |
| 12-03-01 | 12-03 | 2 | DATA-10, DATA-12, CMOD-04 | T-12-05 | seed snapshot、computed levels 与官方 `cyq_chips` 隔离存储。 | unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-model-store.test.ts` | ✓ | passed |
| 12-03-02 | 12-03 | 2 | CMOD-01, CMOD-03, CMOD-05, VAL-02 | T-12-06 | 后台为 latest/previous 和 7 个系数生成可复用结果。 | integration | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-model-runner.test.ts tests/refresh/refresh-runner.test.ts` | ✓ | passed |
| 12-04-01 | 12-04 | 3 | UI-08, UI-09, UI-10 | T-12-07 | UI 默认 0.5，可切换固定系数，并标明计算分布口径。 | component | `D:\NodeJS\npm.cmd run test -- --run tests/ui/stock-kline-chart.test.tsx` | ✓ | passed |
| 12-04-02 | 12-04 | 3 | CMOD-04, UI-10 | T-12-08 | 计算分布不可用时保留官方图并显示单日原因。 | unit/component | `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/stock-kline-chart.test.tsx` | ✓ | passed |
| 12-04-03 | 12-04 | 3 | VAL-02 | T-12-09 | 固定 fixture 能复现不同系数的分布差异。 | fixture/unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-model-runner.test.ts tests/results/chart-data.test.ts` | ✓ | passed |
| 12-04-04 | 12-04 | 3 | DATA-10, DATA-11, DATA-12, CMOD-01, CMOD-02, CMOD-03, CMOD-04, CMOD-05, UI-08, UI-09, UI-10, VAL-01, VAL-02 | T-12-10 | 全链路类型、lint、测试、构建通过。 | full | `D:\NodeJS\npm.cmd run verify` | ✓ | passed |

## Wave 0 Requirements

现有测试设施足够：

- Vitest 已覆盖 refresh、chip、results、UI 组件。
- Playwright smoke 已存在。
- SQLite 测试 helper 已可创建缓存表。
- 需要在执行阶段新增 chip-model 与 chip-model-store 的 focused tests。

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 柱状图密度是否比 60 日纯分配更细 | UI-08, VAL-02 | 视觉密度最终需要人工确认 | 使用固定 fixture 打开详情页，切换 0.3/0.5/1.0/2.0，确认分布形态变化可辨识。 |
| 计算分布标签是否不会误导为官方数据 | UI-09 | 文案清晰度需要人工判断 | 查看 latest/previous 两张图，确认显示“计算分布”、目标日、种子日、系数、模型版本。 |

## Validation Sign-Off

- [x] 所有计划都有自动化验证命令。
- [x] 所有需求至少映射到一个验证项。
- [x] 关键缺失数据路径有测试。
- [x] 不使用 watch-mode 命令。
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: passed 2026-07-01
