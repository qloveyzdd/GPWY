---
status: resolved
trigger: "开始增量刷新失败：bootstrap 阶段 stock_basic(P) 返回空数据导致整个刷新失败"
created: "2026-06-30T00:00:00.000Z"
updated: "2026-06-30T00:00:00.000Z"
---

# Debug Session: incremental-refresh-stock-basic-empty

## Symptoms

- Expected behavior: 点击“开始增量刷新”后，初始化/增量刷新应能继续执行；当前在市股票数据是核心输入。
- Actual behavior: 刷新任务失败，`refresh_jobs.error_summary` 为 `empty_data:stock_basic`。
- Error messages: `empty_data:stock_basic:Tushare 接口返回空数据。请检查查询参数、交易日或账户权限。`
- Timeline: 2026-06-30 复现；此前已有成功普通刷新记录，但当前没有 active market generation，按钮触发 bootstrap。
- Reproduction: 使用 tinyshare provider 点击页面“开始增量刷新”；或分别调用 `stock_basic` 的 `L/P/D`，其中 `P` 返回空。

## Current Focus

- hypothesis: bootstrap 并发拉取 `stock_basic(L/P/D)`，其中 `P` 空返回被通用 client 当成错误，导致整个股票列表阶段失败。
- test: 为 `fetchMarketStocks()` 增加回归测试，模拟 `P` 空数据但 `L/D` 正常。
- expecting: `fetchMarketStocks()` 返回 `L + D` 股票，不因 `P` 空数据失败。
- next_action: resolved
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-06-30T00:00:00.000Z
  observation: `.data/refresh.sqlite` 最近两次 manual_refresh 均失败于 bootstrap，错误为 `empty_data:stock_basic`。
- timestamp: 2026-06-30T00:00:00.000Z
  observation: tinyshare 实测 `stock_basic(L)` 返回 5530 行，`stock_basic(P)` 返回 empty_data，`stock_basic(D)` 返回 329 行。

## Eliminated

- hypothesis: tinyshare provider 整体不可用
  reason: `stock_basic(L)`, `daily`, `adj_factor`, `cyq_chips`, `cyq_perf` 均已实测成功。

## Resolution

- root_cause: `fetchMarketStocks()` treated every `stock_basic` empty response as fatal. tinyshare currently returns empty data for `list_status=P`, so bootstrap failed before market cache initialization.
- fix: Only require `stock_basic(L)` to return data. For optional `P/D` statuses, `empty_data` is treated as an empty list; permission/network/other errors still fail.
- verification: Targeted Vitest passed; typecheck passed; lint passed; production build passed; real tinyshare `fetchMarketStocks()` returned 5859 stocks (`L=5530`, `D=329`) while skipping empty `P`.
- files_changed: `src/lib/refresh/fetch-refresh-data.ts`, `tests/refresh/fetch-refresh-data.test.ts`
