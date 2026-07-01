---
status: complete
---

# Quick Task 260702-4uw Summary

## 完成内容

- 新增图表展示层价位桶聚合逻辑，按 `formatPrice(price)` 对细粒度 levels 聚合。
- 最大占比、柱状图数据和 shared scale 统一使用聚合后的可视数据。
- `mapDistributionSeries` 改为累加同价位桶 percent，避免 Map 覆盖。
- 聚合后的 percent 统一保留四位小数，避免浮点误差影响图表坐标。

## 验证

- `npm run test -- --run tests/ui/stock-kline-chart.test.tsx`
- `npm run verify`

## 代码提交

- `9015293 fix(charts): aggregate visible chip buckets`
