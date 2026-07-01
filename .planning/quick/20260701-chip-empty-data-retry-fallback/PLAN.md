---
quick_id: 20260701-chip-empty-data-retry-fallback
status: planned
created: 2026-07-01
---

# Quick Task: 筹码 empty_data 短期修复

## 目标

降低官方 `cyq_chips` 对最新交易日返回空数据时造成的大面积筹码分析失败。

## 范围

- 对 `empty_data` blocked 筹码目标允许后续刷新重试。
- 当目标日无返回行时，临时回退到该股票最近已缓存的官方筹码日期。
- 不改变行情筛选规则，不引入自研官方分布估算。

## 验证

- 增加 runner 回归测试覆盖 `empty_data` 重试和最近缓存官方分布回退。
- 运行筹码相关测试、完整 verify 和 smoke。
