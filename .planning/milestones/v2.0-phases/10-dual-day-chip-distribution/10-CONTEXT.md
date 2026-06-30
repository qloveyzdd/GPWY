# Phase 10: Dual-Day Chip Distribution - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 10 交付“每只入选股票 × 最新有效交易日/前一有效交易日”的完整筹码分布后端能力。系统需要从筛选实际使用的有效 K 线序列中确定两个目标交易日，使用 Tushare `cyq_chips` 获取并保存目标日期的全部价格档位与占比，按股票和日期复用已成功缓存，并独立记录成功、失败、阻塞或缺失状态。

本阶段覆盖完整筹码分布的获取、存储、完整替换、缓存复用、失败/阻塞状态和旧筹码峰兼容派生。最终双分布图 UI、删除表格筹码峰列、K 线移除旧筹码峰 overlay 属于 Phase 11；Phase 10 只保证现有页面不退化，并为 Phase 11 提供可靠数据。

</domain>

<decisions>
## Implementation Decisions

### 单日期失败语义

- **D-10-01:** 两个目标交易日按“股票 + 交易日”独立记录状态；最新有效交易日和前一有效交易日各自拥有 `succeeded`、`failed`、`blocked` 或 `missing` 状态。
- **D-10-02:** 一个日期失败或阻塞时，不影响另一个日期的可用性；成功日期必须可以被后续读取和展示使用。
- **D-10-03:** 如果某只入选股票只有 1 条有效日线，最新日仍继续处理，前一有效日记录为 `missing`，不跳过整只股票。
- **D-10-04:** 目标日期必须来自筛选实际使用的同一只股票有效 K 线序列：最新有效交易日等于筛选结果 `latestTradeDate`，前一有效交易日从同一序列向前取一条有效 bar；不得按自然日前一天、市场级最近两个交易日或 provider 返回日期事后推断。

### 缓存复用和重试

- **D-10-05:** 某个“股票 + 交易日”的完整筹码分布已缓存后，后续普通刷新直接跳过该项，不再请求 provider。
- **D-10-06:** 完整缓存的判定是状态为 `succeeded` 且至少有 1 个价格档位；空数组或仅有成功状态但无档位不得视为完整缓存。
- **D-10-07:** `failed` 表示限频、网络或临时服务错误等可能恢复的问题，不视为完整缓存；下次刷新自动重试。
- **D-10-08:** `blocked` 表示缺 token、权限不足、接口不可用、空数据等通常不会靠立即重试解决的问题；后续刷新不自动重试，保留脱敏原因。只有目标日期变化或维护者显式清理状态后才重新请求。

### 旧筹码峰兼容

- **D-10-09:** 完整筹码分布是 Phase 10 之后的唯一筹码源数据；旧前三筹码峰只作为从完整分布派生的兼容字段存在。
- **D-10-10:** Phase 10 必须继续覆盖现有旧消费方：结果快照、表格筹码峰列、K 线筹码峰 overlay。当前页面不能因为 Phase 10 提前退化。
- **D-10-11:** 旧兼容筹码峰只从最新有效交易日的完整分布派生，等价替代当前 `latestTradeDate` 的旧行为；前一有效交易日分布只供新接口和 Phase 11 对比图使用。
- **D-10-12:** 如果最新有效交易日完整分布失败或阻塞，即使前一有效交易日成功，旧筹码峰兼容字段也必须显示最新日失败/不可用；不得用前一日分布冒充当前筹码峰。

### 完整性判定

- **D-10-13:** 如果一次日期区间请求只返回两个目标日期中的一个，返回的目标日保存为 `succeeded`，未返回的目标日记录为 `blocked/empty_data` 和脱敏原因；不得让整只股票两天都失败。
- **D-10-14:** 如果区间请求返回非目标日期，Phase 10 只保存目标两个日期，忽略非目标日期，避免扩大缓存边界。
- **D-10-15:** 同一股票同一交易日的新分布写入时，必须在单个事务内完整替换：先删除该股票-日期旧价格档位，再插入新档位和状态，避免残留旧分布。
- **D-10-16:** 目标日期返回 0 个价格档位时，记录为 `blocked/empty_data`；它不是完整缓存，不展示为成功，也不作为临时失败无限自动重试。

### the agent's Discretion

- 内部表名、索引名、状态枚举落库字段、读取 API shape 和 TypeScript 类型命名。
- `cyq_chips` 日期区间请求的具体参数构造方式，只要 provider 支持时能一次请求覆盖两个目标交易日，并按日期独立保存结果。
- 目标前一有效交易日的具体读取实现，可以复用 `readAdjustedMarketBarsForStock()` 或新增专用读取函数，但必须遵守 D-10-04。
- 旧筹码峰兼容字段的派生函数位置和结果快照集成方式，但完整分布必须是唯一源数据。
- 维护者如何清理 `blocked` 状态可以先保持为内部操作或后续运维能力；Phase 10 不新增网页重试按钮。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Phase Boundary

