# A Stock Downtrend Screener

## What This Is

这是一个可部署在云端服务器上的个人 A 股筛选网页。系统通过 Tushare/tinyshare 手动刷新股票基础信息和最近 60 个交易日行情，筛出符合下降区间条件的股票，并用表格和行内 K 线图展示价格、均线、区间高点和前三筹码峰。

这个工具不是公开投资社区，也不是全功能交易系统；它的目标是帮助个人快速发现处于特定下跌结构中的 A 股标的，供后续人工研判。

## Core Value

用户可以可靠地筛出当前价格低于最近下降区间波段高点 85% 的 A 股，并直观看到对应筹码峰位置。

## Current Milestone: v2.0 增量刷新与筹码分布对比

**Goal:** 将串行全量刷新改造为可恢复的增量刷新和受控并行处理，并让用户对比筛选股票最新交易日与前一交易日的完整筹码分布。

**Target features:**
- 行情和复权因子复用已有数据，只拉取缺失交易日，并保留手动全量重建能力。
- 外部接口使用受控并行、限频退避、重试和失败恢复；tinyshare 避免每次请求重复启动 Python 进程。
- 筹码数据覆盖最新有效交易日和前一有效交易日，股票详情展示两个完整筹码分布图。
- 记录刷新各阶段的进度、耗时和结果，为后续制定性能验收标准提供真实基线。

## Requirements

### Validated

- ✓ 原始日线与复权因子按 generation 标准化存储，读取时动态前复权；首次升级安全引导最近 60 个交易日 — Phase 7
- ✓ 云端自托管网页和个人访问密码保护 — v1.0
- ✓ 服务端 Tushare/tinyshare 配置、数据源验证和错误脱敏 — v1.0
- ✓ 手动刷新、并发锁、任务状态和 SQLite 成功快照缓存 — v1.0
- ✓ 最近 60 个交易日 MA20/MA60、MA20 负斜率和 85% 回撤筛选 — v1.0
- ✓ 从最新交易日向前回溯连续更高最高价的区间高点规则 — v1.0
- ✓ 官方 `cyq_chips` 前三筹码峰及占比；不可用时显式阻塞，不做估算 — v1.0
- ✓ 最新筛选结果表格、关键指标排序和空/失败状态区分 — v1.0
- ✓ 点击股票行后在该行下方展示 K 线、均线、区间高点、85% 阈值和筹码峰 — v1.0
- ✓ 类型检查、单元/组件测试、生产构建和 Playwright 浏览器冒烟验证 — v1.0

### Active

- [ ] 普通刷新只拉取缺失交易日并支持可恢复续跑，避免重复获取已有 60 日数据。
- [ ] Tushare/tinyshare 请求采用受控并行，并支持限频退避、重试和失败恢复。
- [ ] tinyshare 调用避免每次请求重复启动 Python 进程。
- [ ] 筛选股票保存最新交易日和前一交易日的完整筹码分布。
- [ ] 股票详情展示两个交易日的筹码分布图供用户对比。
- [ ] 刷新流程记录阶段进度、耗时和结果，以实测数据确定后续性能标准。
- [ ] 保留手动全量重建数据的操作路径。

### Out of Scope

- 多人账号、团队权限和公开访问 - 首版仅供个人使用，先验证筛选逻辑和展示价值。
- 自动每日调度刷新 - 首版使用手动刷新，减少部署复杂度和 API 额度风险。
- 交易下单、自动策略执行和收益回测 - 当前目标是信息筛选与可视化，不直接做交易决策闭环。
- 使用非 Tushare 数据源作为主数据源 - 首版数据来源明确为 Tushare，避免多源口径不一致。
- 完整移动端体验 - 首版以桌面网页研判为主，移动端只需基本可访问。
- 强行自研筹码分布算法 - 若 Tushare 没有直接字段，必须先研究并确认口径，再决定是否进入后续版本。

## Context

- v1.0 已于 2026-06-24 完成，共 6 个阶段、16 个计划和 36 个任务。
- 当前技术栈为 Next.js 16、React 19、TypeScript、SQLite、ECharts、Vitest 和 Playwright。
- 代码与测试约 9,799 行；完整验证为 23 个测试文件、95 项测试及 1 项浏览器冒烟测试。
- 数据源限定为 Tushare API，tinyshare 作为兼容授权码的服务端 provider。
- 当前刷新方式为手动刷新，用户主动触发后依次执行缓存、筛选和筹码 enrichment。
- 已知非阻塞问题：筹码数据按入选股票串行请求，全市场入选较多时刷新耗时会增长。
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
| 首版面向个人使用 | 降低权限、审计和限流复杂度，先验证核心筛选价值 | ✓ v1.0 验证 |
| 使用手动刷新 | 避免初期自动任务消耗 Tushare 额度，也便于观察接口稳定性 | ✓ v1.0 验证 |
| 使用表格加行内图表 | 表格适合批量扫描，图表适合逐只股票研判 | ✓ v1.0 验证 |
| 使用 MA20/MA60 定义趋势 | 简单、可解释，符合用户确认的下降区间口径 | ✓ v1.0 验证 |
| 最近 60 个交易日按连续更高最高价向前确定区间高点 | 直接表达用户确认的下降区间顶部规则，并保持计算窗口明确 | ✓ Phase 3 回归测试验证 |
| 筹码峰优先使用 Tushare 现有能力 | 数据口径优先，避免首版引入未验证估算模型 | ✓ 使用 `cyq_chips` 前三占比价格档 |
| tinyshare 作为显式 provider | 兼容 tinyshare 授权码，同时保持 REST 为默认路径 | ✓ 真实接口验证 |
| SQLite 按任务保存成功快照 | 个人单实例部署足够简单，失败刷新不会污染最新成功结果 | ✓ v1.0 验证 |
| 原始行情与复权因子分开存储并在读取时动态前复权 | 避免把派生价格当作原始事实，后续可安全增量追加 | ✓ Phase 7 验证 |
| 新缓存通过 60 个成对成功交易日清单后原子激活 | 半成品不会替换可用结果，失败后可从头重建 | ✓ Phase 7 验证 |

## Current State

**Shipped version:** v1.0 MVP — 2026-06-24

- 37/37 v1 需求完成。
- 6/6 阶段通过阶段验证和 Nyquist 覆盖审计。
- v2.0 Phase 7 已于 2026-06-26 完成；当前进入 Phase 8 受控 provider 并发。
- 标准化缓存已独立保存原始日线和复权因子，首次刷新可安全引导最近 60 个交易日。
- 工作区支持登录、数据源验证、手动刷新、筛选、筹码峰、排序和行内图表。
- 云端部署所需环境变量、PM2 启动方式和验证命令已记录在 README。

## Next Milestone Goals

v2.0 已立项，当前重点是增量刷新、受控并行和双交易日筹码分布对比。自动每日刷新、可配置筛选、CSV 导出、外部任务队列和 PostgreSQL 不在本里程碑范围内。

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
*Last updated: 2026-06-26 after Phase 7 completion*
