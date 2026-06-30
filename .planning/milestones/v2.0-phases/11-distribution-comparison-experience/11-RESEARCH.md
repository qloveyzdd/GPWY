# Phase 11: Distribution Comparison Experience - Research

**Researched:** 2026-06-30  
**Status:** Complete

## Research Question

Phase 11 要回答的是：如何在不改变 Phase 10 双日筹码分布采集、缓存和后台刷新语义的前提下，把现有“表格筹码峰 + K 线筹码峰 overlay”体验替换为“行内详情中的前一有效交易日/最新有效交易日完整筹码分布对比”。

## Key Findings

### 1. 后端数据能力已经满足 Phase 11，主要缺的是图表 DTO 和 UI 映射

当前 `src/lib/chip/chip-store.ts` 已提供 Phase 11 需要的核心读能力：

- `readLatestChipDistributionRun(screeningRunId?)`
- `readChipDistributionStatusesForRun(chipDistributionRunId)`
- `readChipDistributionForDate(tsCode, tradeDate)`

这些 API 能按 screening run 找到最新 distribution run，按 run 读取 latest/previous 日期级状态，并按股票 + 交易日读取完整价格档位。

Planning implication:

- Phase 11 不需要新增 provider 请求、缓存表或刷新阶段。
- `readLatestChartSnapshot()` 是最合适的数据聚合点：它已经知道最新 screening run、当前股票 row、同源 K 线 bars 和图表 API response。
- 需要把 `ChartSnapshot` 从“旧筹码峰 overlay”扩展/替换为“双日完整分布 DTO”。

### 2. 当前 UI 耦合点集中，改动边界可控

现有前端耦合点主要有两个：

- `src/components/results/results-table.tsx`
  - `SortKey` 包含 `chipPeakPrice`
  - 表头包含“筹码峰价格”
  - `ChipPeakCell` 显示前三峰或状态徽标
  - 展开行 `colSpan={7}`
- `src/components/charts/stock-kline-chart.tsx`
  - K 线 `markLine` 包含 `snapshot.overlays.chipPeaks`
  - 标题 badge 显示“筹码峰1/2/3”
  - 组件已有 ECharts 初始化、fetch、loading、unavailable、failed、resize/dispose 生命周期

Planning implication:

- 表格简化可以独立完成，不需要等待图表实现。
- 图表替换应尽量复用现有 `StockKlineChart` fetch 和 K 线生命周期；分布图可以拆成内部卡片组件，避免让 K 线 chart ref 承担多个 ECharts 实例。
- 展开交互继续由 `ResultsTable` 控制，不新增按钮、hover 提示、弹窗或侧栏。

### 3. 双图对比必须在 DTO 层提供共享尺度，不能让每张图各自自适应

Phase 11 的关键体验不是“画出两张条形图”，而是让两张图可比较。仅在 ECharts 组件里分别读取各自 levels，会天然倾向于独立 x/y 轴自适应，导致视觉误导。

Recommended DTO shape:

- `chipDistributions.previous`
- `chipDistributions.latest`
- `chipDistributions.scale.priceLevels`
- `chipDistributions.scale.maxPercent`

其中 `priceLevels` 使用两天成功分布的价格档位并集，按价格升序；每张图按同一个 priceLevels 映射 percent，缺失档位用 `0` 或空值显示。`maxPercent` 使用两天成功分布中的最大 percent，作为两张图共同的 x 轴最大值。

Planning implication:

- 共享尺度应在 `chart-data.ts` 中算好，组件只消费 DTO。
- 单日失败时仍用另一日成功数据生成共享尺度；失败卡片不画图。
- 两日都不可用时，scale 可以为空数组和 `maxPercent=0`，UI 显示两个不可用卡片。

### 4. 单日不可用是正常状态，不应污染整张详情卡

Phase 10 已经把 latest/previous 状态拆开。Phase 11 应保持这个语义：

- 一天 `succeeded`：该图正常显示。
- 一天 `blocked` / `failed`：对应卡片显示状态、错误类别和简短脱敏说明。
- 一天 `missing`：对应卡片显示正常空状态，例如“缺少前一有效交易日”，不使用红色错误表达。
- 不在详情头部显示总体“部分可用”徽标。

Planning implication:

- `ChartSnapshot.status` 不应因为某个 distribution target 不可用而变成 `unavailable`。
- 不可用只体现在 `chipDistributions.previous/latest.status`。
- 错误摘要要延续 Phase 8/9/10 的脱敏约束，不暴露 token、headers、本地路径或 provider 原始 payload。

### 5. 旧筹码峰兼容字段暂时可以留在 backend 类型里，但 UI 不再消费

