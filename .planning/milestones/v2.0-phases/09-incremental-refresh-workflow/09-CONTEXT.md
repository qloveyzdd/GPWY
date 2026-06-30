# Phase 9: Incremental Refresh Workflow - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers a recoverable ordinary incremental refresh workflow for the normalized market data cache. A manual refresh must request only missing or failed data items for the current target 60 market trading days, resume safely after interruption, publish new screening results as soon as market data and screening succeed, and expose understandable stage progress on the page.

This phase covers ordinary incremental market refresh, refresh-stage persistence, result publishing boundaries, status UI, and an operations-only full rebuild command. It does not implement full two-day chip distribution storage or distribution charts; Phase 9 only defines the chip stage as a background follow-up stage so screening results are not blocked by chip work. Full chip distribution data belongs to Phase 10, and chart replacement belongs to Phase 11.

</domain>

<decisions>
## Implementation Decisions

### 增量刷新与断点恢复边界

- **D-09-01:** 普通刷新已有 active normalized cache 时，只补目标 60 个有效交易日内缺失或失败的数据项；不创建每次完整重建式的新 generation。
- **D-09-02:** `daily` 与 `adj_factor` 按数据项独立记录状态、独立补齐、独立续跑。某交易日 `daily` 成功但 `adj_factor` 失败时，下次普通刷新只补 `adj_factor`。
- **D-09-03:** 当数据源没有新增交易日，且目标 60 个交易日的 `daily` 与 `adj_factor` 都完整时，普通刷新不得重新下载已有 60 日行情或复权因子；它可以按需要更新股票状态，然后用现有缓存重跑筛选并发布最新筛选结果。
- **D-09-04:** 如果本次增量刷新只完成部分行情数据后中断或失败，已成功数据项保留在缓存中用于下次续跑；只有目标 60 个交易日的 `daily` 与 `adj_factor` 都完整后，才运行并发布新筛选结果。失败期间保留旧结果。

### 筛选结果发布时间点

- **D-09-05:** 刷新 job 的成功边界是“行情/复权补齐并完成筛选”。达到该边界后，页面立即可见新筛选结果。
- **D-09-06:** 筹码处理是刷新成功后的独立后台阶段，不阻塞刷新 job 标记成功。
- **D-09-07:** 每次新筛选结果发布后自动启动筹码后台处理；不新增网页上的手动筹码启动按钮。
- **D-09-08:** 筹码后台阶段失败不影响筛选结果可用；页面需要显示筹码阶段失败数量和脱敏原因，后续刷新或阶段重试可继续补。
- **D-09-09:** 任一普通刷新、筹码后台阶段或全量重建仍在运行时，拒绝启动新的手动刷新，避免 provider 并发额度和 SQLite 写入状态叠加。

### 阶段进度与 UI 展示

- **D-09-10:** 页面展示四个用户可理解阶段：`股票列表`、`行情/复权`、`筛选`、`筹码处理`。
- **D-09-11:** 每个阶段显示状态、总数、完成数、失败数和耗时；重试次数只在阶段失败或警告时显示。
- **D-09-12:** 页面错误信息只显示阶段失败数量和脱敏错误摘要；不得暴露 token、本地路径、headers、原始 provider 响应全文或其他敏感细节。
- **D-09-13:** 沿用现有 `/api/refresh/status` 轮询方式，约 2 秒刷新一次状态；筛选阶段完成时刷新服务端结果快照，筹码阶段后续完成时再刷新一次。

### 运维全量重建路径

- **D-09-14:** 全量重建仅通过 npm 脚本或 CLI 运维命令暴露，只能在服务器 shell 中执行；网页不提供高成本重建入口。
- **D-09-15:** 全量重建写入新的 building generation；只有完整验证通过后才激活。失败时旧 active cache 和旧筛选结果继续可用。
- **D-09-16:** 普通刷新、筹码后台阶段和全量重建互斥运行，不允许并发叠加。
- **D-09-17:** 全量重建命令行输出各阶段状态、总数、完成数、失败数、耗时和脱敏错误摘要，用于后续制定真实性能验收标准。

### the agent's Discretion

- 增量状态表、字段名、索引名和内部状态枚举。
- 普通刷新如何计算目标 60 个有效交易日与本地缓存差集，但必须满足 D-09-01 至 D-09-04。
- 阶段进度记录的内部表结构、聚合函数和 API response shape，但 UI 必须符合 D-09-10 至 D-09-13。
- 筹码后台阶段在 Phase 9 中是否复用现有 chip peak runner 或抽象为后续 Phase 10 可替换接口，但不得阻塞筛选结果发布。
- CLI 命令名称、参数名和输出格式细节，但必须是运维 shell 路径，不得成为网页入口。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Phase Boundary

- `.planning/PROJECT.md` — v2.0 目标、手动刷新约束、受控并行和双日筹码分布后续目标。
- `.planning/REQUIREMENTS.md` — DATA-07、REFR-09、REFR-10、REFR-11、REFR-12、REFR-13、UI-06、UI-07 的正式需求。
- `.planning/ROADMAP.md` — Phase 9 目标、依赖、成功标准，以及 Phase 10/11 边界。
- `.planning/phases/07-standardized-market-data-cache/07-CONTEXT.md` — normalized cache、market generation、atomic activation 和旧结果保留规则。
- `.planning/phases/08-controlled-provider-concurrency/08-CONTEXT.md` — provider scheduler、请求优先级、并发预算和 tinyshare worker 约束。

