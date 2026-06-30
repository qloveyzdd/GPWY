# A Stock Downtrend Screener

## What This Is

这是一个可部署在云端服务器上的个人 A 股筛选网页。系统通过 Tushare/tinyshare 手动增量刷新股票基础信息、最近 60 个交易日行情和筹码分布，筛出符合下降区间条件的股票，并用表格和行内详情展示价格、均线、区间高点、K 线和最新/前一有效交易日的完整筹码分布。

这个工具不是公开投资社区，也不是全功能交易系统；它的目标是帮助个人快速发现处于特定下跌结构中的 A 股标的，供后续人工研判。

## Core Value

用户可以可靠地筛出当前价格低于最近下降区间波段高点 85% 的 A 股，并直观看到最新有效交易日与前一有效交易日的完整筹码分布。

## Current Milestone: v2.1 衰减筹码分布模型

**Goal:** 获取目标日前 60 个交易日的官方筹码分布作为种子，再按后续交易、换手和可选衰减系数推演目标日计算筹码分布。

**Status:** Requirements defined as of 2026-06-30; ready for Phase 12 discussion and planning.

**Target capabilities:**
- 获取并缓存目标日前第 60 个交易日的官方 `cyq_chips` 完整筹码分布。
- 使用目标区间内的日线、成交量、换手率和复权因子逐日推演目标日计算筹码分布。
- 支持固定衰减系数集合：`0.3 / 0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0`。
- 在股票详情中明确标注计算分布的目标日、种子日、衰减系数和非官方口径。

## Requirements

### Validated

- ✓ 原始日线与复权因子按 generation 标准化存储，读取时动态前复权；首次升级安全引导最近 60 个交易日 — Phase 7
- ✓ 受控 provider 并发、限频退避、有界重试和持久 tinyshare worker — Phase 8
- ✓ 普通刷新只拉取缺失交易日，支持中断后续跑，并在行情/筛选完成后先发布结果 — Phase 9
- ✓ 刷新阶段进度、失败数量和运维全量重建命令；网页不暴露全量重建入口 — Phase 9
- ✓ 最新有效交易日和前一有效交易日的完整筹码分布缓存、替换、复用和独立状态 — Phase 10
- ✓ 结果表格删除筹码峰字段和筹码峰排序能力 — Phase 11
- ✓ 股票详情展示最新/前一有效交易日两张完整筹码分布图，并移除 K 线前三筹码峰标记 — Phase 11
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

- [ ] 获取目标日前 60 个交易日的官方 `cyq_chips` 种子分布 — v2.1
- [ ] 按种子日至目标日之间的交易、换手和复权数据逐日推演计算筹码分布 — v2.1
- [ ] 支持衰减系数 `0.3 / 0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0` — v2.1
- [ ] 将官方原始分布、种子分布和计算分布分开缓存与展示 — v2.1
- [ ] 在股票详情页切换并标注计算筹码分布，不把计算结果伪装成官方 `cyq_chips` — v2.1

### Out of Scope

- 多人账号、团队权限和公开访问 - 首版仅供个人使用，先验证筛选逻辑和展示价值。
- 自动每日调度刷新 - 首版使用手动刷新，减少部署复杂度和 API 额度风险。
- 交易下单、自动策略执行和收益回测 - 当前目标是信息筛选与可视化，不直接做交易决策闭环。
- 使用非 Tushare 数据源作为主数据源 - 首版数据来源明确为 Tushare，避免多源口径不一致。
- 完整移动端体验 - 首版以桌面网页研判为主，移动端只需基本可访问。
- 把计算筹码分布当作官方数据 - v2.1 可以引入可解释计算模型，但必须独立标注、独立缓存，不覆盖 Tushare 原始 `cyq_chips`。

## Context

