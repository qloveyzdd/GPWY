# Phase 12: Decay-Based Chip Distribution Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01T09:39:14+08:00
**Phase:** 12-Decay-Based Chip Distribution Model
**Areas discussed:** 每日新增筹码分配口径, 默认衰减系数, 计算范围

---

## 每日新增筹码分配口径

| Option | Description | Selected |
|--------|-------------|----------|
| 三角分布 | 以均价或典型价格为中心，能体现成交集中区，比均匀分布更接近常见筹码模型。 | ✓ |
| 均匀分布 | 实现最简单、可解释性强，但会把成交量摊得过平。 | |
| 成交额加权 | 最理想但需要更细粒度成交数据；若只有日线数据，容易变成伪精确。 | |

**User's choice:** `1A`
**Notes:** 锁定三角分布为默认每日新增筹码分配口径。后续 planning 可确定离散化细节，但必须保持可解释，并处于同一复权价格区间内。

---

## 默认衰减系数

| Option | Description | Selected |
|--------|-------------|----------|
| 0.5 | 前期实验中更能保留高位筹码，不会像 1.0 那样过快冲淡历史分布。 | ✓ |
| 1.0 | 直观表示按换手率完整衰减，但可能让分布过度贴近最近成交。 | |
| 不设默认 | 强迫用户选择系数，但会增加每次查看成本。 | |

**User's choice:** `2A`
**Notes:** 页面默认选中 `0.5`。固定支持集合仍为 `0.3 / 0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0`。

---

## 计算范围

| Option | Description | Selected |
|--------|-------------|----------|
| 入选股票 | 只对筛选结果计算，成本可控，符合当前详情页使用场景。 | ✓ |
| 用户点开时 | 初始刷新更快，但详情页首次打开会等待计算。 | |
| 全市场 | 数据最完整，但成本高，容易把 Phase 12 扩成历史回填工程。 | |

**User's choice:** `3A`
**Notes:** Phase 12 只对当前筛选结果中的入选股票计算模型分布。全市场回填和点开时首次计算不作为默认路径。

---

## the agent's Discretion

- 三角分布的离散化、价格步长、归一化和浮点误差处理。
- 成交均价不可用时的 fallback 规则细节。
- 计算分布缓存表结构和状态字段命名。
- UI 具体是同卡片切换还是独立计算卡片，只要来源、目标日、种子日和衰减系数标注明确。

## Deferred Ideas

- 全市场完整历史筹码回填。
- 与通达信/同花顺完全一致的闭源算法复刻。
- 自由输入任意衰减系数。
- 改变下降趋势筛选算法。
