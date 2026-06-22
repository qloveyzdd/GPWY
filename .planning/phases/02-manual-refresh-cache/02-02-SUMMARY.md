---
phase: 02-manual-refresh-cache
plan: "02-02"
subsystem: manual-refresh-controller
tags: [refresh-runner, protected-api, polling-ui, vitest]
requires:
  - phase: 02-01
    provides: "Refresh job lifecycle store and SQLite running-job lock"
provides:
  - "Manual refresh runner with injectable worker"
  - "Protected POST /api/refresh/run endpoint"
  - "Protected GET /api/refresh/status endpoint"
  - "Status workspace manual refresh button and running-state polling"
affects: [02-03, 03-downtrend-screening-engine]
tech-stack:
  added: []
  patterns: [server-side-refresh-runner, protected-refresh-api, client-polling-status]
key-files:
  created:
    - src/lib/refresh/refresh-runner.ts
    - src/app/api/refresh/run/route.ts
    - src/app/api/refresh/status/route.ts
    - tests/refresh/refresh-runner.test.ts
  modified:
    - src/lib/refresh/refresh-types.ts
    - src/app/page.tsx
    - src/components/status/status-workspace.tsx
    - tests/auth/access-gate.test.ts
    - tests/ui/status-workspace.test.tsx
key-decisions:
  - "Keep the 02-02 refresh worker injectable and placeholder-backed; real provider fetching is deferred to 02-03."
  - "Use the SQLite running-job guard from 02-01 as the source of truth for duplicate refresh prevention."
  - "Expose refresh status through a protected API and render only sanitized job summaries in the UI."
patterns-established:
  - "Manual refresh APIs check getSession() before reading or starting jobs."
  - "Client UI receives an initial server snapshot and polls only while a refresh is running."
requirements-completed: [REFR-01, REFR-02, REFR-03, REFR-04]
duration: 14min
completed: 2026-06-23
---

# Phase 02-02: Manual Refresh Controller Summary

**Protected manual refresh entry point with duplicate-job locking, status reporting, and homepage controls.**

## Performance

- **Duration:** 约 14 分钟
- **Started:** 2026-06-23T07:27:00+08:00
- **Completed:** 2026-06-23T07:36:00+08:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- 新增 refresh runner，支持启动刷新、复用已有 running job、成功完成和失败落库。
- 新增错误摘要脱敏，避免 token、header、本地路径或 secret 类字符串进入刷新状态。
- 新增受保护的 `/api/refresh/run` 与 `/api/refresh/status`。
- 首页状态工作区新增“手动刷新缓存”按钮、运行中状态、失败提示和运行中轮询。
- UI 测试覆盖空状态、刷新按钮和点击后运行中状态；刷新 runner 测试覆盖成功、重复启动和失败脱敏。

## Task Commits

1. **Task 1: Add refresh controller tests** - `25dfefc` (`test`)
2. **Task 2: Implement refresh runner and protected API routes** - `86f2aac` (`feat`)
3. **Task 3: Add manual refresh controls to status workspace** - `753306d` (`feat`)

## Files Created/Modified

- `src/lib/refresh/refresh-runner.ts` - 手动刷新控制器、状态快照读取和错误脱敏。
- `src/app/api/refresh/run/route.ts` - 受保护的刷新启动 API。
- `src/app/api/refresh/status/route.ts` - 受保护的刷新状态 API。
- `src/components/status/status-workspace.tsx` - 手动刷新按钮、刷新状态区和运行中轮询。
- `src/app/page.tsx` - 服务端读取初始刷新状态并传入首页。
- `src/lib/refresh/refresh-types.ts` - 共享刷新状态快照和空状态常量。
- `tests/refresh/refresh-runner.test.ts` - runner 行为测试。
- `tests/ui/status-workspace.test.tsx` - 状态工作区刷新控件测试。
- `tests/auth/access-gate.test.ts` - 刷新 API 未认证访问保护测试。

## Decisions Made

- 02-02 不直接接入真实 provider 拉取行情，避免把控制器与数据抓取耦合；真实抓取放在 02-03。
- 重复点击由服务端 SQLite running-job 唯一约束兜底，前端禁用按钮只是用户体验层。
- 状态页只展示任务号、计数、时间和脱敏错误摘要，不展示任何授权码或原始异常负载。

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- UI 测试新增同名按钮后暴露出历史测试未清理 DOM 的问题；已补 `cleanup()`，避免用例互相污染。

## User Setup Required

None. 当前刷新 worker 仍是占位实现，点击按钮会创建并完成一个空刷新任务；02-03 会接入真实 tinyshare/Tushare 数据抓取。

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests\refresh\refresh-runner.test.ts tests\auth\access-gate.test.ts` - PASS
- `D:\NodeJS\npm.cmd run test -- --run tests\ui\status-workspace.test.tsx` - PASS，4 个测试通过。
- `D:\NodeJS\npm.cmd run typecheck` - PASS
- `D:\NodeJS\npm.cmd run verify` - PASS，10 个测试文件、30 个测试通过，生产构建通过。

## Next Phase Readiness

02-03 可以直接复用：

- `startManualRefresh({ worker })` 注入真实 provider 抓取 worker。
- `writeStockBasics()` 和 `writeDailyBars()` 写入最新成功刷新缓存。
- `/api/refresh/run` 和状态页按钮无需改变，只需要将默认 worker 从占位实现切换为真实实现。

## Self-Check: PASSED

- Tests were added before implementation for runner behavior.
- Protected API routes reject unauthenticated requests.
- Duplicate refresh starts do not create multiple running jobs.
- Full project verify passes.

---
*Phase: 02-manual-refresh-cache*
*Completed: 2026-06-23*
