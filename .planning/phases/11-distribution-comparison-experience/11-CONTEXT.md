# Phase 11: Distribution Comparison Experience - Context

**Gathered:** 2026-06-30T05:50:22+08:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 交付股票详情里的双日完整筹码分布对比体验。用户在结果表格中选中股票后，展开行继续显示价格 K 线，同时展示“前一有效交易日”和“最新有效交易日”的完整筹码分布图，用于直接比较两个交易日的价格档位和筹码占比变化。

本阶段只改结果展示体验：删除表格筹码峰列和筹码峰排序、移除 K 线图上的前三筹码峰标记、在详情区新增两张完整筹码分布图，并正确处理单日成功/失败/阻塞/缺失状态。本阶段不改 Phase 10 已完成的双日分布采集、缓存、重试、状态落库和刷新后台语义。

</domain>

<decisions>
## Implementation Decisions

### 详情区布局

- **D-11-01:** 继续使用当前结果行下方 inline 展开模式，不改成右侧面板、弹窗或抽屉。
- **D-11-02:** 展开内容中 K 线图位于上方，两个完整筹码分布图位于下方。
- **D-11-03:** 两个筹码分布图在桌面端并排显示，窄屏上下排列。
- **D-11-04:** 分布图顺序为“前一有效交易日”在左，“最新有效交易日”在右。
- **D-11-05:** 两张分布图等宽等高，不因为 latest 更重要而改变尺寸权重。
- **D-11-06:** Phase 11 不实现 K 线和分布图之间的 hover/click 联动；只共享股票标题和准确交易日期。

### 筹码分布图形态

- **D-11-07:** 单日完整筹码分布图使用横向条形图：纵轴为价格档位，横轴为占比。
- **D-11-08:** 前一有效交易日和最新有效交易日两张分布图共享相同价格范围和占比范围，避免自适应尺度造成误导。
- **D-11-09:** 只在单日分布图内部标出最大占比档位；不在表格或 K 线 overlay 中恢复筹码峰主导体验。
- **D-11-10:** 默认显示所有价格档位；必要时通过图内滚动或压缩处理，不裁剪成 Top N。

### 部分失败状态

- **D-11-11:** 其中一天分布不可用时，整体详情区仍可用；成功的那张图正常显示，失败的那张图显示不可用卡片。
- **D-11-12:** 不可用卡片显示该目标日状态、脱敏错误类别和简短说明；不展示原始 provider 响应、token、headers、本地路径或长 error summary。
- **D-11-13:** `missing` 作为正常空状态处理，例如“缺少前一有效交易日”；不使用红色错误警告表达。
- **D-11-14:** 当只有一天失败/阻塞/缺失时，不在标题区额外显示总体“部分可用”徽标；状态只在对应图卡片中表达。

### 表格简化

- **D-11-15:** 结果表格删除筹码峰字段，不再显示前三筹码峰、筹码峰价格、筹码峰状态或错误状态。
- **D-11-16:** 删除筹码峰价格排序入口；表格只保留“当前/高点”和“下跌幅度”两个排序入口。
- **D-11-17:** 表格不显示筹码分布状态徽标；筹码分布是否可用只在展开详情区呈现。
- **D-11-18:** 表格不新增“查看图表/分布”按钮或 hover 提示；继续沿用点击行展开详情的当前交互。

### the agent's Discretion

- 分布图组件拆分方式、内部 prop 命名、DTO 字段命名和测试 fixture 命名。
- 横向条形图的具体 ECharts series 配置、颜色、最大峰标记样式、图内滚动或压缩策略。
- 不可用卡片的具体文案、图标和颜色层级，但必须区分 `missing` 与 `blocked/failed`。
- 是否在现有 `StockKlineChart` 中扩展详情布局，或拆出新的股票详情图表容器组件。
- `/api/results/chart/[tsCode]` 是否继续复用并扩展 `ChartSnapshot`，或新增内部 DTO，只要页面 API 不暴露敏感错误细节。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Phase Boundary

- `.planning/PROJECT.md` — v2.0 目标、双日完整筹码分布对比目标、个人使用和 Tushare 数据源约束。
- `.planning/REQUIREMENTS.md` — UI-05、CHRT-07、CHRT-08、CHRT-09、CHRT-10、CHRT-11 的正式需求。
- `.planning/ROADMAP.md` — Phase 11 目标、依赖 Phase 10、成功标准和本阶段边界。
- `.planning/phases/10-dual-day-chip-distribution/10-CONTEXT.md` — 双日分布数据语义、latest/previous 独立状态、完整分布为唯一筹码源数据。
- `.planning/phases/09-incremental-refresh-workflow/09-CONTEXT.md` — 筛选结果先发布、筹码后台独立、状态 UI 和脱敏错误展示约束。
- `.planning/phases/08-controlled-provider-concurrency/08-CONTEXT.md` — provider 错误分类、脱敏和筹码请求优先级背景。

### Existing UI and Chart Code

