# Phase 8: Controlled Provider Concurrency - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 为所有 Tushare REST 与 tinyshare 请求建立同一套服务进程级调度契约，包括全局并发限制、有界重试、动态降并发、请求优先级、防饥饿、单项超时和持久 Python worker 池。

本阶段覆盖行情、复权因子、筹码和数据源验证请求，但不实现普通刷新缺失日期规划、跨重启断点续传、刷新阶段进度 UI、双交易日筹码存储或筹码分布图；这些分别属于 Phase 9 至 Phase 11。

</domain>

<decisions>
## Implementation Decisions

### 全局并发额度
- **D-01:** REST、tinyshare、行情、复权因子、筹码和数据源验证共用一个服务进程级全局调度器与并发池，不允许各工作流分别拥有可叠加的上限。
- **D-02:** 全局最大并发数仅通过服务端环境变量配置；未配置时默认值为 `8`。
- **D-03:** tinyshare worker 池容量属于同一全局并发预算，不是额外叠加的并发额度。
- **D-04:** 检测到连续 `rate_limited` 后，本次服务运行内自动逐级降低有效并发；后续请求稳定成功后缓慢恢复，但永远不超过环境变量上限。

### 重试与退避
- **D-05:** 每项 provider 请求最多尝试 `3` 次，包括首次请求和最多 `2` 次重试。
- **D-06:** `rate_limited` 与 `network_or_service` 使用相同的指数退避并加入随机抖动，避免同步重试风暴。
- **D-07:** 只有 `rate_limited` 会触发动态降低并发；普通网络或临时服务错误只执行有界退避重试。
- **D-08:** `missing_config`、`invalid_token`、`permission_denied`、`empty_data` 和 `unknown` 均不重试。

### tinyshare Worker 故障恢复
- **D-09:** tinyshare 使用固定数量的持久 Python worker；每个 worker 内串行处理请求，worker 之间并行。
- **D-10:** 单项请求超时后必须终止并重建对应 worker，不继续复用可能处于未知状态的 SDK 进程。
- **D-11:** worker 崩溃或超时导致的在途请求重新入队，并消耗该请求统一的三次尝试预算。
- **D-12:** 每个 worker 槽位最多连续重建 `3` 次；预算耗尽后将该槽位标记为不可用。
- **D-13:** 所有 worker 槽位均不可用时，结束当前 tinyshare 批次并明确标记队列中未完成请求失败，使刷新能够正常收尾。
- **D-14:** tinyshare 故障时不自动切换 REST，避免静默改变授权方式和数据口径。

### 请求调度顺序
- **D-15:** 基础优先级从高到低为：交互式数据源验证、行情与复权因子、筹码请求。
- **D-16:** 调度器使用等待时间提升优先级，低优先级请求等待超过阈值后逐步升级，避免筹码请求长期饥饿。
- **D-17:** 同一交易日的 `daily` 与 `adj_factor` 是两个独立调度任务，公平排队，失败和重试互不阻塞。
- **D-18:** 重试请求完成退避后按原始类型优先级重新入队，并保留首次排队时间用于防饥饿计算。

### the agent's Discretion
- 环境变量的具体名称、数值校验范围和无效配置错误文案。
- 指数退避的基础延迟、最大延迟、抖动分布，以及可注入时钟/随机源的测试设计。
- 连续限频触发降并发的阈值、每次下降幅度、成功恢复阈值和恢复速度。
- 优先级数值、等待升级阈值和内部队列数据结构。
- worker 启动握手、行协议细节、应用退出时的优雅关闭等待时间和强制终止方式。
- REST 请求超时的具体实现方式，但必须与 tinyshare 一样保证单项不会永久悬挂。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Phase Boundary
- `.planning/PROJECT.md` — v2.0 受控并行目标、服务端环境变量约束和个人手动刷新边界。
- `.planning/REQUIREMENTS.md` — REFR-06、REFR-07、REFR-08 的正式需求。
- `.planning/ROADMAP.md` — Phase 8 目标、成功标准以及与 Phase 9 的边界。
- `.planning/phases/07-standardized-market-data-cache/07-CONTEXT.md` — Phase 7 已锁定的串行 provider 行为、标准化缓存和后续并发边界。

