---
status: resolved
trigger: "开始增量刷新在 2026-06-30 盘中失败：trade_cal 返回当天开市，但 daily 当天尚未入库"
created: "2026-06-30T00:00:00.000Z"
updated: "2026-06-30T00:00:00.000Z"
---

# Debug Session: daily-not-ready-trade-date

## Symptoms

- Expected behavior: 点击“开始增量刷新”后，使用历史日线口径刷新最近 60 个已落库交易日。
- Actual behavior: bootstrap 取 `trade_cal` 最新开市日 `20260630` 后，`daily(trade_date=20260630)` 返回空数据，刷新失败。
- Error messages: `empty_data:daily` 被上层脱敏为 `unknown:refresh`。
- Timeline: 2026-06-30 盘中复现；`20260629` 及更早日期 `daily` 正常。
- Reproduction: `trade_cal` 返回 `20260630` 为开市日；调用 `daily(trade_date=20260630)` 返回 empty data。

## Current Focus

- hypothesis: `fetchTargetTradeDates()` 只相信交易日历，没有验证历史日线是否已经落库。
- test: 增加回归测试，交易日历返回最新日期但该日期 `daily` 为空时，应跳过并向前补足目标交易日数量。
- expecting: 目标日期不包含 `daily` 空数据日期，bootstrap 不因当日未落库失败。
- next_action: resolved
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-06-30T00:00:00.000Z
  observation: `trade_cal` 返回 `20260630` 开市，`daily(20260630)` empty，`adj_factor(20260630)` 正常。
- timestamp: 2026-06-30T00:00:00.000Z
  observation: `daily(20260629)`, `daily(20260626)`, `daily(20260625)`, `daily(20260624)` 均正常。

## Eliminated

- hypothesis: 当前 token 无法调用日线接口
  reason: 多个历史交易日 `daily` 已实测正常。
- hypothesis: 应直接切换到实时日线接口
  reason: `rt_k` 当前 token 权限不足，且短期目标仍是历史日线筛选口径。

## Resolution

- root_cause: `fetchTargetTradeDates()` 只按 `trade_cal` 选择最近交易日，未验证历史日线 `daily` 是否已落库；盘中 `20260630` 已开市但 `daily` 为空，导致 bootstrap 失败。
- fix: 日期选择器从候选交易日窗口顶部开始探测 `daily`；遇到 `empty_data` 则跳过该日期，找到第一个日线可用日期后向前补足目标窗口。增量路径传入已成功日线日期，避免完整缓存场景重复拉取 daily。
- verification: 定向测试通过；真实 tinyshare 日期选择返回 `20260629,20260626,20260625,20260624,20260623`，跳过 `20260630`；真实 tinyshare 小型 bootstrap 通过。
- files_changed: `src/lib/refresh/fetch-refresh-data.ts`, `src/lib/refresh/incremental-market-data.ts`, `tests/refresh/fetch-refresh-data.test.ts`