- `.planning/PROJECT.md` — v2.0 目标、Tushare 数据源约束、双交易日完整筹码分布目标和 Phase 11 展示边界。
- `.planning/REQUIREMENTS.md` — CHIP-05 至 CHIP-10 的正式需求，以及 UI/CHRT 后续边界。
- `.planning/ROADMAP.md` — Phase 10 目标、依赖 Phase 9、成功标准和 Phase 11 分工。
- `.planning/phases/07-standardized-market-data-cache/07-CONTEXT.md` — standardized cache、有效 K 线和旧结果保留规则。
- `.planning/phases/08-controlled-provider-concurrency/08-CONTEXT.md` — 共享 provider scheduler、受控并发、重试/退避和筹码请求优先级约束。
- `.planning/phases/09-incremental-refresh-workflow/09-CONTEXT.md` — 筛选结果先发布、筹码后台阶段、operation lock 和阶段状态约束。

### Chip Distribution Code

- `src/lib/chip/chip-types.ts` — 当前 chip peak 类型，需要扩展为完整分布、日期级状态和兼容派生类型。
- `src/lib/chip/chip-peak.ts` — 当前 `cyq_chips` 映射和前三峰提取逻辑；可复用映射，但完整分布要成为源数据。
- `src/lib/chip/chip-store.ts` — 当前 `chip_peak_*` run/result/level 存储；Phase 10 需要替换或扩展为股票-日期级完整分布缓存。
- `src/lib/chip/chip-runner.ts` — 当前从最新筛选结果拉取单日前三峰的后台入口；Phase 10 需要改为双日期完整分布处理和缓存复用。

### Screening and Date Source

- `src/lib/screening/screening-store.ts` — 筛选结果包含 `latestTradeDate`，是最新目标日期来源。
- `src/lib/screening/screening-types.ts` — `ScreeningResultRecord` 和有效 bar 结构，是目标日期语义的类型基础。
- `src/lib/refresh/market-data-reader.ts` — 当前按 generation/股票读取动态前复权有效 K 线；前一有效交易日应来自同一序列。
- `src/lib/refresh/market-data-store.ts` — market generation、daily quotes、adjustment factors 和 active generation 读取基础。

### Result and Refresh Integration

- `src/lib/results/chart-data.ts` — 当前 K 线 overlay 消费旧 `chipPeaks`；Phase 10 必须保持兼容，Phase 11 再替换为双分布图。
- `src/lib/refresh/refresh-runner.ts` — 当前筹码后台阶段启动、进度回调和 operation lock；Phase 10 需要沿用该运行边界。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `mapCyqChipsTable()` 已能把 Tushare `cyq_chips` rows 映射为 `{ tsCode, tradeDate, price, percent }`，可作为完整分布行的输入校验基础。
- `extractChipPeaks()` 可继续用于从最新有效交易日完整分布派生前三峰兼容字段，但不能再作为源数据存储模型。
- `runChipPeakIntegrationFromLatestScreening()` 已接入共享 provider scheduler 的 `priority: "chip"` 和 Phase 9 的后台进度回调，可作为双日期 runner 的替换起点。
- `readAdjustedMarketBarsForStock()` 已能按 market generation 与股票读取筛选同源有效 K 线，适合确定前一有效交易日。
- `readRefreshStatus()` 和 chip stage 进度已有 `chipVersion`/stage marker，可继续用于 Phase 10 后台状态刷新。

### Established Patterns

- Provider 请求通过 Phase 8 共享 scheduler 控制并发、重试和优先级；Phase 10 不应再实现私有并发池或私有重试层。
- 错误持久化和 UI 暴露前必须经过分类和脱敏，不暴露 token、本地路径、headers 或原始 provider 响应全文。
- 刷新成功边界仍是行情/复权和筛选成功；筹码后台失败不影响筛选结果可用。
- 单进程个人部署继续使用 SQLite 和短事务；不引入 Redis、外部队列或 PostgreSQL。
- 当前结果表格和 K 线仍依赖旧筹码峰字段，Phase 10 需要兼容，Phase 11 才移除。

### Integration Points

- `chip-store.ts` 需要支持股票-日期级完整分布缓存、状态表和事务内完整替换。
- `chip-runner.ts` 需要从最新筛选结果规划每只股票两个目标日期，跳过完整缓存，重试 `failed`，保留 `blocked`。
- `results-snapshot.ts` 需要继续得到旧筹码峰兼容字段，且该字段从最新有效交易日完整分布派生。
- `chart-data.ts` 需要继续收到旧 overlay 兼容数据，避免 Phase 10 提前破坏现有 K 线展示。
- `refresh-runner.ts` 的 chip stage 进度需要反映双日期工作量，失败数应包含日期级 failed/blocked/missing。

</code_context>

<specifics>
## Specific Ideas

- 用户明确选择“日期级独立”：不要因为前一有效日失败而隐藏最新日成功数据。
- 用户明确选择“完整分布唯一源数据”：旧前三峰只是兼容层，不再作为事实源。
- 用户明确选择“最新日语义优先”：旧筹码峰不能用前一有效日冒充。
- 用户明确选择“只保存目标日期”：provider 返回的非目标日期不纳入本阶段缓存。

</specifics>

<deferred>
## Deferred Ideas

- 详情页展示最新有效交易日与前一有效交易日的两个完整筹码分布图属于 Phase 11。
- 表格删除筹码峰字段、删除筹码峰排序、K 线移除旧前三峰 overlay 属于 Phase 11。
- 网页手动“重试筹码”、TTL 过期重拉、保存非目标日期、完整历史筹码回填和专门的筹码维护 UI 不属于 Phase 10。

</deferred>

---

*Phase: 10-Dual-Day Chip Distribution*
*Context gathered: 2026-06-29*
