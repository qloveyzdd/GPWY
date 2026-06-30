---
phase: 08-controlled-provider-concurrency
plan: "08-03"
subsystem: api
tags: [globalthis, provider-runtime, scheduler, validation, priority]
requires:
  - phase: 08-controlled-provider-concurrency
    plan: "08-01"
    provides: 统一 scheduler 和 scheduled client
  - phase: 08-controlled-provider-concurrency
    plan: "08-02"
    provides: 可关闭的持久 tinyshare worker 池
provides:
  - 进程级 provider runtime 单例
  - 同 token/config tinyshare pool 复用
  - validation 最高优先级接入
affects: [08-04, refresh, chip, validation]
tech-stack:
  added: []
  patterns: [globalThis runtime registry, token-bound raw client reuse, internal priority metadata]
key-files:
  created:
    - src/lib/tushare/provider-runtime.ts
    - tests/tushare/provider-runtime.test.ts
  modified:
    - src/lib/tushare/provider.ts
    - src/lib/validation/run-basic-validation.ts
    - src/lib/validation/chip-and-price-validation.ts
key-decisions:
  - "所有 createTushareClient 调用通过同一 globalThis runtime 获取共享 scheduler。"
  - "tinyshare scheduler 上限取全局并发上限和 worker 数的较小值。"
requirements-completed: [REFR-06, REFR-07, REFR-08]
duration: 5min
completed: 2026-06-26
---

# Phase 8 Plan 03: 进程级 Provider Runtime Summary

**REST 与 tinyshare 生产客户端共享进程级 scheduler，tinyshare 复用池，数据源验证使用最高优先级**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-26T07:37:00+08:00
- **Completed:** 2026-06-26T07:41:32+08:00
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- 新增 `globalThis` provider runtime，阻止 Next.js 模块重复加载叠加独立并发池。
- `createTushareClient` 统一返回 scheduled client；同 token tinyshare 调用复用同一 worker 池。
- stock、daily、factor 与两个筹码验证接口全部显式使用 validation priority。

## Task Commits

1. **Task 1: 建立 globalThis provider runtime 和唯一生产工厂** - `7cfee4d`
2. **Task 2: 将数据源验证请求标记为最高优先级** - `cce8a9f`

## Files Created/Modified

- `src/lib/tushare/provider-runtime.ts` - runtime 注册、scheduler、raw client 生命周期和安全快照。
- `src/lib/tushare/provider.ts` - 唯一生产客户端工厂。
- `src/lib/validation/run-basic-validation.ts` - stock/daily validation priority。
- `src/lib/validation/chip-and-price-validation.ts` - factor/chip validation priority。
- `tests/tushare/provider-runtime.test.ts` - 单例、容量、池复用、关闭和公平性测试。

## Decisions Made

- 运行时配置发生变化时拒绝在同一进程创建第二套 runtime，避免并发预算分裂。
- runtime 快照仅暴露 provider、worker 数和 scheduler 计数，不包含 token 或路径。
- beforeExit 只做 best-effort 关闭，不注册改变 SIGTERM 默认行为的处理器。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

Ready for 08-04 refresh and chip workflow fan-out.

## Verification

- Runtime/validation/tinyshare focused tests: 20 passed.
- TypeScript typecheck: passed.
- Scoped ESLint: passed.

## Self-Check: PASSED

---
*Phase: 08-controlled-provider-concurrency*
*Completed: 2026-06-26*
