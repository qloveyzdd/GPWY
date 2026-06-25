---
phase: 08-controlled-provider-concurrency
plan: "08-04"
subsystem: api
tags: [refresh, bootstrap, chip, concurrency, sqlite]
requires:
  - phase: 08-controlled-provider-concurrency
    plan: "08-03"
    provides: 进程级共享 scheduler 和 priority 契约
provides:
  - 受控并行的 60 日行情与复权引导
  - allSettled 后原子激活或安全清理
  - 多股票筹码并行 enrichment
affects: [09-incremental-refresh-workflow, refresh, chip]
tech-stack:
  added: []
  patterns: [workflow fan-out through scheduler, settle-before-cleanup, exact-run provenance]
key-files:
  created: []
  modified:
    - src/lib/refresh/fetch-refresh-data.ts
    - src/lib/refresh/bootstrap-market-data.ts
    - src/lib/refresh/refresh-runner.ts
    - src/lib/chip/chip-runner.ts
key-decisions:
  - "工作流只并行提交独立任务，真实启动上限和重试完全由共享 scheduler 管理。"
  - "bootstrap 必须等待全部日期任务 settle 后才能删除 building generation。"
requirements-completed: [REFR-06, REFR-07]
duration: 9min
completed: 2026-06-26
---

# Phase 8 Plan 04: 刷新与筹码受控并行 Summary

**60 日行情/复权和多股票筹码任务通过共享 scheduler 并行执行，并保留原子激活与行级失败语义**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-26T07:42:00+08:00
- **Completed:** 2026-06-26T07:50:00+08:00
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- 删除刷新工作流私有 retry count/delay，生产请求只保留 scheduler 的三次尝试预算。
- L/P/D、daily 和 adj_factor 并行提交；60 个 manifest 先落盘，全部日期 settle 后才激活或清理。
- 筹码候选按精确 screening run ID 读取，并以 chip priority 并行处理且稳定保存部分成功结果。

## Task Commits

1. **Task 1: 并行提交行情与复权任务并安全完成 bootstrap** - `f5dcaa9`
2. **Task 2: 并行提交筹码任务并保持行级结果语义** - `2eda170`

**Related documentation:** `dfcf8fe`

## Files Created/Modified

- `src/lib/refresh/fetch-refresh-data.ts` - market priority、L/P/D 并行和日期 fan-out。
- `src/lib/refresh/bootstrap-market-data.ts` - pending manifest、paired 写入和 allSettled 清理边界。
- `src/lib/refresh/refresh-runner.ts` - 删除局部 provider retry 配置。
- `src/lib/chip/chip-runner.ts` - 精确 run 读取和多候选 Promise.all。
- `tests/refresh/bootstrap-market-data.test.ts` - 峰值上限和 settle-before-cleanup 证明。
- `tests/chip/chip-runner.test.ts` - 并发、权限单次、网络三次和部分成功证明。

## Decisions Made

- daily 与 adj_factor 是两个独立 scheduler 任务，但只有两者均成功后才进行该日期的 paired SQLite 写入。
- 筹码 Promise.all 仅生成任务；每个候选的失败映射仍在单项函数内完成，避免一个失败中断整批。
- 缺少 token 时仍逐行 blocked，不向 provider 提交请求。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

Phase 8 complete. Ready for Phase 9 incremental refresh workflow.

## Verification

- Phase-focused test matrix: 53 passed.
- Full repository tests: 147 passed.
- TypeScript, ESLint and Next.js production build: passed via `npm run verify`.

## Self-Check: PASSED

---
*Phase: 08-controlled-provider-concurrency*
*Completed: 2026-06-26*
