---
status: resolved
trigger: "筹码处理中长时间停留且 chip stage total/completed/failed 均为 0"
created: "2026-06-30T00:00:00.000Z"
updated: "2026-06-30T00:00:00.000Z"
---

# Debug Session: stale-chip-background-operation

## Symptoms

- `refresh_operations` 存在 `chip_background` running 记录。
- `refresh_operation_stages` 的 `chip` 阶段停留在 running，但 `total_count/completed_count/failed_count` 均为 0。
- 当前服务进程启动时间晚于该 chip 阶段开始时间，说明内存中的后台 Promise 已丢失，数据库锁未释放。

## Resolution

- root_cause: 后台筹码任务在进程重启后不会继续执行，但 operation lock 仍保留 running 状态。
- fix: 在 `startRefreshOperation` 和 `readRefreshOperationSnapshot` 中回收超过 15 分钟且完全无进度的 `chip_background` 任务，标记 operation 和 chip stage 为 failed。
- guardrail: 已有进度的筹码任务不自动失败，避免把真实长任务误判为异常。
- verification:
  - `npm run test -- --run tests/refresh/refresh-store.test.ts`
  - `npm run test -- --run tests/refresh/refresh-store.test.ts tests/refresh/refresh-runner.test.ts tests/ui/status-workspace.test.tsx`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test -- --run`
  - `npm run build`
