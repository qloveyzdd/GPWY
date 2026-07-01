---
phase: 12
slug: decay-based-chip-distribution-model
status: complete
created: 2026-07-01
---

# Phase 12 Code Patterns

## 可复用模式

### 市场数据 generation

当前市场数据以 generation 为隔离单元：

- `market_cache_generations`
- `market_daily_quotes`
- `market_adjustment_factors`
- `market_generation_dates`

Phase 12 的成交额和换手率扩展应沿用这个模式，不能直接绕过 generation 读取临时数据。

### 复权读时计算

`market-data-reader.ts` 当前在读取时用 `adj_factor / latest_adj_factor` 转换 OHLC。Phase 12 应复用这个口径，并把成交均价同样转换到目标日复权口径。

### 官方筹码分布后台处理

`chip-runner.ts` 已经提供：

- 从最新筛选 run 取股票范围
- 解析 latest/previous 目标日
- 按股票分组请求 `cyq_chips`
- 日期级 status 隔离
- 筛选结果先可用，筹码后处理

计算分布 runner 应复用这些边界，不新增全市场计算路径。

### 图表 DTO

`chart-data.ts` 已经集中组装 K 线、均线、双日分布和单日不可用状态。Phase 12 应在这里新增计算分布 DTO，不让 React 组件直接读取数据库或自行推断 seed/date/status。

## 需要避免的反模式

- 不把 `vol` 当作换手率。
- 不用固定换手率常数填补缺失数据。
- 不把计算结果写回官方 `chip_distribution_levels`。
- 不让 UI 点击详情时才首次启动计算。
- 不让 latest 某日失败导致 previous 或官方图消失。
- 不在组件里写模型计算逻辑。

## 建议文件边界

| 关注点 | 文件 |
|--------|------|
| Tushare 端点与字段 | `src/lib/tushare/endpoints.ts` |
| 市场数据类型与缓存 | `src/lib/refresh/market-data-types.ts`, `src/lib/refresh/market-data-store.ts` |
| 复权一致模型输入 | `src/lib/refresh/market-data-reader.ts` |
| 纯算法 | `src/lib/chip/chip-model.ts` |
| 计算分布类型 | `src/lib/chip/chip-types.ts` |
| 计算分布缓存 | `src/lib/chip/chip-model-store.ts` |
| 后台计算入口 | `src/lib/chip/chip-model-runner.ts`, `src/lib/refresh/refresh-runner.ts` |
| 图表数据 | `src/lib/results/chart-types.ts`, `src/lib/results/chart-data.ts` |
| UI 展示 | `src/components/charts/stock-kline-chart.tsx` |
