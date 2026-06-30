# Phase 8: Controlled Provider Concurrency - Research

**Researched:** 2026-06-26
**Domain:** Node.js 服务进程级请求调度、超时取消与持久 Python worker 池
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- REST、tinyshare、行情、复权因子、筹码和数据源验证共用一个服务进程级全局调度器。
- 全局最大并发数仅通过服务端环境变量配置，未配置时默认 `8`。
- tinyshare worker 池容量计入全局并发预算，不叠加额外额度。
- 连续限频时逐级降低有效并发，稳定成功后缓慢恢复，但不超过配置上限。
- 每项请求最多尝试 `3` 次，包括首次请求和最多 `2` 次重试。
- `rate_limited` 与 `network_or_service` 使用相同的指数退避和随机抖动。
- 只有 `rate_limited` 触发降并发；配置、token、权限、空数据和未知错误不重试。
- tinyshare 使用固定数量持久 worker；单 worker 串行、worker 之间并行。
- 请求超时后终止并重建 worker；在途请求重新入队并消耗请求尝试预算。
- 每个 worker 槽位最多连续重建 `3` 次；全部槽位不可用时结束 tinyshare 批次。
- tinyshare 故障时不自动切换 REST。
- 调度优先级为验证、行情/复权、筹码，并使用等待时间提升优先级防止饥饿。
- `daily` 与 `adj_factor` 独立排队；重试保留首次入队时间。

### the agent's Discretion

- 环境变量命名、范围与安全错误文案。
- 退避基础延迟、抖动公式、降并发和恢复阈值。
- 优先级数值、等待升级阈值和内部队列结构。
- worker 握手、行协议、关闭超时与 REST 超时实现。

### Deferred Ideas (OUT OF SCOPE)

- 普通增量日期规划、跨重启断点续传、阶段进度和持久重试统计属于 Phase 9。
- 双日筹码数据与图表属于 Phase 10 和 Phase 11。
- 刷新耗时验收标准在收集生产运行数据后制定。
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 全局并发、优先级、重试与退避 | API/Backend | — | 所有 provider 调用必须在同一 Node 服务进程内受控 |
| REST 单项取消 | API/Backend | External Tushare API | Node fetch 使用 AbortSignal 终止实际网络请求 |
| tinyshare 持久 worker 池 | API/Backend | Python child process | Node 管理进程槽位，Python 复用 SDK 客户端 |
| Python 行协议 | Python worker | API/Backend | request_id 关联请求与响应，stdin/stdout 承载持续通信 |
| 环境变量校验 | API/Backend | Deployment | 并发与超时配置只在服务端读取 |
| 行情与筹码并行提交 | Refresh/Chip workflows | Scheduler | 工作流生成任务，调度器决定实际启动顺序 |
</architectural_responsibility_map>

<research_summary>
## Summary

现有系统已经有统一的 `TushareClientLike.query()` 调用形状和稳定错误分类，最安全的接入方式是在 provider 工厂返回的客户端外包一层共享调度客户端。调度器负责队列、优先级、单项超时、重试和动态并发；REST 与 tinyshare 原始客户端只负责一次真实调用。这样可以删除 `fetch-refresh-data.ts` 中的局部重试，避免多层重试叠加。

调度策略包含动态并发、优先级老化和保留原始入队时间的重试，这些是项目特定规则。引入通用队列库仍需自行改写其策略，收益有限。建议使用无外部依赖的小型调度器，并注入时钟、延迟函数和随机源，使并发峰值、退避和公平性可以用 Vitest 假时钟稳定证明。

tinyshare 应从“每次 query 启动一个 Python”改为固定槽位池。每个 Python 进程启动后只初始化一次 tinyshare token 与 `pro_api()`，随后读取 JSON Lines 请求并逐行输出响应。Node 使用 `request_id`、单槽位单在途请求、超时终止和有限重建预算建立清晰恢复边界。

**Primary recommendation:** 建立一个 `globalThis` 进程级 provider runtime：共享调度器包装 REST/tinyshare 原始客户端，tinyshare 原始客户端内部维护固定持久 worker 槽位。
</research_summary>

<standard_stack>
## Standard Stack

