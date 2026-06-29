---
phase: 09-incremental-refresh-workflow
plan: "09-01"
subsystem: refresh-workflow
tags: [sqlite, refresh-operation, stage-progress, incremental-cache]

requires:
  - phase: 07-standardized-market-data-cache
    provides: "Normalized active market generation and per-date manifest"
  - phase: 08-provider-scheduler
    provides: "Provider concurrency and retry policy layer"
provides:
  - "SQLite-backed refresh operation lock shared by manual refresh, chip background work, and full rebuild"
  - "Four-stage refresh progress DTO for stock list, market data, screening, and chip work"
  - "Active-generation daily/factor item-level gap planning and readiness assertion"
affects: [refresh-runner, chip-background-runner, full-rebuild-cli, status-ui]

tech-stack:
  added: []
  patterns:
    - "Operation-level lock is separate from legacy refresh job lock"
    - "Readiness checks inspect only the caller-provided target trade-date window"

key-files:
  created: []
  modified:
    - src/lib/refresh/refresh-types.ts
    - src/lib/refresh/refresh-store.ts
    - src/lib/refresh/market-data-types.ts
    - src/lib/refresh/market-data-store.ts
    - src/lib/refresh/refresh-runner.ts
    - tests/refresh/refresh-store.test.ts
    - tests/refresh/market-data-store.test.ts
    - tests/ui/status-workspace.test.tsx

key-decisions:
  - "Refresh operation state is additive and does not replace refresh_jobs, preserving existing API compatibility."
  - "readRefreshStatus now returns operation/stage snapshots and result/chip markers while keeping isRunning tied to active refresh jobs."
  - "Active-generation readiness is based on paired daily/factor success for the current target window, not full generation history."

patterns-established:
  - "Missing stage rows are rendered as fixed-order pending snapshots."
  - "Daily and factor manifest item updates preserve the paired item status."

requirements-completed: [DATA-07, REFR-09, REFR-10, UI-07]

duration: 16 min
completed: 2026-06-29
---

# Phase 09 Plan 01: Shared Refresh State Contract Summary

**刷新工作流现在有统一的 operation 运行锁、四阶段进度快照，以及 active generation 的 daily/factor 增量差集规划。**

## Performance

- **Duration:** 16 min
- **Started:** 2026-06-29T17:07:00+08:00
- **Completed:** 2026-06-29T17:23:30+08:00
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- 新增 `refresh_operations` 与 `refresh_operation_stages`，通过 `refresh_operations_one_running` 阻止普通刷新、后台筹码和全量重建并发运行。
- 新增固定四阶段状态 DTO：股票列表、行情/复权、筛选、筹码处理；缺失 stage 行读取为 `pending`。
- 新增 active generation 差集规划：按目标交易日窗口独立规划 `daily` 与 `factor` 未完成/失败项。
- 新增筛选前完整性断言，只允许当前目标窗口内 daily/factor 全部 paired success 后继续筛选。

## Task Commits

1. **Task 1/2 RED: operation 与 market work 契约测试** - `59adb8d` (`test`)
2. **Task 1/2 GREEN: operation lock、stage progress、market work planning** - `f604e4d` (`feat`)

## Files Created/Modified

- `src/lib/refresh/refresh-types.ts` - 增加 operation、stage、result/chip marker 和 active-work DTO。
- `src/lib/refresh/refresh-store.ts` - 增加 operation/stage SQLite 表、唯一运行锁和快照读取 API。
- `src/lib/refresh/market-data-types.ts` - 增加 daily/factor work item 与 work plan 类型。
- `src/lib/refresh/market-data-store.ts` - 增加 manifest ensure、单项状态更新、差集规划和 readiness assertion。
- `src/lib/refresh/refresh-runner.ts` - 将新增 operation/stage/result/chip 字段接入 `readRefreshStatus`。
- `tests/refresh/refresh-store.test.ts` - 覆盖 operation 锁、阶段顺序、duration 和失败快照。
- `tests/refresh/market-data-store.test.ts` - 覆盖 missing/failed daily/factor 独立规划与 paired status 保留。
- `tests/ui/status-workspace.test.tsx` - 为旧 UI fixture 补齐新增 DTO 默认字段，保持 typecheck。

## Decisions Made

- 保留 `refresh_jobs` 作为普通刷新 job 记录；新增 operation 层只负责跨工作流互斥和 UI 阶段状态。
- `readRefreshStatus().isRunning` 继续表示 active refresh job；新增 `hasActiveWork` 表示任意 operation 或旧 active job 正在运行。
- `assertActiveGenerationReadyForScreening` 不修改任何数据；失败时只抛出稳定错误 `active_generation_target_incomplete`。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] readRefreshStatus 必须同步新增 DTO 字段**

- **Found during:** Task 1 typecheck
- **Issue:** 计划列出了 `RefreshStatusSnapshot` 新字段，但未把 `readRefreshStatus` 和旧 UI 测试夹具列入 09-01 文件清单；全量类型检查因此失败。
- **Fix:** 在 `readRefreshStatus` 中拼接 operation/stage/result/chip 字段，并给旧 UI fixture 补 `EMPTY_REFRESH_STATUS` 默认值。
- **Files modified:** `src/lib/refresh/refresh-runner.ts`, `tests/ui/status-workspace.test.tsx`
- **Verification:** focused refresh tests、typecheck、focused lint 均通过。
- **Committed in:** `f604e4d`

---

**Total deviations:** 1 auto-fixed missing-critical issue. **Impact on plan:** 保持新增状态契约真实可用，没有扩大用户可见功能范围。

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/refresh-store.test.ts tests/refresh/market-data-store.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/refresh tests/refresh`

All focused tests, type checking, and focused lint passed.

## Self-Check: PASSED

- `refresh_operations_one_running` exists in the additive migration.
- `readRefreshOperationSnapshot()` returns four fixed stages in UI order with pending defaults.
- `RefreshStatusSnapshot` retains old fields and adds `hasActiveWork`, operation/stage snapshots, and result/chip markers.
- Active-generation planning returns only missing or failed daily/factor items for the requested target dates.

## Next Phase Readiness

Ready for 09-02 and 09-03. Both can build on the shared operation lock and active-generation work planning.

---
*Phase: 09-incremental-refresh-workflow*
*Completed: 2026-06-29*