- `src/components/results/results-table.tsx` — 当前结果表格、排序入口、点击行展开 inline chart 的交互结构；Phase 11 需要删除筹码峰列和排序。
- `src/components/charts/stock-kline-chart.tsx` — 当前 K 线图、MA20/MA60、区间高点、85% 阈值和旧筹码峰 overlay；Phase 11 需要移除筹码峰 overlay 并新增双分布展示。
- `src/components/status/status-workspace.tsx` — 工作台承载 `ResultsTable`，页面刷新和状态区域应继续保持兼容。
- `src/app/api/results/chart/[tsCode]/route.ts` — 当前股票图表数据 API；Phase 11 可扩展其返回 DTO。

### Result and Chip Data Code

- `src/lib/results/chart-data.ts` — 当前 `readLatestChartSnapshot()` 组装 K 线、均线和 overlay；Phase 11 需要接入双日完整分布数据。
- `src/lib/results/chart-types.ts` — 当前 ChartSnapshot DTO；Phase 11 需要新增双分布图 DTO 或等价结构。
- `src/lib/results/results-types.ts` — 当前 ResultRow 仍含兼容筹码峰字段；Phase 11 需谨慎删除 UI 依赖，避免破坏 backend 兼容投影。
- `src/lib/results/results-snapshot.ts` — 当前结果快照从 Phase 10 distribution run 派生旧筹码峰字段；Phase 11 要避免继续把旧筹码峰作为 UI 主数据。
- `src/lib/chip/chip-store.ts` — `readLatestChipDistributionRun()`、`readChipDistributionStatusesForRun()`、`readChipDistributionForDate()` 等双日分布读取入口。
- `src/lib/chip/chip-types.ts` — `ChipDistributionLevel`、`ChipDistributionStatusRecord`、target kind/status 类型。

### Tests and Smoke

- `tests/ui/results-table.test.tsx` — 表格列、排序和 inline 展开交互测试，需要改为无筹码峰列。
- `tests/ui/stock-kline-chart.test.tsx` — 当前 K 线图和筹码峰 overlay 测试，需要改为双分布图和无 overlay。
- `tests/results/chart-data.test.ts` — 图表 DTO 数据组装测试，需要覆盖 latest/previous 分布、共享尺度和单日不可用。
- `tests/smoke/seed-smoke-db.ts` — smoke DB 已有 `chip_distribution_*` 种子，Phase 11 smoke 应使用这些数据验证图表。
- `tests/smoke/app-smoke.spec.ts` — 浏览器关键路径应更新为验证表格无筹码峰列、展开详情有 K 线和双日分布。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ResultsTable` 已有行点击展开模式、键盘 Enter/Space 操作和 `StockKlineChart` inline row 插入点，可直接沿用。
- `StockKlineChart` 已经使用 ECharts、客户端 fetch、loading/unavailable/failed 状态和 resize/dispose 生命周期，可复用图表初始化模式。
- `readLatestChartSnapshot()` 已集中组装股票详情图表数据，适合作为双日分布 DTO 的服务端聚合点。
- `chip-store.ts` 已提供按 distribution run/status/stock/date 读取完整分布和目标状态的基础能力。

### Established Patterns

- 图表数据通过 `/api/results/chart/[tsCode]` 加载；组件不直接读数据库。
- 页面错误和状态展示必须脱敏，不暴露 token、本地路径、headers 或 provider 原始响应。
- 当前工作台使用表格扫视 + 行内详情研判的模式；Phase 11 继续沿用，不引入侧栏、弹窗或复杂联动。
- Phase 10 保留旧筹码峰兼容字段，但 Phase 11 的用户体验应以完整分布图为主，不再把筹码峰放回表格或 K 线。

### Integration Points

- `results-table.tsx`：删除 `chipPeakPrice` 排序 key、`ChipPeakCell` 和筹码峰列；调整展开行 `colSpan`。
- `chart-types.ts`：为 latest/previous 分布、目标状态、交易日期、错误类别/说明、共享尺度增加 DTO。
- `chart-data.ts`：读取 latest screening run 对应的 latest distribution run，组装 previous/latest 两个目标日分布图数据。
- `stock-kline-chart.tsx`：移除旧 chip peak markLine 和 badge；在 K 线下方渲染 previous/latest 横向条形分布图或拆出的分布组件。
- 测试和 smoke：用 Phase 10 已种下的 `chip_distribution_*` 数据验证双日图、单日失败和表格简化。

</code_context>

<specifics>
## Specific Ideas

- 用户明确选择 previous 在左、latest 在右，优先体现“从前一日到最新日”的时间变化。
- 用户明确选择两张分布图等宽等高、共享价格和占比尺度，避免视觉权重或自适应尺度误导比较。
- 用户明确选择只在分布图内标出最大占比档位，不恢复表格筹码峰列或 K 线筹码峰 overlay。
- 用户明确选择表格完全不显示筹码分布状态；所有分布可用性信息都留到展开详情区。

</specifics>

<deferred>
## Deferred Ideas

- K 线和筹码分布图之间的 hover/click 价格参考线联动不进入 Phase 11。
- 表格中的筹码分布状态排序、状态徽标、查看分布按钮或 hover 提示不进入 Phase 11。
- 网页手动重试筹码、清理 blocked 状态、全历史筹码回填、性能验收目标不进入 Phase 11。

</deferred>

---

*Phase: 11-Distribution Comparison Experience*
*Context gathered: 2026-06-30T05:50:22+08:00*