- v1.0 已于 2026-06-24 完成，共 6 个阶段、16 个计划和 36 个任务。
- v2.0 已于 2026-06-30 完成实现，共 5 个阶段，交付增量刷新、受控并行、双日筹码分布缓存和双图对比体验。
- v2.1 已于 2026-06-30 定义需求，目标是建立以 60 日前官方筹码分布为种子的衰减推演模型。
- 当前技术栈为 Next.js 16、React 19、TypeScript、SQLite、ECharts、Vitest 和 Playwright。
- 完整验证为 30 个测试文件、177 项测试及 1 项浏览器冒烟测试。
- 数据源限定为 Tushare API，tinyshare 作为兼容授权码的服务端 provider。
- 当前刷新方式为手动增量刷新，用户主动触发后按阶段执行行情增量补齐、筛选发布和后台筹码分布处理。
- 性能验收标准仍待用 v2.0 实际刷新数据制定。
- 当前已确认的下降结构口径：
  - 时间窗口：最近 60 个交易日。
  - 均线趋势：最新交易日 `MA20 < MA60`。
  - 短期斜率：`MA20` 最近 5 个交易日斜率为负。
  - 区间高点：从最新交易日开始向前比较；只要前一交易日最高价严格高于当前候选高点，就将候选高点向前移动。
  - 停止条件：前一交易日最高价小于或等于当前候选高点时停止，当前候选日即为区间高点；因此最新交易日创新高时，最新交易日就是新的区间高点。
  - 入选阈值：当前收盘价 `<= 波段高点 * 0.85`。
- 展示重点是表格加图表：
  - 表格字段：股票代码、名称、当前价、区间高点、当前/高点比例、下跌幅度。
  - 图表内容：价格走势、MA20、MA60、波段高点、85% 阈值、最新有效交易日筹码分布、前一有效交易日筹码分布。

## Constraints

- **Data source**: 以 Tushare API 为主 - 保持数据来源口径一致。
- **Usage mode**: 个人使用 - 首版不设计复杂权限系统。
- **Refresh mode**: 手动刷新 - 降低 API 额度消耗和调度复杂度。
- **Algorithm window**: 最近 60 个交易日 - 当前筛选定义依赖该窗口。
- **Trend definition**: `MA20 < MA60` 且 `MA20` 近 5 日斜率为负 - 防止仅凭单点价格回撤误判趋势。
- **Chip distribution source**: 官方 `cyq_chips` 与计算分布必须分开标注和存储 - 不用未经验证的近似结果覆盖或伪装官方数据。
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
| 使用受控 provider 调度器和持久 tinyshare worker | 避免无界并发、重复 Python 启动和不可控重试放大刷新耗时 | ✓ Phase 8 验证 |
| 筹码源数据保存完整双日分布而不是前三峰 | 支持用户比较真实价格档位分布，不再把 Top-N 摘要伪装成完整筹码结构 | ✓ Phase 10/11 验证 |
| 表格删除筹码峰，只在详情展示完整筹码分布 | 表格聚焦趋势筛选，筹码信息进入可视化详情，避免单价摘要误导 | ✓ Phase 11 验证 |
| 计算筹码分布必须独立于官方 `cyq_chips` | 衰减模型是可解释估算，不是官方数据源；必须避免把模型误认为事实数据 | — v2.1 待验证 |

## Current State

**Shipped version:** v2.0 — 2026-06-30

**Active milestone:** v2.1 衰减筹码分布模型 — requirements defined, implementation not started.

- 37/37 v1 需求完成。
- 6/6 阶段通过阶段验证和 Nyquist 覆盖审计。
- 27/27 v2.0 需求完成。
- v2.0 Phases 7-11 已全部通过阶段验证。
- 标准化缓存已独立保存原始日线和复权因子，首次刷新可安全引导最近 60 个交易日。
- 工作区支持登录、数据源验证、可恢复增量刷新、阶段进度、筛选、双日筹码分布、排序和行内图表。
- 云端部署所需环境变量、PM2 启动方式和验证命令已记录在 README。

## Next Milestone Goals

v2.1 聚焦筹码分布模型校准：以 60 日前官方筹码分布为种子，按后续交易数据推演目标日计算分布，并允许用户在固定衰减系数集合中切换对比。

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
*Last updated: 2026-06-30 after v2.1 requirements definition*
