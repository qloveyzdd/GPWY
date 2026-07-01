---
phase: 12
slug: decay-based-chip-distribution-model
status: complete
created: 2026-07-01
---

# Phase 12 Research: 衰减筹码分布模型

## 研究结论

Phase 12 可行，但必须先补齐数据口径：当前项目缓存只有 `daily` 的 OHLC 和 `vol`，以及 `adj_factor`；没有 `amount` 和换手率。按用户确认的模型边界，如果没有换手率，就不能严谨执行“旧筹码按换手衰减、新筹码按成交区间分配”的逐日推演。

因此本阶段需要先扩展行情缓存，再实现纯模型、后台计算和 UI 切换。不能在算法里把 `vol` 当作换手率，也不能用固定常数代替缺失换手率。

## 外部数据口径

- Tushare `daily` 可作为日线来源；当前项目已使用 `open/high/low/close/vol`，本阶段需要增加 `amount` 以便计算成交均价。
- Tushare `daily_basic` 可作为换手率来源；优先使用自由流通换手率 `turnover_rate_f`，缺失时才使用 `turnover_rate`。两者都缺失时记录结构化不可用。
- Tushare `cyq_chips` 继续作为官方筹码分布来源；60 个交易日前的种子分布必须从这里取得并保留官方来源标识。

参考：

- Tushare Pro 文档入口：https://tushare.pro/document/2
- 项目当前端点定义：`src/lib/tushare/endpoints.ts`

## 现有代码事实

1. 官方筹码分布已经有独立缓存：
   - `chip_distribution_runs`
   - `chip_distribution_statuses`
   - `chip_distribution_levels`

2. 详情图表已经支持双日官方分布：
   - `ChartChipDistributions.previous`
   - `ChartChipDistributions.latest`
   - shared `priceLevels` / `maxPercent`

3. 后台刷新已经支持“筛选结果先可用，筹码后处理继续跑”的模式：
   - `runChipDistributionIntegrationFromLatestScreening()`
   - `refresh-runner.ts` 中的后续集成阶段

4. 缺口在市场数据：
   - `RawDailyQuoteRecord` 没有 `amount`
   - 没有 `daily_basic`
   - `market_daily_quotes` 没有成交额
   - 没有按交易日缓存换手率的表

## 推荐技术方案

### 1. 数据层先补齐

扩展 `daily` 字段，新增 `daily_basic` 端点和缓存表。模型输入必须从同一 market generation 读取，保证 OHLC、成交均价、换手率、复权因子在同一批数据口径下。

### 2. 算法层做纯函数

新增 `chip-model.ts`，不直接读写数据库。输入为：

- 种子分布
- 种子日到目标日的复权一致交易序列
- 衰减系数
- 模型版本

输出为：

- 计算分布 levels
- seedTradeDate / targetTradeDate / decayCoefficient / modelVersion
- 缺失数据时的结构化不可用原因

### 3. 存储层与官方数据隔离

计算结果写入独立表，不写回 `chip_distribution_levels`。种子分布可以引用官方 `cyq_chips`，但模型使用前应保存复权到目标口径后的 seed snapshot，避免后续复权因子变化或读取口径变化导致结果不可复现。

### 4. 后台预计算固定系数集合

为了避免“点开详情才计算”的等待，后台对当前筛选结果、latest/previous 两个目标日、7 个固定衰减系数进行计算。这样 UI 切换只是读取缓存。

固定系数：

`0.3 / 0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0`

默认展示：`0.5`

### 5. UI 只展示明确口径

详情页必须把官方分布和计算分布区分开。计算分布需要显示：

- 目标日
- 种子日
- 衰减系数
- 模型版本
- “计算分布”标签
- 不可用原因

## 风险

| 风险 | 影响 | 处理 |
|------|------|------|
| `daily_basic` 权限或字段不可用 | 模型无法按换手率推演 | 记录 `missing_turnover_rate` 或 provider 错误，不静默近似 |
| `amount` 缺失 | 成交均价不可得 | 可退回 `(high + low + close) / 3`，但仍保留模型来源标识 |
| 计算所有 7 个系数增加后台耗时 | 刷新后处理更久 | 只对筛选结果计算；结果表仍先可用 |
| 官方 `cyq_chips` 种子缺失 | 单目标日不可计算 | 单日 status 置为 blocked/missing，不影响另一日或官方分布 |
| 复权口径不一致 | 分布价格轴错位 | 种子和日线都转换到目标日复权口径，并写测试覆盖 |

## 计划拆分

1. `12-01`：补齐日线成交额、换手率、模型输入类型。
2. `12-02`：实现纯衰减模型和单元测试。
3. `12-03`：实现计算分布缓存、seed snapshot、后台 runner。
4. `12-04`：接入图表 DTO 和 UI 系数切换。

## RESEARCH COMPLETE
