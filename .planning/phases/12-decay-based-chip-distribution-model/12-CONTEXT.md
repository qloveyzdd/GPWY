# Phase 12: Decay-Based Chip Distribution Model - Context

**Gathered:** 2026-07-01T09:39:14+08:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 交付“计算筹码分布”模型：系统以目标日前 60 个有效交易日前后的官方 `cyq_chips` 完整筹码分布作为种子，读取种子日至目标日之间的日线、成交量/成交额、换手率和复权因子，逐日推演出目标日的计算筹码分布。该计算分布用于和官方原始分布并存展示，帮助用户观察不同衰减系数下的筹码形态变化。

本阶段只覆盖入选股票的计算模型、缓存、双日目标计算和股票详情展示切换。不改变下降趋势筛选算法，不承诺与通达信/同花顺完全一致，不做全市场完整历史筹码回填，也不得用计算分布覆盖或伪装官方 `cyq_chips`。

</domain>

<decisions>
## Implementation Decisions

### 每日新增筹码分配口径

- **D-12-01:** 每日新增筹码使用三角分布分配到当日价格区间内，不使用简单均匀分布作为默认模型。
- **D-12-02:** 三角分布的中心优先使用当日成交均价；如果成交均价无法可靠计算，可退回到典型价格，例如 `(high + low + close) / 3`。
- **D-12-03:** 三角分布必须落在当日复权一致口径下的 `[low, high]` 价格区间内；不能把新增筹码分配到当日成交区间外。
- **D-12-04:** 旧筹码衰减基于当日换手率和衰减系数，新增筹码占比来自衰减掉的旧筹码权重；分布每个交易日处理后需要归一化，避免累计误差。
- **D-12-05:** 复权调整是模型的一部分：种子分布和每日 OHLC 需要处于同一价格口径，除权除息不能导致筹码价格轴错位。
- **D-12-06:** 日线级数据无法证明真实逐笔成交分布，因此 Phase 12 的模型必须标注为“计算分布”，不得暗示它等同交易软件或官方真实筹码口径。

### 衰减系数与默认展示

- **D-12-07:** 支持的衰减系数固定为 `0.3 / 0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0`，本阶段不支持自由输入任意系数。
- **D-12-08:** 股票详情页默认选中衰减系数 `0.5`。
- **D-12-09:** 选择 `0.5` 的原因是前期实验显示它比 `1.0` 更能保留高位历史筹码，不会让分布过快贴近最近成交。
- **D-12-10:** 用户切换衰减系数后，页面展示对应计算分布；同一股票、目标日期、种子日期、衰减系数和模型版本的结果应复用缓存。
- **D-12-11:** UI 必须同时显示目标日、种子日、当前衰减系数和“计算分布”口径；不得只显示一张未标注来源的筹码图。

### 计算范围与刷新边界

- **D-12-12:** Phase 12 先只对当前筛选结果中的入选股票计算模型分布，不对全市场股票计算。
- **D-12-13:** 计算应作为筛选结果之后的后续处理，延续 v2.0 “筛选结果先可用、筹码处理可后台继续”的边界。
- **D-12-14:** 不采用“用户点开详情时才首次计算”作为默认路径；详情页应优先读取已缓存计算结果或显示明确的不可用/处理中状态。
- **D-12-15:** 最新有效交易日和前一有效交易日都需要支持计算分布，保持 Phase 11 的双日对比体验。
- **D-12-16:** 其中一天计算不可用时，另一日可用分布仍正常展示；不可用原因只影响对应目标日。

### 数据与缓存隔离

