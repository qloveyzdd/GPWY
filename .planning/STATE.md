---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: 衰减筹码分布模型
status: executing
stopped_at: Completed 12-02-PLAN.md
last_updated: "2026-07-01T02:36:50.990Z"
last_activity: 2026-07-01
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 4
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-30)

**Core value:** 用户可以可靠地筛出当前价格低于最近下降区间波段高点 85% 的 A 股，并用可解释的筹码分布辅助研判。

**Current focus:** Phase 12 — decay-based-chip-distribution-model

## Current Position

Phase: 12 (decay-based-chip-distribution-model) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-07-01

## Performance Metrics

**Velocity:**

- Total plans completed: 36
- Average duration: 13 min
- Total execution time: 2.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Tushare Data Foundation | 3/3 | 88 min | 29 min |
| 2. Manual Refresh Cache | 3/3 | 38 min | 13 min |
| 3. Downtrend Screening Engine | 3/3 | 11 min | 4 min |
| 4. Chip Peak Integration | 2/2 | 11 min | 6 min |
| 5. Results Table Experience | 2/2 | 6 min | 3 min |
| 6. Charts and Deployment | 3/3 | 53 min | 18 min |
| 7. Standardized Market Data Cache | 4/4 | 32 min | 8 min |
| 08 | 4 | - | - |
| 09 | 4 | - | - |
| 10 | 4 | - | - |
| 11 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: 06-03 deployment smoke verification, 07-01 normalized store, 07-02 dynamic adjustment, 07-03 safe bootstrap, 07-04 compatibility UI
- Trend: stable

*Updated after each plan completion*
| Phase 06 P01 | 8 min | 4 tasks | 11 files |
| Phase 06 P02 | 10 min | 4 tasks | 6 files |
| Phase 06 P03 | 35 min | 4 tasks | 10 files |
| Phase 07 P01 | 3 min | 2 tasks | 3 files |
| Phase 07 P02 | 6 min | 2 tasks | 9 files |
| Phase 07 P03 | 11 min | 3 tasks | 10 files |
| Phase 07 P04 | 12 min | 2 tasks | 15 files |
| Phase 08 P01 | 10 min | 3 tasks | 10 files |
| Phase 08 P02 | 6 min | 2 tasks | 4 files |
| Phase 08 P03 | 5 min | 2 tasks | 8 files |
| Phase 08 P04 | 9 min | 2 tasks | 8 files |
| Phase 09 P09-01 | 16 min | 2 tasks | 8 files |
| Phase 09 P09-02 | 18 min | 3 tasks | 8 files |
| Phase 09 P09-03 | 8 min | 2 tasks | 7 files |
| Phase 09 P09-04 | 13 min | 3 tasks | 3 files |
| Phase 11 P03 | 9 min | 3 tasks | 2 files |
| Phase 11 P04 | 10 min | 3 tasks | 4 files |
| Phase 12 P12-01 | 18 min | 3 tasks | 12 files |
| Phase 12 P12-02 | 20 min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Use Vertical MVP roadmap structure.
- Use Tushare as the primary data source.
- Keep v1 personal-use, manual-refresh, table-plus-chart focused.
- Treat chip peak as blocked if official Tushare/tinyshare chip data is unavailable.
- Use `TUSHARE_PROVIDER=tinyshare` only when explicitly configured; REST remains the default provider.
- Use front-adjusted prices when `daily` plus `adj_factor` are available; otherwise record unadjusted fallback risk.
- Determine the interval high by walking backward from the latest day only while the previous day's high is strictly greater; stop otherwise.
- Keep per-phase Nyquist validation maps current; all six v1 phases are compliant as of 2026-06-24.
- Store raw daily quotes and adjustment factors separately; calculate adjusted prices at read time.
- Use controlled provider concurrency and persistent tinyshare workers instead of unbounded parallelism.
- Publish screening results before chip distribution enrichment finishes.
- Remove chip peak columns from the results table and show two full distributions in stock details.
- Configure concurrency through server environment variables; keep full rebuild as an operations command.
- Keep official `cyq_chips`, seed distributions, and calculated chip distributions separate; calculated distributions must be labeled as model output.
- [Phase 08]: 调度器是 provider 重试、退避、动态并发和优先级的唯一政策层。 — 避免工作流和客户端叠加重试，确保尝试次数及并发预算可证明。
- [Phase 08]: REST attempt 超时通过 AbortSignal 下传到 fetch。 — 终止真实网络请求，避免外层超时后仍存在幽灵在途请求。
- [Phase 08]: tinyshare worker 槽位只管理进程恢复，不在池内执行请求级重试。 — 请求尝试预算由统一 scheduler 单独拥有，避免 worker 重建与请求重试相乘。
- [Phase 08]: 全池禁用后以 tinyshare_worker_pool_unavailable 终止排队请求。 — 该错误保持非重试分类，防止永久失效池继续退避。
- [Phase 08]: 所有 createTushareClient 调用通过同一 globalThis runtime 获取共享 scheduler。 — 避免 Next.js 模块重复加载后叠加独立并发池。
- [Phase 08]: tinyshare scheduler 上限取全局并发上限和 worker 数的较小值。 — worker 物理容量计入全局预算，不形成额外并发额度。
- [Phase 08]: 工作流只并行提交独立任务，真实启动上限和重试完全由共享 scheduler 管理。 — 避免私有并发池和重试预算叠加，同时让 fan-out 真正缩短刷新耗时。
- [Phase 08]: bootstrap 等待全部日期任务 settle 后才清理 building generation。 — 防止失败清理后仍有迟到任务写入已删除 generation。

### Pending Todos

None yet.

### Blockers/Concerns

No current milestone blockers. Phase 12 still needs discussion to finalize the exact daily allocation formula and cache invalidation behavior for calculated distributions.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260624-qoq | 对齐区间高点需求文档，补齐 Phase 2 验证并重新审计 v1.0 | 2026-06-24 | e44f2cd | Verified | [260624-qoq-phase-2-v1-0](./quick/260624-qoq-phase-2-v1-0/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Performance | Quantified refresh duration target | Deferred until v2.0 measurements | v2.0 requirements |
| Automation | Daily scheduled refresh and result history | Future milestone | v2.0 requirements |
| Analysis | Configurable screening parameters, CSV export, full-history backfill | Future milestone | v2.0 requirements |
| Collaboration | Multi-user access and public-rate limiting | Future milestone | Initialization |
| Infrastructure | PostgreSQL and external background queue | Future milestone | v2.0 requirements |

## Session Continuity

Last session: 2026-07-01T02:36:50.984Z
Stopped at: Completed 12-02-PLAN.md
Resume file: None

## Operator Next Steps

- Run `$gsd-discuss-phase 12` to finalize the calculation formula and UI behavior before planning implementation.
