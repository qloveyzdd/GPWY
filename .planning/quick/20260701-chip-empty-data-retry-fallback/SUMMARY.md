---
quick_id: 20260701-chip-empty-data-retry-fallback
status: complete
completed: 2026-07-01
commit: a7e1950
---

# Quick Task 20260701-chip-empty-data-retry-fallback Summary

## 完成内容

- `empty_data` 的 blocked 筹码目标不再被视为永久 blocked，后续普通刷新会重新请求。
- 目标交易日 `cyq_chips` 返回空行时，优先使用该股票不晚于目标日的最近已缓存官方筹码分布作为临时展示数据。
- 权限类 blocked 仍不重试，避免无意义请求。
- README 已说明短期行为：回退结果会展示实际使用的交易日。

## 验证

- `npm test -- --run tests/chip/chip-runner.test.ts tests/refresh/refresh-runner.test.ts tests/results/chart-data.test.ts`
- 待最终提交前运行完整验证。