- **D-12-17:** 官方原始 `cyq_chips`、60 日前种子分布、计算分布必须分开存储或至少以明确字段区分；计算结果不能覆盖官方原始分布表。
- **D-12-18:** 计算分布缓存 key 至少包含股票代码、目标交易日、种子交易日、衰减系数和模型版本；如果底层种子分布或交易数据变化，旧缓存不能被误用。
- **D-12-19:** 当种子分布缺失、目标区间交易数据缺失、换手率缺失或复权因子缺失时，系统应记录结构化不可用原因，而不是静默用近似值继续。
- **D-12-20:** 可复现对比数据是本阶段验收的一部分；至少保留一组股票/日期/多个衰减系数的测试或 fixture，用于观察系数变化对分布形态的影响。

### the agent's Discretion

- 具体三角核的离散化方式、价格步长、归一化细节和浮点误差处理。
- 成交均价的精确来源选择：优先使用已有日线 `amount / vol` 能力，还是先封装为可替换函数。
- 计算任务与现有 chip stage 的命名、状态字段、进度统计和数据库表结构。
- 详情页是把官方分布与计算分布放在同一卡片内切换，还是拆分为独立计算分布卡片，只要来源标注明确且不破坏双日对比。
- 是否在 Phase 12 内只实现默认 `0.5` 的后台预计算、其他系数按需补算；但用户切换固定集合中的任一系数必须有明确行为。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Phase Boundary

- `.planning/PROJECT.md` — v2.1 当前目标、官方 `cyq_chips` 与计算分布分离的项目约束。
- `.planning/REQUIREMENTS.md` — DATA-10、DATA-11、DATA-12、CMOD-01 至 CMOD-05、UI-08 至 UI-10、VAL-01、VAL-02 的正式需求。
- `.planning/ROADMAP.md` — Phase 12 目标、依赖 Phase 11、成功标准和 Phase 12 范围边界。
- `.planning/milestones/v2.0-phases/09-incremental-refresh-workflow/09-CONTEXT.md` — 筛选结果先发布、筹码后台阶段、operation lock、阶段状态和脱敏错误约束。
- `.planning/milestones/v2.0-phases/10-dual-day-chip-distribution/10-CONTEXT.md` — 双日目标日期、完整官方分布缓存、日期级状态、最新/前一有效日独立语义。
- `.planning/milestones/v2.0-phases/11-distribution-comparison-experience/11-CONTEXT.md` — 行内详情、前一日/最新日双图、共享尺度、单日不可用局部化和图表展示边界。

### Chip and Market Data Code

- `src/lib/chip/chip-types.ts` — 当前官方分布、target kind、日期级状态类型；Phase 12 应新增计算分布类型而不是混用官方 source。
- `src/lib/chip/chip-store.ts` — 当前 `chip_distribution_*` 表、完整分布读写、日期级状态和 work planning；Phase 12 需要新增或扩展计算分布缓存。
- `src/lib/chip/chip-runner.ts` — 当前入选股票双日官方分布后台处理入口；Phase 12 可沿用其“按入选股票/双目标日期/后台进度”模式。
- `src/lib/refresh/market-data-reader.ts` — 按 market generation 和股票读取复权一致的有效 K 线；模型区间数据应来自同一口径。
- `src/lib/refresh/market-data-store.ts` — 原始日线、复权因子和 generation 状态；Phase 12 不能绕过现有缓存直接制造不同口径数据。
- `src/lib/screening/screening-store.ts` — 最新筛选 run 和入选股票列表来源；计算范围锁定为入选股票。

### Chart and UI Code

