---
phase: 10-dual-day-chip-distribution
plan: "10-01"
subsystem: database
tags: [chip-distribution, sqlite, cache, tushare, cyq_chips]
requires:
  - phase: 09-incremental-refresh-workflow
    provides: background chip stage boundary and screening result source
provides:
  - stock-date full chip distribution cache schema
  - date-level chip distribution status records
  - retry work planning for succeeded/failed/blocked/missing targets
affects: [chip-runner, results-snapshot, refresh-runner, chart-data]
tech-stack:
  added: []
  patterns: [better-sqlite3 additive schema, transactionally replaced natural-key cache]
key-files:
  created:
    - tests/chip/chip-distribution-store.test.ts
  modified:
    - src/lib/chip/chip-types.ts
    - src/lib/chip/chip-peak.ts
    - src/lib/chip/chip-store.ts
    - tests/chip/chip-peak.test.ts
key-decisions:
  - "完整筹码分布以 ts_code + trade_date 作为缓存身份，独立于 run id 复用。"
  - "succeeded 只有在状态成功且至少存在一个价格档位时才视为完整缓存。"
  - "blocked/missing 不进入自动 work list，failed 和未见过目标进入自动 work list。"
patterns-established:
  - "Chip distribution source rows are stored in chip_distribution_levels; legacy chip peaks are derived compatibility data."
  - "replaceChipDistribution deletes and inserts one stock-date distribution inside one transaction."
requirements-completed: [CHIP-07, CHIP-08, CHIP-09, CHIP-10]
duration: 10min
completed: 2026-06-29
---

# Phase 10 Plan 10-01: Chip Distribution Cache Model Summary

**按股票和交易日缓存完整筹码分布，并用日期级状态驱动后续增量刷新 work planning。**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-29T23:18:13+08:00
- **Completed:** 2026-06-29T23:28:03+08:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- 新增完整筹码分布类型：target kind、日期级状态、run 统计和 work planning DTO。
- 新增 `chip_distribution_runs`、`chip_distribution_statuses`、`chip_distribution_levels`，保留旧 `chip_peak_*` 表兼容。
- 新增事务型 `replaceChipDistribution()`、状态写入、完整性判定和 `planChipDistributionWork()`。
- 保持旧前三峰排序规则，并新增从单日完整分布派生兼容峰的函数。

## Task Commits

1. **Task 1-3: full distribution model, schema, and work planning** - `e1307c0` (feat)

**Plan metadata:** this SUMMARY commit

## Files Created/Modified

- `src/lib/chip/chip-types.ts` - 新增完整分布、日期级状态和 work planning 类型。
- `src/lib/chip/chip-peak.ts` - 新增 `deriveChipPeakLevelsFromDistribution()`，旧 `extractChipPeaks()` 继续保持最新交易日兼容行为。
- `src/lib/chip/chip-store.ts` - 追加完整分布 SQLite schema、事务替换、状态读写和 work planning API。
- `tests/chip/chip-peak.test.ts` - 覆盖完整分布派生、混合日期拒绝和空分布错误。
- `tests/chip/chip-distribution-store.test.ts` - 覆盖替换、独立状态、空分布保护和 work planning。

## Decisions Made

- 使用 additive schema，不删除旧 `chip_peak_*` 表，避免 Phase 10 提前破坏既有结果表和 K 线 overlay。
- 完整缓存不只看状态；必须同时有 `succeeded` 状态和至少 1 个价格档位。
- 对外 DTO 不暴露 SQLite 路径、token、headers 或 provider 原始 payload 字段。

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

- `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-peak.test.ts tests/chip/chip-distribution-store.test.ts` — passed, 11 tests.
- `D:\NodeJS\npm.cmd run typecheck` — passed.
- `D:\NodeJS\npm.cmd run lint -- src/lib/chip tests/chip` — passed.

## Next Phase Readiness

10-02 can use `planChipDistributionWork()` and `replaceChipDistribution()` to request only missing or retryable stock-date targets.

---
*Phase: 10-dual-day-chip-distribution*
*Completed: 2026-06-29*
