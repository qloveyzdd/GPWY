---
phase: 08-controlled-provider-concurrency
plan: "08-02"
subsystem: api
tags: [tinyshare, python, worker-pool, json-lines, child-process]
requires:
  - phase: 08-controlled-provider-concurrency
    plan: "08-01"
    provides: 统一 scheduler、AbortSignal 和错误分类契约
provides:
  - tinyshare 持久 JSON Lines bridge
  - 固定槽位 Python worker 池
  - 超时、退出、协议错误和预算耗尽的有界恢复
affects: [08-03, provider-runtime, tinyshare]
tech-stack:
  added: []
  patterns: [persistent child workers, request-id protocol, bounded slot recovery]
key-files:
  created:
    - tests/fixtures/tinyshare-persistent-worker.mjs
  modified:
    - scripts/tinyshare_bridge.py
    - src/lib/tushare/tinyshare-client.ts
    - tests/validation/tinyshare-provider.test.ts
key-decisions:
  - "tinyshare worker 槽位只管理进程恢复，不在池内执行请求级重试。"
  - "连续三次 worker 故障禁用槽位；全池禁用后使用非重试错误终止排队请求。"
requirements-completed: [REFR-08, REFR-07]
duration: 6min
completed: 2026-06-26
---

# Phase 8 Plan 02: 持久 tinyshare Worker 池 Summary

**tinyshare 查询复用固定 Python 进程，并在超时、退出、畸形协议和重建预算耗尽时确定结束**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-26T07:30:00+08:00
- **Completed:** 2026-06-26T07:36:18+08:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Python bridge 改为 `init/ready/query/result/shutdown` JSON Lines 协议，单进程只初始化一次 tinyshare API。
- Node 客户端改为固定槽位池，单槽串行、槽位间并行，并复用 worker PID。
- 超时、进程退出、畸形响应触发 worker 终止与有限重建；全池失效时所有 Promise 明确 reject。

## Task Commits

1. **Task 1: 将 Python bridge 改为持久 JSON Lines worker** - `b90ad89`
2. **Task 2: 实现固定槽位 worker 池和有限恢复** - `6d4b0ee`

## Files Created/Modified

- `scripts/tinyshare_bridge.py` - 持久 tinyshare 初始化和逐行查询协议。
- `src/lib/tushare/tinyshare-client.ts` - 固定 worker 槽位、FIFO 分配、超时终止和有界恢复。
- `tests/fixtures/tinyshare-persistent-worker.mjs` - 可控 PID、延迟、退出和畸形响应测试 worker。
- `tests/validation/tinyshare-provider.test.ts` - worker 进程级集成测试。

## Decisions Made

- worker 故障映射为 `network_or_service`，由 scheduler 统一决定是否重试。
- `tinyshare_worker_pool_unavailable` 保持 `unknown` 分类，避免永久失效池继续退避。
- token 仅通过 worker stdin 的 init 消息发送，不放入 argv 或错误文本。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - 沿用既有 tinyshare Python 依赖与 `PYTHON_BIN` 配置。

## Next Phase Readiness

Ready for 08-03 process-global provider runtime.

## Verification

- tinyshare provider integration tests: 10 passed.
- TypeScript typecheck: passed.
- Scoped ESLint: passed.

## Self-Check: PASSED

---
*Phase: 08-controlled-provider-concurrency*
*Completed: 2026-06-26*
