# Phase 10: Dual-Day Chip Distribution - Research

**Researched:** 2026-06-29
**Status:** Complete

## Research Question

Phase 10 要回答的是：如何在现有 Phase 9 后台筹码阶段基础上，把“单日前三筹码峰”改造成“每只入选股票两个有效交易日的完整筹码分布缓存”，同时保持旧页面兼容并避免重复请求。

## Key Findings

### 1. Tushare `cyq_chips` 支持本阶段需要的日期区间请求

官方 `cyq_chips` 文档说明该接口用于获取 A 股每日筹码分布，输出字段包含 `ts_code`、`trade_date`、`price`、`percent`。输入参数同时支持 `ts_code`、`trade_date`、`start_date`、`end_date`；官方示例使用单只股票加 `start_date/end_date` 拉取区间数据。

Planning implication:

- Phase 10 可以优先对每只股票发起一次 `cyq_chips({ ts_code, start_date: previousTradeDate, end_date: latestTradeDate })`。
- 返回数据必须再按目标日期过滤；非目标日期不保存。
- 如果 provider 或 tinyshare 对区间语义不稳定，runner 仍应能按返回内容做日期级落库，避免整只股票失败。

Source: [Tushare `cyq_chips` official document](https://tushare.pro/wctapi/documents/294.md)

### 2. 当前代码已经有可复用的筹码映射和后台阶段，但存储模型是错的

Current assets:

- `src/lib/chip/chip-peak.ts` 的 `mapCyqChipsTable()` 已能把 Tushare rows 映射为 `{ tsCode, tradeDate, price, percent }`。
- `src/lib/chip/chip-runner.ts` 已经接入 Phase 8 scheduler，调用 `client.query(..., { priority: "chip" })`。
- `src/lib/refresh/refresh-runner.ts` 已把筹码处理拆成 `chip_background` operation，不阻塞筛选结果发布。

Current mismatch:

- `chip_peak_results` 主键是 `(chip_peak_run_id, ts_code)`，不能表达同一股票两个日期的独立状态。
- `chip_peak_levels` 限制 `peak_rank between 1 and 3`，不能保存完整价格档位。
- `results-snapshot.ts` 只按股票代码 join 最新 chip run，不能区分日期级分布。

Planning implication:

- 需要新增或替换为日期级缓存表，而不是继续扩展 `chip_peak_levels`。
- 旧 `ChipPeakResultRecord` 可以变成兼容 DTO，但事实源应是完整分布表。

### 3. 目标日期不能只靠 screening_results 表推断完整

`screening_results.latest_trade_date` 能提供最新目标日期，但不能单独提供前一有效交易日。Phase 10 的前一有效交易日必须来自筛选实际使用的同一只股票有效 K 线序列。

Available path:

- `screening_runs.source_market_generation_id` 保存了筛选来源 generation。
- `readAdjustedMarketBarsForStock(generationId, tsCode)` 能读取同 generation 下该股票有效 K 线，并按交易日排序。
- chart data 当前也通过 `sourceMarketGenerationId` 分支读取 normalized bars。

Planning implication:

- Phase 10 runner 应对每个筛选结果读取同源 bars，找到 `latestTradeDate` 在 bars 中的位置，再取前一条 bar 的 `tradeDate`。
- 如果找不到前一条，写 `missing` 日期状态；不要让整只股票失败。
- legacy screening run 没有 `sourceMarketGenerationId` 时，Phase 10 可以使用旧 refresh job daily bars 作为兼容输入，或将该情况显式标记为无法确定前一有效日；考虑到 v2.0 Phase 10 依赖 Phase 9，正常路径应以 normalized generation 为主。

### 4. 缓存复用需要一个“work planner”，不要把 run 快照当缓存

Phase 9 的 market data 已经形成 item-level work planning：只补缺失或 failed 项，跳过 succeeded 项。Phase 10 应复制这个模式到筹码缓存：

- target item = `{ screeningRunId, tsCode, tradeDate, targetKind }` 或更稳定的 `{ tsCode, tradeDate }` 加最新 screening 目标映射。
- `succeeded + count(levels) > 0` 是完整缓存。
- `failed` 下次刷新自动重试。
- `blocked` 不自动重试，除非目标日期变化或维护者清理。

Planning implication:

- Store 层需要 `planChipDistributionWork(targets)` 或同等 API。
- Runner 不应在业务逻辑里手写 SQL 查询状态差集。

### 5. 旧结果兼容应通过派生层完成

Context 已锁定：完整分布是唯一源数据，旧前三筹码峰只从最新有效交易日派生。现有消费方包括：

- `readLatestResultsSnapshot()` 给表格提供 `chipPeakState`、`chipPeakPrice`、`chipPeaks`。
- `readLatestChartSnapshot()` 把 `row.chipPeaks` 传给 K 线 overlay。
- UI 测试仍覆盖结果表格和 K 线旧展示。

Planning implication:

- 不要在 Phase 10 移除 UI 旧字段；这属于 Phase 11。
- Store 或 snapshot 层需要导出“最新筛选 run 的兼容 chip peak results”。
- 如果最新日失败但前一日成功，兼容字段必须显示最新日失败/不可用。

## Recommended Implementation Shape

### Data model

Use additive tables rather than mutating old `chip_peak_*` in-place:

- `chip_distribution_runs`
  - run id, screening_run_id, status, created_at, total_targets, success_count, blocked_count, failed_count, missing_count
- `chip_distribution_statuses`
  - chip_distribution_run_id
  - screening_run_id
  - ts_code
  - target_kind: `latest` or `previous`
  - trade_date nullable
  - status: `succeeded | blocked | failed | missing`
  - error_category nullable
  - error_summary nullable
  - source nullable
  - primary key can be `(chip_distribution_run_id, ts_code, target_kind)`
- `chip_distribution_levels`
  - ts_code, trade_date, price, percent, rank/order
  - use a cache key independent from run id for reuse, e.g. primary key `(ts_code, trade_date, price)`
  - if retaining run association is needed, use a separate read mapping; do not make run id the only cache identity

The exact table shape is agent discretion, but it must support:

- date-level status
- transactionally replacing one stock-date distribution
- checking existing cache completeness without reading old run snapshots
- deriving current run status for progress UI

### Runner flow

1. Read latest screening run and matched rows.
2. Resolve two target dates per row from screening source bars.
3. Query cache state and build work list:
   - skip complete `succeeded` stock-date
   - retry `failed`
   - do not retry `blocked`
   - create `missing` for absent previous date
4. For each stock with at least one requestable date, call `cyq_chips` once with date range covering the two targets.
5. Map rows with `mapCyqChipsTable()`.
6. Group rows by target date only.
7. For each target date:
   - rows > 0: transactionally replace distribution and mark `succeeded`
   - rows = 0 or date absent: mark `blocked/empty_data`
   - provider temporary failure: mark requestable target dates `failed`
   - permission/config failure: mark requestable target dates `blocked`
8. Emit progress by target count, not only stock count.
9. Persist a distribution run summary for the latest screening run.

### Compatibility flow

1. Read latest distribution run for latest screening run.
2. For each screening row, inspect latest target only.
3. If latest target `succeeded`, sort full distribution by `percent desc`, then `price asc`, take top 3 and return old `ChipPeakResultRecord` shape.
4. If latest target failed/blocked/missing, return old unavailable state and latest-date error reason.
5. Keep current table and K-line behavior stable until Phase 11.

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Date-level cache accidentally tied to run id | Would prevent reuse across refreshes | Use `{tsCode, tradeDate}` as cache identity for distribution rows |
| Empty `cyq_chips` data treated as success | Would hide missing distribution | Require `succeeded` plus at least one level |
| Previous-date success used as latest-date peak | Misleads user about current chip state | Compatibility derivation only reads `targetKind=latest` |
| Old `chip_peak_*` tables remain in DB | Could confuse future maintainers | Mark as legacy compatibility or stop reading them once new distribution store is in place |
| Legacy screening run lacks source generation | Hard to locate previous valid bar | Prefer normalized path; if legacy support is needed, read old job daily bars or mark previous target missing with explicit reason |

## Validation Architecture

Phase 10 can be validated with existing Vitest infrastructure. The highest-value tests are store and runner tests because this phase is mostly data semantics, not visual UI.

Required automated coverage:

- `tests/chip/chip-distribution-store.test.ts`
  - writes complete stock-date distribution
  - replaces old levels in one transaction
  - plans work by skipping complete succeeded, retrying failed, not retrying blocked
  - preserves date-level statuses independently
- `tests/chip/chip-runner.test.ts`
  - resolves latest and previous dates from screening source bars
  - calls `cyq_chips` with `start_date/end_date` when two dates exist
  - handles partial date return independently
  - maps empty data to `blocked/empty_data`
  - emits target-level progress
- `tests/results/results-snapshot.test.ts`
  - derives old chip peak fields from latest-date full distribution
  - does not use previous-date success as latest chip peak
  - keeps blocked/failed/missing rows visible
- `tests/results/chart-data.test.ts`
  - continues to provide old chip overlay until Phase 11
- `tests/refresh/refresh-runner.test.ts`
  - chip stage total/failed counts reflect date-level work

Recommended commands:

- `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-distribution-store.test.ts tests/chip/chip-runner.test.ts tests/results/results-snapshot.test.ts tests/results/chart-data.test.ts tests/refresh/refresh-runner.test.ts`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/chip src/lib/results src/lib/refresh tests/chip tests/results tests/refresh`

## RESEARCH COMPLETE

Phase 10 is technically feasible without new external infrastructure. The primary design requirement is to stop treating chip data as a per-run stock-level “peak result” and model it as reusable stock-date distribution cache with a compatibility projection for the existing UI.
