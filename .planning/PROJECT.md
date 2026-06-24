# A Stock Downtrend Screener

## What This Is

这是一个部署在云端服务器上的个人网页，用于通过 Tushare API 查找 A 股中当前处于下降趋势的股票。首版聚焦一个核心工作流：手动刷新数据，筛出符合下降区间条件的股票，并用表格和图表展示价格、均线、波段高点和筹码峰价格。

这个工具不是公开投资社区，也不是全功能交易系统；它的目标是帮助个人快速发现处于特定下跌结构中的 A 股标的，供后续人工研判。

## Core Value

用户可以可靠地筛出当前价格低于最近下降区间波段高点 85% 的 A 股，并直观看到对应筹码峰位置。

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] 网页可以在云端服务器运行，并提供个人访问入口。
- [ ] 用户可以手动触发一次 A 股数据刷新，避免频繁消耗 Tushare API 额度。
- [ ] 系统可以通过 Tushare API 获取 A 股股票基础信息、行情数据和用于筹码峰展示的数据。
- [ ] 系统可以基于最近 60 个交易日行情计算 MA20 和 MA60。
- [ ] 系统可以判断下降趋势：最新交易日满足 `MA20 < MA60`，并且 `MA20` 最近 5 个交易日斜率为负。
- [ ] 系统可以在最近 60 个交易日内从最新交易日开始向前比较最高价：只要前一交易日最高价严格更高，就继续向前移动候选高点；条件不成立时，当前候选日即为区间高点。
- [ ] 系统可以筛选当前收盘价 `<= 波段高点 * 0.85` 的股票。
- [ ] 系统可以展示股票代码、名称、当前价、区间高点、当前价/高点比例、下跌幅度和筹码峰价格。
- [ ] 页面以表格加图表形式呈现筛选结果，表格用于扫描和排序，图表用于查看价格走势、MA20、MA60、波段高点和筹码峰。
- [ ] 筹码峰优先使用 Tushare 已有接口或字段；如果 Tushare 没有直接提供，则在研究阶段明确可用替代方案，不在首版用未验证算法强行近似。

### Out of Scope

- 多人账号、团队权限和公开访问 - 首版仅供个人使用，先验证筛选逻辑和展示价值。
- 自动每日调度刷新 - 首版使用手动刷新，减少部署复杂度和 API 额度风险。
- 交易下单、自动策略执行和收益回测 - 当前目标是信息筛选与可视化，不直接做交易决策闭环。
- 使用非 Tushare 数据源作为主数据源 - 首版数据来源明确为 Tushare，避免多源口径不一致。
- 完整移动端体验 - 首版以桌面网页研判为主，移动端只需基本可访问。
- 强行自研筹码分布算法 - 若 Tushare 没有直接字段，必须先研究并确认口径，再决定是否进入后续版本。

## Context

- 用户需要一个网页工具，不是命令行脚本；最终会运行在云端服务器。
- 数据源限定为 Tushare API，需要在实现中考虑 Token 配置、接口额度、失败重试和缓存。
- 首版刷新方式为手动刷新，用户主动触发后系统拉取数据并更新结果。
- 筛选目标是 A 股中处于下降结构的股票，不是泛化股票搜索。
- 当前已确认的下降结构口径：
  - 时间窗口：最近 60 个交易日。
  - 均线趋势：最新交易日 `MA20 < MA60`。
  - 短期斜率：`MA20` 最近 5 个交易日斜率为负。
  - 区间高点：从最新交易日开始向前比较；只要前一交易日最高价严格高于当前候选高点，就将候选高点向前移动。
  - 停止条件：前一交易日最高价小于或等于当前候选高点时停止，当前候选日即为区间高点；因此最新交易日创新高时，最新交易日就是新的区间高点。
  - 入选阈值：当前收盘价 `<= 波段高点 * 0.85`。
- 展示重点是表格加图表：
  - 表格字段：股票代码、名称、当前价、区间高点、当前/高点比例、下跌幅度、筹码峰价格。
  - 图表内容：价格走势、MA20、MA60、波段高点、筹码峰。

## Constraints

- **Data source**: 以 Tushare API 为主 - 保持数据来源口径一致。
- **Usage mode**: 个人使用 - 首版不设计复杂权限系统。
- **Refresh mode**: 手动刷新 - 降低 API 额度消耗和调度复杂度。
- **Algorithm window**: 最近 60 个交易日 - 当前筛选定义依赖该窗口。
- **Trend definition**: `MA20 < MA60` 且 `MA20` 近 5 日斜率为负 - 防止仅凭单点价格回撤误判趋势。
- **Chip peak source**: 优先使用 Tushare 现有接口或字段 - 不用未经验证的临时近似掩盖数据口径问题。
- **Deployment**: 云端服务器运行 - 实现需要支持环境变量配置、后台任务执行和稳定的网页访问。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 首版面向个人使用 | 降低权限、审计和限流复杂度，先验证核心筛选价值 | Pending |
| 使用手动刷新 | 避免初期自动任务消耗 Tushare 额度，也便于观察接口稳定性 | Pending |
| 使用表格加图表 | 表格适合批量扫描，图表适合逐只股票研判 | Pending |
| 使用 MA20/MA60 定义趋势 | 简单、可解释，符合用户确认的下降区间口径 | Pending |
| 最近 60 个交易日按连续更高最高价向前确定区间高点 | 直接表达用户确认的下降区间顶部规则，并保持计算窗口明确 | Validated in Phase 3 and regression tests |
| 筹码峰优先使用 Tushare 现有能力 | 数据口径优先，避免首版引入未验证估算模型 | Validated in Phase 4: use `cyq_chips` highest-percent price bucket |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? Move to Out of Scope with reason
2. Requirements validated? Move to Validated with phase reference
3. New requirements emerged? Add to Active
4. Decisions to log? Add to Key Decisions
5. "What This Is" still accurate? Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-24 after v1.0 milestone audit alignment*
