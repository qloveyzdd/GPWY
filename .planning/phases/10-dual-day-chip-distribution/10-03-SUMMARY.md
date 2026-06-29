---
phase: 10-dual-day-chip-distribution
plan: "10-03"
subsystem: results
tags: [results-snapshot, chart-data, chip-distribution, compatibility]
requires:
  - phase: 10-01
    provides: full distribution cache and compatibility derivation primitives
provides:
  - legacy chip peak projection from latest full distribution
  - results snapshot backed by distribution runs
  - unchanged K-line overlay DTO shape
affects: [results-table, stock-kline-chart, refresh-runner]
tech-stack:
  added: []
  patterns: [compatibility projection, source-data separation]
key-files:
  created: []
  modified:
    - src/lib/chip/chip-types.ts
    - src/lib/chip/chip-store.ts
    - src/lib/results/results-snapshot.ts
    - tests/results/results-snapshot.test.ts
    - tests/results/chart-data.test.ts
key-decisions:
  - "结果快照只读取匹配 latest screening run 的 distribution run，不再读取旧 chip_peak run 作为事实源。"
  - "旧 chipPeakRunId 字段暂时保留，值为 distribution run id，以减少 UI 接口变更。"
  - "previous 成功永远不填充 latest 兼容峰。"
patterns-established:
  - "readCompatibleChipPeakResultsForDistributionRun filters targetKind=latest before deriving peaks."
  - "chart-data keeps Phase 10 overlay shape unchanged; Phase 11 owns dual-distribution chart data."
requirements-completed: [CHIP-07, CHIP-10]
duration: 6min
completed: 2026-06-29
---

# Phase 10 Plan 10-03: Distribution Compatibility Projection Summary

**结果快照和 K 线 overlay 继续暴露旧筹码峰字段，但数据源已切换到 latest 目标日完整筹码分布。**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-29T23:36:13+08:00
- **Completed:** 2026-06-29T23:42:15+08:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- 新增 `readCompatibleChipPeakResultsForDistributionRun()` 和 `readLatestCompatibleChipPeakResults()`。
- `readLatestResultsSnapshot()` 改为读取 matching distribution run，并从 latest target 完整分布派生旧前三峰。
- `ChipPeakResultStatus` 扩展 `missing`，用于表达 latest target 缺失状态。
- 更新结果快照和图表测试 fixture，旧 UI 合约保持不变。
- 增加 previous succeeded 不能冒充 latest chip peak 的回归测试。

## Task Commits

1. **Task 1-3: compatibility projection and snapshot/chart fixture switch** - `df5b752` (feat)

**Plan metadata:** this SUMMARY commit

## Files Created/Modified

- `src/lib/chip/chip-types.ts` - 兼容 DTO 状态增加 `missing`。
- `src/lib/chip/chip-store.ts` - 新增从完整分布派生旧 `ChipPeakResultRecord` 的读取函数。
- `src/lib/results/results-snapshot.ts` - 从 distribution run 读取兼容结果，不再读取旧 chip peak run。
- `tests/results/results-snapshot.test.ts` - 覆盖 latest succeeded、latest failed + previous succeeded、stale run 和序列化安全。
- `tests/results/chart-data.test.ts` - 改用完整分布 fixture 验证旧 overlay。

## Decisions Made

- 旧 `chip_peak_*` 表保留为历史兼容数据，但最新快照路径不再读取它。
- Phase 10 不新增双日分布图字段到 chart snapshot，避免提前进入 Phase 11 UI 范围。

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** 无。

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/results/results-snapshot.test.ts tests/results/chart-data.test.ts tests/ui/stock-kline-chart.test.tsx` — passed, 17 tests.
- `D:\NodeJS\npm.cmd run typecheck` — passed.
- `D:\NodeJS\npm.cmd run lint -- src/lib/results src/lib/chip tests/results tests/ui` — passed.

## Next Phase Readiness

10-04 can safely switch refresh runner from the old chip peak runner to the new distribution runner while preserving current result/chart consumers.

---
*Phase: 10-dual-day-chip-distribution*
*Completed: 2026-06-29*
