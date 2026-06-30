---
phase: 08-controlled-provider-concurrency
plan: "08-01"
subsystem: api
tags: [scheduler, concurrency, retry, abortsignal, tushare]
requires:
  - phase: 07-standardized-market-data-cache
    provides: 标准化行情缓存和统一 TushareClientLike 调用边界
provides:
  - 服务端 provider 并发、超时与 worker 数量配置
  - 统一有界请求调度器及优先级老化策略
  - ScheduledTushareClient 与可取消 REST 请求
affects: [08-02, 08-03, 08-04, provider-runtime, refresh, chip]
tech-stack:
  added: []
  patterns: [single retry owner, bounded adaptive concurrency, abortable provider attempts]
key-files:
  created:
    - src/lib/tushare/request-scheduler.ts
    - src/lib/tushare/scheduled-client.ts
    - tests/tushare/request-scheduler.test.ts
  modified:
    - src/lib/config.ts
    - src/lib/tushare/types.ts
    - src/lib/tushare/client.ts
key-decisions:
  - "调度器是 provider 重试、退避、动态并发和优先级的唯一政策层。"
  - "REST attempt 超时通过 AbortSignal 下传到 fetch，避免幽灵在途请求。"
requirements-completed: [REFR-06, REFR-07]
duration: 10min
completed: 2026-06-26
---

# Phase 8 Plan 01: 统一请求调度与 REST 取消 Summary

**所有 provider 请求具备统一硬并发上限、有界重试、动态降并发、优先级老化和真实 REST 取消能力**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-26T07:19:00+08:00
- **Completed:** 2026-06-26T07:29:15+08:00
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- 增加 `TUSHARE_MAX_CONCURRENCY`、`TUSHARE_REQUEST_TIMEOUT_MS` 和 `TINYSHARE_WORKER_COUNT` 的严格服务端配置边界。
- 实现全局硬上限、三次尝试、指数退避、限频降并发、成功恢复和防饥饿优先级老化。
- 通过 `ScheduledTushareClient` 统一提交请求，并将 attempt 的 `AbortSignal` 下传到 REST fetch。

## Task Commits

1. **Task 1: 定义安全运行配置和 query 调度契约** - `a56eed2`
2. **Task 2: 实现有界调度、退避、动态并发和防饥饿** - `9394dc2`
3. **Task 3: 接入 scheduled client 并让 REST 支持真实取消** - `c2239f5`

## Files Created/Modified

- `src/lib/tushare/request-scheduler.ts` - 统一队列、重试、超时、优先级和动态并发。
- `src/lib/tushare/scheduled-client.ts` - 将统一 client 查询适配到调度器。
- `src/lib/tushare/client.ts` - REST fetch 接收取消信号并安全分类 abort/timeout。
- `src/lib/config.ts` - 校验 provider 运行时配置。
- `src/lib/tushare/types.ts` - 增加 priority、signal 和 query options 契约。
- `tests/tushare/request-scheduler.test.ts` - 覆盖峰值、重试、退避、取消、恢复和公平性。

## Decisions Made

- 重试只由 scheduler 拥有；原始 provider client 每次只执行一次真实调用。
- 优先级采用 validation=300、market=200、chip=100，每等待 5 秒提升 100 并封顶 300。
- 连续两次限频降低一个有效并发槽位，连续八次成功恢复一个槽位。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

生产环境可按需覆盖三个新增环境变量；默认值为并发 `8`、超时 `60000ms`、tinyshare worker `2`。

## Next Phase Readiness

Ready for 08-02 persistent tinyshare worker pool.

## Verification

- Scheduler/config/error focused tests: 26 passed.
- TypeScript typecheck: passed.
- Scoped ESLint: passed.

## Self-Check: PASSED

---
*Phase: 08-controlled-provider-concurrency*
*Completed: 2026-06-26*