### Core

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Node.js `AbortController` / `AbortSignal` | Node 22/24 LTS | 单项超时、组合取消 | Node 原生支持，fetch 与 child process 可共享取消语义 |
| `node:child_process.spawn` | Node 22/24 LTS | 启动持久 Python worker | 异步、不阻塞事件循环，可直接管理 stdin/stdout/stderr |
| `node:readline` `line` event | Node 22/24 LTS | 解析 worker JSON Lines 响应 | 官方建议性能敏感行流使用 `line` 事件 |
| Vitest fake timers | 已有 4.1.9 | 退避、恢复和老化测试 | 项目现有测试框架，无需新增依赖 |
| Zod | 已有 4.4.3 | 环境变量数值校验 | 项目已用于服务端安全配置 |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `globalThis` registry | 跨模块共享同一进程 runtime | Next.js 路由模块和开发热重载可能重复加载 provider 模块 |
| JSON Lines | worker 多请求协议 | 一条请求对应一条响应，便于流式解析与 request_id 关联 |
| `Promise.allSettled` | 等待并行行情任务完整收尾 | 失败 generation 清理前必须避免仍有任务继续写入 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 轻量项目调度器 | `p-queue` | 提供并发和优先级，但动态降并发、老化、保留首次排队时间仍需额外状态 |
| 轻量项目调度器 | `bottleneck` | 限速功能更强，但当前需求没有跨进程配额或复杂 reservoir，增加依赖和概念 |
| JSON Lines | 每请求单进程 | 已被 REFR-08 明确淘汰，启动和 SDK 初始化成本重复 |
| 持久 stdin/stdout | 本地 HTTP Python 服务 | 增加端口、服务发现和部署面，不符合 KISS |

**Installation:** 不新增 npm 或 Python 依赖。
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```text
刷新 / 筹码 / 数据源验证
          │ query(endpoint, params, priority)
          ▼
进程级 ScheduledTushareClient
          │
          ▼
ProviderRequestScheduler
├── 全局并发上限 / 动态有效并发
├── validation > market > chip
├── 等待老化、防饥饿
├── 3 次尝试、指数退避、随机抖动
└── 每次尝试 AbortSignal 超时
          │
          ├──────── REST ────────► fetch(Tushare API)
          │
          └────── tinyshare ─────► PersistentWorkerPool
                                     ├── slot 1: Python + pro_api()
                                     ├── slot 2: Python + pro_api()
                                     └── timeout/exit → kill → bounded restart
```

### Recommended Project Structure

```text
src/lib/tushare/
├── request-scheduler.ts       # 队列、重试、退避、动态并发和快照
├── scheduled-client.ts        # TushareClientLike 包装器
├── provider-runtime.ts        # globalThis 单例、配置和释放
├── client.ts                  # 一次 REST 调用，支持 AbortSignal
├── tinyshare-client.ts        # 持久 worker 池
├── provider.ts                # 生产客户端入口
└── types.ts                   # priority/query options/runtime contracts

scripts/
└── tinyshare_bridge.py        # init/query/shutdown JSON Lines 协议
```

### Pattern 1: 调度器拥有重试，原始客户端只执行一次

**What:** 调度器每次启动 attempt 时创建 timeout signal，调用原始客户端一次；临时错误释放并发槽位后延迟重新入队。

**Why:** 如果工作流、调度器和客户端都重试，实际尝试次数会相乘。退避期间占用 active 槽位也会让队列停滞。

**Concrete recommendation:**

- `MAX_ATTEMPTS = 3`
- 首次重试基础延迟 `1000ms`
- 下一次延迟翻倍，抖动范围 `±20%`
- `rate_limited` 和 `network_or_service` 可重试
- 退避期间 `activeCount` 已释放

### Pattern 2: 有上限的动态并发

**What:** 配置值是硬上限，调度器维护 `effectiveConcurrency`。

**Concrete recommendation:**

- 连续 `2` 次 `rate_limited`：有效并发减 `1`，最低为 `1`
- 连续 `8` 次成功：有效并发加 `1`，最高为配置上限
- 非限频结果重置限频连续计数
- 非成功结果重置成功连续计数
- 已启动请求不强制取消，只限制后续启动

### Pattern 3: 封顶的优先级老化

**What:** 请求保存 `basePriority`、`firstEnqueuedAt` 和稳定序号；等待时间逐步把低优先级提升到最高级，而不是无限增加所有请求的优先级。

**Concrete recommendation:**