### Refresh and Market Cache Code

- `src/lib/refresh/refresh-types.ts` — 当前刷新 job/status 类型，Phase 9 需要扩展阶段进度。
- `src/lib/refresh/refresh-runner.ts` — 当前手动刷新 orchestration、刷新 job 成功边界和筹码阻塞点。
- `src/lib/refresh/bootstrap-market-data.ts` — 当前 60 日 bootstrap 和全量激活路径；全量重建应沿用其安全激活语义。
- `src/lib/refresh/fetch-refresh-data.ts` — 交易日、股票列表、`daily` 与 `adj_factor` provider 获取入口。
- `src/lib/refresh/market-data-store.ts` — normalized cache generation、generation date 状态、quotes/factors 存储和 atomic activation。
- `src/lib/refresh/market-data-reader.ts` — 筛选读取 active generation 并动态前复权的路径。
- `src/lib/refresh/refresh-store.ts` — 当前 refresh_jobs、运行锁和 latest-success 行为。

### Screening, Results, and Chip Integration

- `src/lib/screening/screening-runner.ts` — 行情完整后运行筛选并写入 screening run。
- `src/lib/results/results-snapshot.ts` — 页面读取 latest screening result 和 chip result 的快照语义。
- `src/lib/chip/chip-runner.ts` — 当前筹码后台处理入口，Phase 9 需要让它不阻塞刷新成功。
- `src/lib/chip/chip-store.ts` — 当前 chip run/result 状态聚合，可复用于筹码阶段状态展示。

### UI and API Surfaces

- `src/components/status/status-workspace.tsx` — 当前刷新按钮、2 秒轮询、状态摘要和结果刷新逻辑。
- `src/app/api/refresh/run/route.ts` — 手动刷新触发入口。
- `src/app/api/refresh/status/route.ts` — 刷新状态轮询入口。
- `src/app/page.tsx` — 服务端读取状态和结果快照后传入工作台。

### Tests

- `tests/refresh/refresh-runner.test.ts` — 刷新 job、screening 和 chip runner 现有 workflow 语义。
- `tests/refresh/bootstrap-market-data.test.ts` — generation activation、失败清理和并行日期任务语义。
- `tests/refresh/market-data-store.test.ts` — normalized cache storage 与 generation date 状态。
- `tests/ui/status-workspace.test.tsx` — 当前页面轮询、bootstrap 文案和刷新后 router refresh 行为。
- `tests/chip/chip-runner.test.ts` — chip runner 成功、阻塞和失败语义。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `refresh_jobs` 已有单运行锁，可扩展为刷新类任务互斥基础。
- `market_generation_dates` 已按交易日保存 `daily_status` 与 `factor_status`，可作为 Phase 9 数据项续跑的起点。
- `upsertMarketDailyQuotes` 与 `upsertMarketAdjustmentFactors` 已可按 generation/date 写入数据，适合补缺式写入。
- `readAdjustedMarketData()` 已只读取 active generation 并按最新基准动态前复权，适合在完整性满足后直接重跑筛选。
- `StatusWorkspace` 已有 2 秒轮询和刷新完成后 `router.refresh()` 机制，可扩展为阶段完成触发结果刷新。
- `classifyTushareError()` 和现有脱敏逻辑可复用到阶段错误摘要。

### Established Patterns

- 半成品 market generation 不应替换 active generation；失败期间旧结果继续可用。
- provider 错误在持久化或 UI 暴露前必须分类和脱敏。
- 页面不暴露内部表名、本地路径、token 或 provider 原始响应。
- 单进程个人部署使用 SQLite 和进程内后台任务，不引入 Redis、外部队列或复杂调度系统。
- Phase 8 已将并发、重试、退避和 provider 超时收敛到 shared scheduler；Phase 9 不应重新实现 provider 重试层。

### Integration Points

- `refresh-runner.ts` 需要拆分“刷新 job 成功”和“筹码后台阶段完成”的边界。
- `market-data-store.ts` 需要支持读取目标 60 日缺失/失败数据项并在普通刷新中补齐。
- `refresh-types.ts` 需要扩展阶段状态快照，供 `/api/refresh/status` 和 UI 使用。
- `status-workspace.tsx` 需要显示四阶段进度，并在筛选阶段完成和筹码阶段完成时刷新页面数据。
- 运维 CLI 应复用 bootstrap/full rebuild 安全激活语义，但不通过网页 API 暴露。

</code_context>

<specifics>
## Specific Ideas

- 普通刷新优先证明“少请求”：无新增交易日且本地完整时，不下载已有 60 日行情/复权因子。
- 阶段文案面向个人研判，而不是运维控制台；阶段名使用“股票列表、行情/复权、筛选、筹码处理”。
- 性能验收标准继续后置，Phase 9 先采集真实阶段耗时、失败数量和重试摘要。
- 全量重建可能按小时计算，因此旧结果必须持续可用。

</specifics>

<deferred>
## Deferred Ideas

- 完整双日筹码分布获取、缓存、按股票交易日复用和行级状态属于 Phase 10。
- 详情页展示最新交易日与前一有效交易日的两个完整筹码分布图属于 Phase 11。
- 自动每日调度刷新、历史筛选结果对比、CSV 导出和全市场历史回填仍在未来里程碑。
- 根据 Phase 9 实测数据制定刷新耗时验收标准，仍 deferred 到 PERF-01。

</deferred>

---

*Phase: 09-Incremental Refresh Workflow*
*Context gathered: 2026-06-27*
