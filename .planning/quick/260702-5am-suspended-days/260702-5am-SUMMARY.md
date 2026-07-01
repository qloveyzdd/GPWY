---
status: complete
---

# Quick Task 260702-5am Summary

## 完成内容

- `readAdjustedChipModelBarsForStock` 增加 `expectedTradeDates`，按模型窗口补齐中间缺失交易日。
- 中间停牌日补为零换手 bar，不触发筹码衰减和新增成交分布。
- 预计算路径和详情页 on-demand 路径都传入 seed 窗口交易日，统一处理停牌日。
- 目标日缺真实 quote 仍然返回 `missing_daily_quote`，避免展示无目标交易日分布。

## 验证

- `npm run test -- --run tests/refresh/market-data-reader.test.ts tests/chip/chip-model.test.ts`
- 300290.SZ / 20260701 on-demand 计算成功
- `npm run verify`

## 代码提交

- `48f00b1 fix(chip): treat suspended days as zero turnover`
