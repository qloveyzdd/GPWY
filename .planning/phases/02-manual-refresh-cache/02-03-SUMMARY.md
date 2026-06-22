---
phase: 02-manual-refresh-cache
plan: "02-03"
subsystem: refresh-data-fetching
tags: [tinyshare, tushare, stock-basic, daily-bars, sqlite-cache]
requires:
  - phase: 02-02
    provides: "Manual refresh runner, protected APIs, and status UI"
provides:
  - "Real provider-backed stock_basic fetcher"
  - "Latest 60 trading dates daily OHLCV fetcher"
  - "Default refresh worker writing stock basics and daily bars to SQLite"
  - "Latest cache statistics in refresh status"
affects: [03-downtrend-screening-engine]
tech-stack:
  added: []
  patterns: [provider-backed-refresh-worker, trade-date-backfill-loop, cache-stats-status]
key-files:
  created: []
  modified:
    - src/lib/refresh/fetch-refresh-data.ts
    - src/lib/refresh/refresh-runner.ts
    - src/lib/refresh/refresh-store.ts
    - src/lib/refresh/refresh-types.ts
    - src/lib/tushare/endpoints.ts
    - src/lib/tushare/client.ts
    - src/components/status/status-workspace.tsx
    - tests/refresh/fetch-refresh-data.test.ts
    - tests/refresh/refresh-runner.test.ts
    - tests/validation/tinyshare-provider.test.ts
key-decisions:
  - "Query `daily` by `trade_date` and skip empty dates until 60 dates with data are collected."
  - "Bound daily lookback to 180 calendar days to prevent infinite loops during provider/calendar issues."
  - "Treat missing `list_status` from tinyshare stock_basic as `L` because the request params already constrain listed stocks."
  - "Store refresh failures as safe classified summaries, not raw provider payloads."
patterns-established:
  - "Provider fetcher accepts a mockable `TushareClientLike`, keeping tests offline."
  - "Refresh status includes latest successful cache stock and daily-bar counts."
requirements-completed: [DATA-02, REFR-03, REFR-05]
duration: 12min
completed: 2026-06-23
---

# Phase 02-03: Refresh Data Fetching Summary

**Manual refresh now fetches real listed A-share basics and recent daily OHLCV bars through the configured Tushare/tinyshare provider, then writes them to SQLite.**

## Performance

- **Duration:** 约 12 分钟
- **Started:** 2026-06-23T07:36:00+08:00
- **Completed:** 2026-06-23T07:48:00+08:00
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- 扩展 `daily` endpoint 字段为 `ts_code, trade_date, open, high, low, close, vol`。
- 新增 refresh data fetcher，先获取 `stock_basic(list_status=L)`，再按日期倒序抓取有数据的 `daily` 交易日。
- 默认目标为最近 60 个有数据交易日，最大回看 180 个自然日。
- 将 refresh runner 默认 worker 从占位实现切换为真实 provider-backed worker。
- 写入 `stock_basics` 和 `daily_bars` 后再标记刷新成功。
- 刷新状态新增 latest cache stats，状态页成功文案显示缓存股票数和日线条数。
- 修正真实 tinyshare `stock_basic` 可能不返回 `list_status` 的差异，并用测试覆盖。

## Task Commits

1. **Task 1/2: Add and implement provider refresh fetcher** - `9ee5034` (`feat`)
2. **Task 3: Wire real fetcher into refresh runner** - `30fe851` (`feat`)

## Files Created/Modified

- `src/lib/refresh/fetch-refresh-data.ts` - provider-backed 股票基础信息和日线行情抓取器。
- `src/lib/refresh/refresh-runner.ts` - 默认真实 refresh worker、缺 token 安全失败、缓存写入。
- `src/lib/refresh/refresh-store.ts` - 最新成功缓存统计读取。
- `src/lib/refresh/refresh-types.ts` - refresh status cache stats 类型。
- `src/lib/tushare/endpoints.ts` - daily OHLCV 字段扩展。
- `src/lib/tushare/client.ts` - `missing_config` 错误分类。
- `src/components/status/status-workspace.tsx` - 成功刷新状态展示缓存统计。
- `tests/refresh/fetch-refresh-data.test.ts` - fetcher 行为测试。
- `tests/refresh/refresh-runner.test.ts` - provider worker 写缓存和默认缺配置失败测试。
- `tests/validation/tinyshare-provider.test.ts` - tinyshare bridge 字段期望同步。

## Decisions Made

- 日线刷新按 `trade_date` 拉全市场数据，而不是对每只股票单独拉取，减少接口调用次数。
- 空交易日不算失败，只有在 180 天内无法收满目标交易日时才失败。
- 真实 provider 差异优先通过测试固化：tinyshare 返回的 `stock_basic` 字段可能少于请求字段。

## Deviations from Plan

- Task 1 和 Task 2 合并为一个实现提交，但仍保留了先红后绿的测试流程。

## Issues Encountered

- 真实 tinyshare `stock_basic` 返回字段中缺少 `list_status`；已按请求参数语义默认记为 `L`，并新增回归测试。
- Windows 子进程输出编码导致第一次 smoke 解析失败；改用字节捕获后确认 provider 正常。

## User Setup Required

None. 当前 `.env.local` 已可用于 tinyshare provider。手动刷新会使用：

```bash
TUSHARE_PROVIDER=tinyshare
TUSHARE_TOKEN=<configured in .env.local>
REFRESH_DB_PATH=.data/refresh.sqlite
```

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests\refresh\fetch-refresh-data.test.ts` - PASS，4 个测试通过。
- `D:\NodeJS\npm.cmd run test -- --run tests\refresh\fetch-refresh-data.test.ts tests\refresh\refresh-runner.test.ts tests\refresh\refresh-store.test.ts tests\ui\status-workspace.test.tsx` - PASS，14 个测试通过。
- `D:\NodeJS\npm.cmd run verify` - PASS，11 个测试文件、36 个测试通过，生产构建通过。
- Real tinyshare smoke:
  - `stock_basic(list_status=L)` - PASS，返回 5529 行。
  - `daily(000001.SZ, 20260204-20260211)` - PASS，返回 OHLCV 字段和 6 行。

## Next Phase Readiness

Phase 3 可以直接读取：

- `readLatestStockBasics()` - 最新成功刷新中的股票代码、名称、市场和上市状态。
- `readLatestDailyBars()` - 最新成功刷新中的最近 60 个有数据交易日日线 OHLCV。
- `readRefreshStatus().latestCacheStats` - 判断缓存是否存在以及数据规模是否足够。

## Self-Check: PASSED

- Fetcher tests use mocked provider and do not call real Tushare/tinyshare。
- Full project verify passes。
- Real tinyshare smoke confirms current local token/provider path can return stock basics and OHLCV daily data。
- No token or raw secret is rendered or written to committed files。

---
*Phase: 02-manual-refresh-cache*
*Completed: 2026-06-23*
