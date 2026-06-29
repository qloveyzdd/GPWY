---
phase: 10-dual-day-chip-distribution
plan: "10-04"
subsystem: refresh-workflow
tags: [refresh-runner, chip-distribution, status-ui, smoke]
requires:
  - phase: 10-02
    provides: dual-day chip distribution runner
  - phase: 10-03
    provides: distribution-backed compatibility projection
provides:
  - refresh workflow connected to chip distribution runner
  - distribution-run chipVersion marker
  - chip stage progress mapped from latest/previous target counts
  - smoke seed backed by chip_distribution tables
affects: [refresh-runner, status-workspace, smoke-seed]
tech-stack:
  added: []
  patterns: [background chip distribution workflow, compatibility alias]
key-files:
  created: []
  modified:
    - src/lib/refresh/refresh-runner.ts
    - tests/refresh/refresh-runner.test.ts
    - tests/ui/status-workspace.test.tsx
    - tests/smoke/seed-smoke-db.ts
key-decisions:
  - "刷新后台默认调用 runChipDistributionIntegrationFromLatestScreening，不再把旧 chip_peak run 作为主路径。"
  - "StartManualRefreshOptions 暂时保留 chipPeakRunner 注入别名，但类型已切到 ChipDistributionWorkflowRunner，降低测试和调用迁移成本。"
  - "chipVersion 改为来自最新 chip_distribution_runs，格式保持 id:createdAt:status。"
  - "chip 阶段 failed 计数聚合 failed + blocked + missing，避免 missing previous 被隐藏。"
patterns-established:
  - "UI stage key 继续使用 chip，label 继续使用筹码处理；Phase 10 不改 UI 合约。"
  - "Smoke seed 同时保留旧 chip_peak_* 表，但当前结果快照依赖 chip_distribution_* 数据。"
requirements-completed: [CHIP-05, CHIP-09, CHIP-10]
duration: 12min
completed: 2026-06-29
---

# Phase 10 Plan 10-04: Refresh Workflow Integration Summary

刷新主流程已接入双日完整筹码分布 runner；结果快照和 smoke 数据现在通过 `chip_distribution_*` 表派生旧筹码峰字段。

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-29T23:42:15+08:00
- **Completed:** 2026-06-29T23:54:58+08:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `refresh-runner` 默认后台筹码处理从旧 `runChipPeakIntegrationFromLatestScreening()` 切换为 `runChipDistributionIntegrationFromLatestScreening()`。
- 新增 `ChipDistributionWorkflowRunner` 类型；保留 `chipPeakRunner` 作为兼容注入别名，同时新增 `chipDistributionRunner`。
- `readRefreshStatus().chipVersion` 改为读取最新 `chip_distribution_runs`。
- chip 阶段进度改为使用 `totalTargets/completedTargets`，失败计数聚合 `failed + blocked + missing`。
- smoke seed 新增 `chip_distribution_runs`、`chip_distribution_statuses`、`chip_distribution_levels`，并覆盖 latest/previous 两类目标。
- UI 测试中的 chipVersion fixture 更新为分布 run 版本格式。

## Task Commits

1. **Task 1-3: refresh integration, status fixtures, smoke distribution seed** - `575e57d` (feat)
2. **Verification blocker: decouple tinyshare startup timeout from request timeout** - `0cdae77` (test)

## Files Created/Modified

- `src/lib/refresh/refresh-runner.ts` - 切换默认筹码后台 runner、映射分布进度和 chipVersion。
- `tests/refresh/refresh-runner.test.ts` - 更新 runner fixture，并覆盖 missing 计入 chip 阶段失败数。
- `tests/ui/status-workspace.test.tsx` - 同步 distribution run chipVersion 示例。
- `tests/smoke/seed-smoke-db.ts` - 新增完整分布表和双日状态/分布种子数据。

## Decisions Made

- 旧 `chipPeakRunner` option 暂不删除，只作为 `ChipDistributionWorkflowRunner` 的兼容别名，避免扩大调用面改动。
- `chipStageStatus()` 对 `blocked` 分布 run 仍映射为 `failed` 阶段状态；这是运行失败/阻断在刷新状态层的保守表达。
- smoke seed 保留旧 peak 表，仅用于历史兼容；当前结果展示依赖 distribution 兼容投影。

## Deviations from Plan

全量 `verify` 首次被 `tests/validation/tinyshare-provider.test.ts` 中一个稳定失败阻断：测试把请求超时设为 40ms，但实现也用同一值作为 worker 启动超时，当前环境下重建 worker 启动超过 40ms，导致重启预算被耗尽。

已用独立提交 `0cdae77` 增加 `startupTimeoutMs`，默认仍等于 `timeoutMs`，仅在该测试中放宽启动超时。该修复不改变 Phase 10 业务逻辑。

---

**Total deviations:** 1 auto-fixed.
**Impact on plan:** 无业务范围变化；用于恢复全量验证可靠性。

## Issues Encountered

- Tinyshare worker timeout 测试存在启动超时和请求超时耦合问题；已修复并单独提交。

## User Setup Required

None.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-distribution-store.test.ts tests/chip/chip-runner.test.ts tests/results/results-snapshot.test.ts tests/results/chart-data.test.ts tests/refresh/refresh-runner.test.ts tests/ui/status-workspace.test.tsx` — passed, 45 tests.
- `D:\NodeJS\npm.cmd run typecheck` — passed.
- `D:\NodeJS\npm.cmd run lint -- src/lib/refresh tests/refresh tests/ui tests/smoke` — passed.
- `D:\NodeJS\npm.cmd run test -- --run tests/validation/tinyshare-provider.test.ts` — passed, 12 tests.
- `D:\NodeJS\npm.cmd run verify` — passed, 30 test files / 173 tests and production build.
- `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` — passed, 1 Playwright smoke test.
- `rg "runChipPeakIntegrationFromLatestScreening|readLatestChipPeakRun|readChipPeakResultsForRun" src/lib/results src/lib/refresh -n` — no matches.

## Next Phase Readiness

Phase 10 backend refresh and compatibility projection are complete. Phase 11 can consume the cached latest/previous full distributions to build two distribution charts.

---
*Phase: 10-dual-day-chip-distribution*
*Completed: 2026-06-29*
