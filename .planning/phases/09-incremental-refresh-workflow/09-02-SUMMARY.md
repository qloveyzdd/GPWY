---
phase: 09-incremental-refresh-workflow
plan: "09-02"
subsystem: refresh-workflow
tags: [incremental-refresh, active-generation, screening, chip-background]

requires:
  - phase: 09-incremental-refresh-workflow
    plan: "09-01"
    provides: "Operation lock, stage progress, and active-generation gap planning"
provides:
  - "Ordinary refresh that fetches only missing or failed daily/factor items"
  - "Screening publication boundary before chip processing"
  - "Automatic background chip operation with progress reporting"
  - "Target-window filtering for adjusted market data reads"
affects: [refresh-ui, results-snapshot, chip-stage, full-rebuild-lock]

tech-stack:
  added: []
  patterns:
    - "Manual refresh succeeds after market data and screening; chip runs as a separate operation"
    - "Provider retry and priority remain delegated to the existing Tushare client/scheduler"

key-files:
  created:
    - src/lib/refresh/incremental-market-data.ts
  modified:
    - src/lib/refresh/refresh-runner.ts
    - src/lib/refresh/market-data-reader.ts
    - src/lib/screening/screening-runner.ts
    - src/lib/chip/chip-runner.ts
    - tests/refresh/refresh-runner.test.ts
    - tests/refresh/market-data-reader.test.ts
    - tests/chip/chip-runner.test.ts

key-decisions:
  - "Active generation ordinary refresh still calls stock_basic and trade_cal to determine the current target window, but skips daily/factor when the target window is already paired-success."
  - "Chip background work owns the same operation lock, so new manual refreshes are rejected until chip work reaches a terminal state."
  - "Chip progress callback failures are swallowed because progress reporting must not alter row-level chip results."

patterns-established:
  - "Screening runner accepts an optional targetTradeDates window and remains backward-compatible for legacy callers."
  - "readAdjustedMarketData filters by explicit target window when supplied; otherwise it keeps the previous latest-60 behavior."

requirements-completed: [DATA-07, REFR-09, REFR-10, REFR-11, REFR-13, UI-06]

duration: 18 min
completed: 2026-06-29
---

# Phase 09 Plan 02: Incremental Refresh and Background Chip Summary

**普通刷新现在只补 active generation 缺失/失败的 daily 或 factor 项，筛选发布后立即成功，筹码处理转入后台 operation。**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-29T17:23:30+08:00
- **Completed:** 2026-06-29T17:41:18+08:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- 新增 `refreshActiveMarketGeneration`，按 target 60 交易日规划 item-level work，并只请求缺失或 failed 的 `daily` / `adj_factor`。
- `startManualRefresh` 接入 operation 锁：manual refresh、chip background、full rebuild 共用互斥运行边界。
- `finishRefreshJob` 改为 market data + screening 成功后立即 `completeRefreshJob`，不等待 chip。
- chip runner 支持 `onProgress`；后台 chip operation 更新 `筹码处理` stage，失败或 partial 不回滚已成功 refresh job。
- `readAdjustedMarketData` 支持显式 `tradeDates`，active generation 有额外历史时筛选只读取当前目标窗口。

## Task Commits

1. **Task 1-3: Incremental refresh, screening boundary, background chip** - `c9e19a8` (`feat`)

## Files Created/Modified

- `src/lib/refresh/incremental-market-data.ts` - Active generation 增量补齐 worker。
- `src/lib/refresh/refresh-runner.ts` - Operation 锁、screening 成功边界、后台 chip orchestration。
- `src/lib/refresh/market-data-reader.ts` - 支持 `tradeDates` 过滤并避免历史日期混入当前窗口。
- `src/lib/screening/screening-runner.ts` - 传递 target trade-date window。
- `src/lib/chip/chip-runner.ts` - 增加 progress callback 并隔离 callback 异常。
- `tests/refresh/refresh-runner.test.ts` - 覆盖 no-new-date、factor-only 续跑、部分失败保留旧筛选、后台 chip 锁。
- `tests/refresh/market-data-reader.test.ts` - 覆盖 active generation 额外历史日期过滤。
- `tests/chip/chip-runner.test.ts` - 覆盖 progress callback 与 row-level 结果隔离。

## Decisions Made

- `isRunning` 继续只表示 refresh job；UI 应使用 `hasActiveWork` 判断是否还有 chip/full rebuild 等后台阶段。
- 增量 worker 不实现私有重试；所有 provider 请求仍通过已有 `TushareClientLike` 和 Phase 8 scheduler。
- 部分 market item 失败时不运行 screening，不覆盖旧筛选结果；成功 item 保留为 `succeeded`，失败 item 标记为 `failed` 供下次续跑。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Progress callback 初版传出可变对象，测试发现初始进度被后续 mutation 污染；已改为每次传递快照对象。

## User Setup Required

None - existing `TUSHARE_TOKEN` configuration is reused.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/refresh-runner.test.ts tests/refresh/market-data-reader.test.ts tests/chip/chip-runner.test.ts tests/screening/screening-runner.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/refresh src/lib/chip tests/refresh tests/chip`

All 24 focused tests, type checking, and focused lint passed.

## Self-Check: PASSED

- 完整 target window 时 daily/adj_factor 请求次数为 0。
- factor failed 续跑时 daily 请求次数为 0、adj_factor 请求次数为 1。
- market item 部分失败时不会写入新 screening run，且 stage errorSummary 脱敏。
- refresh job 在 screening 成功后 succeeded；chip background 可继续 running 并阻塞新 manual refresh。

## Next Phase Readiness

Ready for 09-03 full rebuild CLI. It can reuse the shared operation lock and stage snapshot contract.

---
*Phase: 09-incremental-refresh-workflow*
*Completed: 2026-06-29*