- validation = `300`
- market = `200`
- chip = `100`
- 每等待 `5000ms` 增加 `100`，最高封顶 `300`
- 同优先级按首次入队时间和稳定序号排序
- 重试保留 `firstEnqueuedAt`

### Pattern 4: 持久 worker 的 init/query 协议

**What:** Python 进程启动后先完成一次初始化握手，再循环处理请求。

```json
{"type":"init","token":"[secret]"}
{"type":"ready"}
{"type":"query","request_id":"42","api_name":"daily","params":{},"fields":[]}
{"type":"result","request_id":"42","ok":true,"data":{"fields":[],"items":[]}}
{"type":"shutdown"}
```

**Rules:**

- token 只通过 stdin 初始化消息发送，不进入命令行参数。
- 所有 stdout 行必须是协议 JSON；诊断信息只写 stderr。
- `print(..., flush=True)`，避免响应停留在 Python 缓冲区。
- 单 worker 同时只处理一个请求。
- Node 同时监听 `error` 和 `close` 时必须使用一次性 settle 防止重复完成。

### Anti-Patterns to Avoid

- **`Promise.all` 直接调用原始 provider:** 会绕过全局上限。
- **退避时占用并发槽位:** 慢错误会阻塞健康请求。
- **只用 `Promise.race` 超时但不取消底层调用:** 表面释放槽位，真实网络或子进程仍运行，峰值会失真。
- **重复创建 provider runtime:** 不同 API route 各自并发 8，违反进程级上限。
- **generation 失败后立即清理但并行任务仍在写:** 会产生清理后的迟到写入。
- **worker stderr 无限累积:** 持久进程会导致内存持续增长，应只保留有界摘要。
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 网络/进程取消 | 仅设置布尔超时标记 | Node `AbortSignal` + 实际 fetch/child kill | 必须终止底层工作才能保证真实并发 |
| 流分隔解析 | 自行拼接并搜索换行且无上限 | `readline` `line` event | 处理跨 chunk 行边界且更清晰 |
| 错误判断 | 在每个调用点匹配消息 | `classifyTushareError()` | 已有统一、安全且测试覆盖的类别 |
| 协议关联 | 假设响应顺序永远正确 | `request_id` | 超时、重启和迟到响应需要明确关联 |
| 工作流内重试 | 每个 runner 各写一套循环 | 调度器单一重试所有权 | 防止尝试次数乘法和策略漂移 |

**Key insight:** 队列策略本身需要项目代码，但取消、进程、行解析和错误分类应复用已有平台能力。
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: 全局单例实际不是全局

**What goes wrong:** 不同 Next.js server 模块各创建一个 scheduler，每个都允许 8 个请求。
**How to avoid:** runtime 存在 `globalThis` 唯一键下，工厂只返回同一实例；提供测试专用 reset/dispose。
**Warning signs:** 单元测试通过，但并发集成测试观测到峰值大于配置。

### Pitfall 2: 超时后真实请求仍运行

**What goes wrong:** Promise 已拒绝，fetch 或 Python 仍占用网络和进程。
**How to avoid:** scheduler 传递 AbortSignal；REST fetch 使用 signal；tinyshare 超时直接终止 worker。
**Warning signs:** activeCount 已下降，但进程或 socket 数仍增长。

### Pitfall 3: 并行 bootstrap 失败后迟到写入

**What goes wrong:** `Promise.all` 首个错误立即抛出并清理 generation，其他请求完成后继续写已删除 generation。
**How to avoid:** 并行日期任务使用 `Promise.allSettled`，所有任务停止写入后再统一判定失败和清理。
**Warning signs:** 失败测试结束后仍出现未处理 rejection 或孤立行情行。

### Pitfall 4: worker 重建与请求重试形成双重预算

**What goes wrong:** worker 自己无限重建，同时 scheduler 再重试，批次长时间不结束。
**How to avoid:** 槽位连续重建预算固定 3；请求尝试预算固定 3；任一预算耗尽即明确失败。
**Warning signs:** 测试超时或 worker PID 持续变化但 Promise 不 settle。

### Pitfall 5: 优先级老化无法真正防饥饿

**What goes wrong:** 所有优先级同时无限增加，差值始终不变。
**How to avoid:** 低优先级按等待时间提升，但有效优先级封顶为最高级；同级使用首次入队时间排序。
**Warning signs:** 持续提交 validation 后 chip 测试永远不执行。
</common_pitfalls>

