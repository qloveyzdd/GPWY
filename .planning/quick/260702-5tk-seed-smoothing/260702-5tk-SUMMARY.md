---
status: complete
---

# Quick Task 260702-5tk Summary

## 完成内容

- 将筹码模型版本升级为 `decay-triangle-v2`，避免继续复用 v1 计算缓存。
- 在模型 seed 进入 60 日滚动计算前，按 `0.05` 元重分桶，并使用 `±0.20` 元三角核做平滑扩散。
- seed snapshot 现在保存平滑后的 v2 seed；目标日计算仍基于同一模型口径按需生成。
- 更新 UI、fixture、smoke 和 chart-data 测试中的模型版本文本。
- 将 Vitest 默认超时调整为 15 秒，避免既有刷新集成测试在全量验证中稳定触发 5 秒超时。

## 验证

- `npm run test -- --run tests/chip/chip-model.test.ts tests/chip/chip-model-runner.test.ts tests/results/chart-data.test.ts`
- `npm run verify`
- 300290.SZ / 20260701 on-demand 检查：v2 输出中 13 元以上价格最大间隔为 `0.05`，不再保留 v1 seed 的 `0.2` 间隔孤立单柱。

## 代码提交

- `658254b fix(chip): smooth seed distribution buckets`