- `src/lib/results/chart-types.ts` — 当前 `ChartChipDistributions`、previous/latest panel、scale DTO；Phase 12 需要扩展为官方/计算分布可区分的 DTO。
- `src/lib/results/chart-data.ts` — 当前组装 K 线、双日官方筹码分布和不可用状态；Phase 12 应在这里或相邻聚合层加入计算分布。
- `src/components/charts/stock-kline-chart.tsx` — 当前行内详情图、双日分布卡片、不可用卡片和 ECharts 分布图实现；Phase 12 UI 切换应与该结构兼容。
- `tests/results/chart-data.test.ts` — 图表 DTO 组装测试，应新增计算分布、默认系数和不可用原因覆盖。
- `tests/ui/stock-kline-chart.test.tsx` — 股票详情 UI 测试，应覆盖默认 `0.5`、切换系数、来源标注和单日不可用。
- `tests/chip/chip-distribution-store.test.ts` / `tests/chip/chip-runner.test.ts` — 可参考官方分布存储和 runner 测试模式，为计算分布新增对应测试。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ChipDistributionTargetKind = "latest" | "previous"` 已表达双日目标，可复用到计算分布目标。
- `chip_distribution_levels` 已按股票和交易日保存官方完整价格档位；计算分布应新增独立表或 source/model 字段，不能直接写回这张官方数据表。
- `planChipDistributionWork()` 已体现“跳过完整缓存、重试 failed、保留 blocked”的 work planning 思路，可作为计算分布 planning 的参考。
- `runChipDistributionIntegrationFromLatestScreening()` 已按入选股票分组、按双目标日期后台处理，符合 Phase 12 的计算范围选择。
- `readLatestChartSnapshot()` 已集中组装 K 线、均线、overlays 和双日分布，是接入计算分布 DTO 的自然入口。
- `StockKlineChart` 已有双日分布卡片、共享 scale、不可用卡片和 ECharts 横向 bar 图，可复用展示机制。

### Established Patterns

- 筛选结果先发布，筹码类后台阶段不能阻塞结果表格可用。
- provider 请求和后台任务必须走受控并发与脱敏错误语义；不能新增无界并发或私有重试层。
- 官方数据与模型输出必须分离标注，避免把估算模型误认为事实数据。
- 图表详情保持行内展开模式，不引入全屏、弹窗、右侧抽屉或新的全局导航。
- 单日失败只影响对应目标日卡片，不能使整只股票详情不可用。

### Integration Points

- `chip-types.ts`：新增计算分布模型版本、衰减系数、seed trade date、calculated status/level 类型。
- `chip-store.ts`：新增计算分布缓存读写、状态记录、按股票/目标日/系数复用逻辑。
- `chip-runner.ts` 或新 `chip-model-runner.ts`：在筛选结果后对入选股票计算 latest/previous 两个目标日的计算分布。
- `market-data-reader.ts`：提供种子日到目标日之间复权一致的 daily bars，以及换手率/成交数据读取入口。
- `chart-data.ts` / `chart-types.ts`：把官方分布和计算分布以明确 source/model 字段返回给 UI。
- `stock-kline-chart.tsx`：增加衰减系数选择和计算分布来源标注，默认 `0.5`。

</code_context>

<specifics>
## Specific Ideas

- 用户选择 `1A`：每日新增筹码使用三角分布，核心目标是让柱状图形态比均匀分布更集中、更细致。
- 用户选择 `2A`：页面默认衰减系数为 `0.5`，倾向保留高位历史筹码。
- 用户选择 `3A`：只对当前筛选入选股票计算，避免把 Phase 12 扩大成全市场历史回填。
- 前期实验显示 `1.0` 在 60 日累计换手较高股票上会过快冲淡历史筹码；Phase 12 默认 `0.5` 是为了先获得更接近通达信/同花顺视觉形态的对比起点。

</specifics>

<deferred>
## Deferred Ideas

- 全市场完整历史筹码回填不进入 Phase 12。
- 承诺与通达信/同花顺完全一致不进入 Phase 12；本阶段只建立可解释、可调参、可复现的内部模型。
- 自由输入任意衰减系数不进入 Phase 12；仅支持固定集合。
- 改变下降趋势筛选算法不进入 Phase 12。
- 自动每日调度、历史筛选结果对比、CSV 导出、PostgreSQL 或外部队列不进入 Phase 12。

</deferred>

---

*Phase: 12-Decay-Based Chip Distribution Model*
*Context gathered: 2026-07-01T09:39:14+08:00*