`ResultRow` 和 `ResultsSnapshot` 当前仍含 chip peak compatibility 字段。这些字段来自 Phase 10 的兼容投影，仍被部分后端测试和历史路径引用。

Planning implication:

- Phase 11 的表格和 K 线不再读取/展示这些字段。
- 不要求本阶段删除 `ResultRow` 中所有 chip peak 字段；贸然删除会扩大 backend 兼容风险。
- 可以从 `ChartOverlays` 移除 `chipPeaks/chipPeakState`，因为 K 线图不再需要它们。

## Recommended Implementation Shape

### Data and DTO

1. 扩展 `src/lib/results/chart-types.ts`：
   - 定义 `ChartChipDistributionTargetKind = "previous" | "latest"`。
   - 定义单图 DTO：目标类型、标题、交易日期、状态、levels、maxPercentLevel、errorCategory、errorSummary。
   - 定义共享尺度 DTO：`priceLevels`、`maxPercent`。
   - 从 `ChartOverlays` 删除旧 `chipPeaks/chipPeakState`，或至少停止在 UI 读取它们。
2. 修改 `src/lib/results/chart-data.ts`：
   - 继续先读取最新 results snapshot 和 screening run。
   - 读取与 screening run 匹配的 latest chip distribution run。
   - 从 run statuses 中筛选当前 tsCode 的 latest/previous。
   - 对 succeeded + tradeDate 读取完整 levels。
   - 构造 previous/latest 两个 panel，计算共享 priceLevels 和 maxPercent。

### Table

1. `SortKey` 只保留 `currentHighRatio | drawdownPct`。
2. 删除 `ChipPeakCell`、chip 状态 badge、`chipPeakPrice` 排序、筹码峰表头和单元格。
3. 展开行 `colSpan` 从 7 改为 6。
4. 测试改为断言表格没有“筹码峰价格”、没有阻塞/失败/无数据筹码状态徽标，排序只覆盖两个入口。

### Chart UI

1. K 线图只保留区间高点和 85% 阈值 markLine。
2. 删除标题区筹码峰 badge。
3. 在 K 线下方渲染双分布区域：
   - 桌面 `grid-cols-2`，窄屏单列。
   - previous 在左，latest 在右。
   - 两卡等宽等高。
4. 成功卡使用横向 bar：
   - yAxis = shared priceLevels。
   - xAxis max = shared maxPercent。
   - 单卡内部只标出该日最大占比档位。
   - 不做 K 线与分布图 hover/click 联动。
5. 不可用卡显示目标、交易日期/缺失状态、状态、错误类别、简短说明。

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| 两张图各自自适应尺度 | 会误导用户比较筹码占比和价格档位 | DTO 提供 shared priceLevels 和 maxPercent，组件强制共用 |
| 单日失败导致整张详情不可用 | 违背 Phase 10 日期级独立状态 | ChartSnapshot 仍为 ready，单日状态只影响对应卡片 |
| 错误卡泄露 provider 原始信息 | 违反脱敏约束 | 只展示 errorCategory 和短 errorSummary，测试断言无 token/path/header |
| 过早删除 backend chip peak 字段 | 扩大兼容风险 | Phase 11 只删除 UI 消费；backend compatibility 字段暂留 |
| 分布价格档位被裁剪成 Top-N | 背离完整分布目标 | shared priceLevels 使用全量并集，UI 不做 Top-N 截断 |

## Validation Architecture

Required automated coverage:

- `tests/results/chart-data.test.ts`
  - latest/previous 成功时返回双分布 DTO。
  - shared priceLevels 和 maxPercent 覆盖两天全量分布。
  - 单日 blocked/failed/missing 时另一日仍可用。
  - DTO 不包含 provider 原始响应、token、本地路径或 headers。
- `tests/ui/results-table.test.tsx`
  - 表格不显示筹码峰列、筹码峰状态或筹码峰排序。
  - current/high ratio 与 drawdown 排序继续可用。
  - 行点击 inline 展开仍在被点击行下方。
- `tests/ui/stock-kline-chart.test.tsx`
  - K 线 markLine 只包含区间高点和 85% 阈值。
  - 不显示筹码峰 badge。
  - 渲染 previous/latest 两张分布图；不可用卡只影响对应日期。
- `tests/smoke/app-smoke.spec.ts`
  - 受保护工作台无“筹码峰价格”列。
  - 展开可用股票时有 K 线和双日分布。
  - 展开 blocked 股票时能看到不可用卡，且页面仍可用。

Recommended commands:

- `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run verify`
- `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line`

## RESEARCH COMPLETE

Phase 11 可在现有架构内完成，不需要新增数据源、缓存表、刷新任务或 provider 调用。关键是把完整分布对比语义固定在 chart DTO 与 UI 共享尺度上，同时彻底移除表格和 K 线中的旧筹码峰展示。