<validation_architecture>
## Validation Architecture

### Unit Boundary

- `request-scheduler.test.ts`
  - 峰值在途数不超过配置。
  - transient 只尝试三次，确定性错误只尝试一次。
  - 退避释放 active 槽位。
  - 两次限频降并发、八次成功恢复。
  - validation 优先，等待 chip 最终执行。
  - timeout 会 abort 底层 executor。

### Worker Integration Boundary

- `tinyshare-provider.test.ts`
  - 一个 worker 进程连续处理多个 query，不为每次 query spawn。
  - 多 worker 槽位并行，单槽位串行。
  - 超时/exit 触发重建并重新提交。
  - 每槽位三次预算和全池失效可确定结束。
  - token、Python 路径和 stderr 不出现在安全错误中。

### Workflow Integration Boundary

- bootstrap：60 日 `daily`/`adj_factor` 独立并行提交，峰值由 scheduler 控制；失败后等待全部任务 settle 再清理。
- chip runner：多股票并行提交，行级失败仍持久化。
- validation：现有 `Promise.all` 通过同一 scheduler，优先级为 validation。
- REST 与 tinyshare：相同 transient/definitive 分类和尝试次数。

### Feedback Cadence

- 调度器任务后运行 scheduler focused tests，目标小于 5 秒。
- worker 任务后运行 tinyshare focused tests，目标小于 10 秒。
- workflow 接入后运行 refresh/chip/validation tests 和 `npm run verify`。
</validation_architecture>

<code_examples>
## Code Examples

### Abortable child process

Node 官方 `spawn` 支持 `signal`；AbortController 触发后会终止子进程并通过 error 事件报告 AbortError。实现仍需防止 `error` 与 `close` 双重 settle。

### Line-oriented stdout

Node 官方 `readline` 提供 `line` 事件，适合持续读取非 TTY 的逐行 JSON；官方文档指出性能敏感场景优先使用 `line` 事件而不是 async iterator。

### Composed timeout

Node 20.3+ 支持 `AbortSignal.any()`，可组合调用方取消与 attempt 超时；项目目标 Node 22/24 均满足。
</code_examples>

<open_questions>
## Open Questions

1. **PM2/Next.js 退出阶段如何等待 worker 优雅关闭？**
   - 已知：worker 池可提供 `close()`，先发送 shutdown/关闭 stdin，超时后 kill。
   - 不确定：Next.js 自托管入口没有项目自定义 server bootstrap。
   - 建议：本阶段实现幂等 `close()` 和测试；通过 `process.once("beforeExit")` 做 best-effort 清理，不注册会改变 SIGTERM 默认行为的长期处理器。

2. **生产 Tushare 限频阈值是否适合默认并发 8？**
   - 已知：用户锁定默认上限 8，并要求自动降并发。
   - 建议：按 2 次连续限频减 1、8 次成功加 1 实现；Phase 9 记录实测后再调整。
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)

- https://nodejs.org/api/child_process.html — `spawn`、stdio pipes、AbortSignal、error/close 生命周期。
- https://nodejs.org/api/readline.html — `line` 事件和逐行流处理。
- https://nodejs.org/api/globals.html — `AbortSignal.any()`、AbortSignal 生命周期和监听器清理。
- 项目源码 `src/lib/tushare/*`、`src/lib/refresh/*`、`src/lib/chip/*`、`src/lib/validation/*`。

### Secondary

- 无。核心方案仅依赖 Node 官方文档和当前代码。
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Node.js request scheduling and child processes
- Ecosystem: native fetch/AbortSignal, Python JSON Lines worker
- Patterns: global runtime, bounded retries, adaptive concurrency, priority aging
- Pitfalls: duplicate schedulers, non-cancelling timeout, late writes, restart loops

**Confidence breakdown:**
- Standard stack: HIGH — Node 22/24 原生能力
- Architecture: HIGH — 与现有统一 client 接口直接匹配
- Pitfalls: HIGH — 可由确定性测试复现
- External provider limits: MEDIUM — 真实账户限额需 Phase 9 实测

**Research date:** 2026-06-26
**Valid until:** 2026-09-26
</metadata>

---

*Phase: 08-controlled-provider-concurrency*
*Research completed: 2026-06-26*
*Ready for planning: yes*
