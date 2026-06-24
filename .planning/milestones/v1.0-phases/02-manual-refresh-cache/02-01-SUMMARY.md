---
phase: 02-manual-refresh-cache
plan: "02-01"
subsystem: refresh-cache-store
tags: [sqlite, better-sqlite3, refresh-jobs, cache, vitest]
requires:
  - phase: 01-03
    provides: "SQLite persistence pattern and provider/data-source validation context"
provides:
  - "Refresh job lifecycle store with running/succeeded/failed states"
  - "SQLite concurrency guard for active manual refresh jobs"
  - "Stock basic cache table scoped by refresh job"
  - "Daily OHLCV bar cache table scoped by refresh job"
affects: [02-02, 02-03, 03-downtrend-screening-engine]
tech-stack:
  added: []
  patterns: [better-sqlite3-store, job-scoped-cache-snapshot, sqlite-running-lock]
key-files:
  created:
    - src/lib/refresh/refresh-types.ts
    - src/lib/refresh/refresh-store.ts
    - tests/refresh/refresh-store.test.ts
  modified: []
key-decisions:
  - "Use REFRESH_DB_PATH with default .data/refresh.sqlite for refresh/cache persistence."
  - "Use a SQLite partial unique index on running jobs as the refresh concurrency guard."
  - "Scope stock basics and daily bars by refresh_job_id so failed runs cannot overwrite the latest successful cache."
patterns-established:
  - "Refresh store APIs return camelCase domain objects and keep snake_case column names inside the store boundary."
  - "Tests use temporary SQLite files and do not touch real provider APIs."
requirements-completed: [REFR-02, REFR-03, REFR-05]
duration: 12min
completed: 2026-06-23
---

# Phase 02-01: Refresh Cache Store Summary

**SQLite refresh job store with running-job lock, job-scoped stock basics, and job-scoped daily OHLCV cache rows.**

## Performance

- **Duration:** 约 12 分钟
- **Started:** 2026-06-23T07:19:00+08:00
- **Completed:** 2026-06-23T07:27:00+08:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- 新增 `RefreshJob`、`StockBasicRecord`、`DailyBarRecord` 等 refresh/cache 类型。
- 新增 `refresh_jobs` 表，支持 `running`、`succeeded`、`failed` 状态和刷新计数。
- 新增 partial unique index，保证同一 SQLite 数据库中同时只能有一个 running job。
- 新增 `stock_basics` 与 `daily_bars`，按 `refresh_job_id` 隔离缓存快照。
- 新增测试覆盖重复启动、成功/失败状态、失败 job 不污染最新成功缓存、OHLCV 字段读取。

## Task Commits

1. **Task 1: Add refresh store tests and types** - `fa1082f` (`test`)
2. **Task 2: Implement SQLite refresh schema and DAL** - `ee03308` (`feat`)

## Files Created/Modified

- `src/lib/refresh/refresh-types.ts` - refresh job、股票基础信息、日线行情类型。
- `src/lib/refresh/refresh-store.ts` - SQLite schema 初始化和 refresh/cache DAL。
- `tests/refresh/refresh-store.test.ts` - refresh store 行为测试。

## Decisions Made

- 不复用 validation snapshot 数据库，避免诊断状态和行情缓存耦合。
- 不用内存锁作为唯一锁；SQLite running-job 唯一索引才是并发保护边界。
- 缓存表按 job id 存快照，失败 job 写入的数据不会成为最新成功缓存。

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## User Setup Required

None. 可选环境变量：

```bash
REFRESH_DB_PATH=E:/path/to/refresh.sqlite
```

未配置时默认写入 `.data/refresh.sqlite`。

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests\refresh\refresh-store.test.ts` - PASS
- `D:\NodeJS\npm.cmd run typecheck` - PASS
- `D:\NodeJS\npm.cmd run verify` - PASS，9 个测试文件、25 个测试通过，生产构建通过。

## Next Phase Readiness

02-02 可以直接复用：
- `startRefreshJob()` 作为手动刷新入口的锁。
- `readActiveRefreshJob()` 和 `readLatestRefreshJob()` 作为状态 API 数据源。
- `completeRefreshJob()` / `failRefreshJob()` 作为 refresh runner 的收尾路径。

02-03 可以直接复用：
- `writeStockBasics()` 写入股票基础信息。
- `writeDailyBars()` 写入最近 60 个交易日 OHLCV 行情。
- `readLatestStockBasics()` / `readLatestDailyBars()` 给 Phase 3 筛选引擎读取最新成功缓存。

## Self-Check: PASSED

- Tests were added before implementation and failed for missing store.
- Store implementation makes tests pass.
- Full project verify passes.
- Code changes are scoped to `src/lib/refresh` and `tests/refresh`.

---
*Phase: 02-manual-refresh-cache*
*Completed: 2026-06-23*