### Architecture and Risks
- `.planning/research/ARCHITECTURE.md` — 共享请求调度器、持久 tinyshare worker 池和行协议建议。
- `.planning/research/PITFALLS.md` — 无界并发、限频风暴、worker 永久悬挂和长事务风险。

### Existing Provider Contracts
- `src/lib/tushare/types.ts` — REST 与 tinyshare 共用的 `TushareClientLike.query` 契约和错误类别。
- `src/lib/tushare/client.ts` — REST 请求、响应校验及统一错误分类。
- `src/lib/tushare/provider.ts` — provider 选择与客户端创建入口。
- `src/lib/tushare/tinyshare-client.ts` — 当前每请求启动一次 Python 的实现，本阶段需要替换为持久 worker 池。
- `scripts/tinyshare_bridge.py` — 当前单请求桥接协议、tinyshare SDK 初始化和错误脱敏。
- `src/lib/config.ts` — 服务端环境变量校验和安全配置状态。

### Current Call Sites
- `src/lib/refresh/fetch-refresh-data.ts` — 当前局部重试逻辑和串行行情/复权请求。
- `src/lib/refresh/bootstrap-market-data.ts` — 60 日引导调用链；本阶段只接入调度器，不改变 Phase 7 激活语义。
- `src/lib/chip/chip-runner.ts` — 当前逐股票串行筹码请求。
- `src/lib/validation/run-basic-validation.ts` — 基础验证 provider 请求。
- `src/lib/validation/chip-and-price-validation.ts` — 当前并行验证请求，必须纳入全局额度。

### Tests
- `tests/validation/tinyshare-provider.test.ts` — tinyshare provider、UTF-8 和通用请求形状测试基础。
- `tests/refresh/fetch-refresh-data.test.ts` — 当前临时/确定性错误重试语义。
- `tests/chip/chip-runner.test.ts` — 筹码请求和行级失败持久化语义。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TushareClientLike.query()`：REST 与 tinyshare 已共享单一调用形状，适合作为调度器包装边界。
- `classifyTushareError()`：已有稳定错误分类，可直接决定是否重试和是否触发降并发。
- `createTushareClient()`：现有 provider 工厂可改为返回接入统一调度契约的客户端。
- Zod 服务端配置模式：可扩展并发、超时和重试环境变量，同时保持客户端只看到安全状态。

### Established Patterns
- provider 错误在持久化和 UI 暴露前统一分类并脱敏。
- 网络请求不持有 SQLite 写事务。
- 刷新只允许一个 running job，但数据源验证等其他 provider 调用仍可能并发，因此上限必须是服务进程级。
- 当前行情请求含局部重试，筹码请求自行捕获错误；本阶段需要收敛为统一调度器，避免重复重试层叠。

### Integration Points
- 在 `TushareClientLike` 调用边界引入共享调度器，使刷新、筹码和验证无需各自实现并发控制。
- 将 `TinysharePythonClient` 的一次性 `spawn` 改为固定 worker 槽位和带请求 ID 的持续 stdin/stdout 行协议。
- `fetch-refresh-data.ts`、`chip-runner.ts` 和验证模块改为提交带类型优先级的独立任务。
- 测试需要可注入执行器、时钟和随机源，以确定性证明峰值在途数、退避、降并发、优先级老化和 worker 重建预算。

</code_context>

<specifics>
## Specific Ideas

- 默认全局并发上限明确为 `8`，但运行时限频可以临时降低有效值。
- 交互式数据源验证应优先响应，同时必须通过等待老化保证筹码最终获得执行机会。
- `daily` 与 `adj_factor` 不成对占用调度器；它们独立排队、独立失败、独立重试。
- tinyshare worker 全部失效后要明确结束批次，不能让界面长期停留在运行状态。

</specifics>

<deferred>
## Deferred Ideas

- 缺失交易日规划、断点续传、阶段进度与重试计数持久化属于 Phase 9。
- 双交易日完整筹码分布获取和存储属于 Phase 10。
- 双筹码分布图和相关页面状态属于 Phase 11。
- 根据生产实测制定刷新耗时验收标准，继续保留到 Phase 9 收集运行数据后决定。

</deferred>

---

*Phase: 8-controlled-provider-concurrency*
*Context gathered: 2026-06-26*
