# Phase 05: Results Table Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-23
**Phase:** 05-results-table-experience
**Areas discussed:** Discussion scope, Default ordering, Results states

---

## Discussion Scope

| Option | Description | Selected |
|--------|-------------|----------|
| 全部讨论 | 覆盖表格放置方式、默认排序、筹码峰不可用展示和空/失败状态，规划最稳。 | |
| 只讨论核心 | 只确定表格默认排序和关键状态文案，其他交给实现时沿用现有风格。 | ✓ |
| 自定义范围 | 用户可以指定要讨论或跳过的表格体验细节。 | |

**User's choice:** 只讨论核心。
**Notes:** 非核心布局和控件细节交给实现阶段沿用现有状态工作台风格。

---

## Default Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| 当前价/区间高点比例升序 | 比例越低越靠前，也等价于下跌幅度越大越靠前。 | ✓ |
| 筹码峰价格升序 | 优先看筹码峰价格更低的股票。 | |
| 股票代码升序 | 最稳定，但不突出筛选价值。 | |

**User's choice:** 当前价/区间高点比例升序。
**Notes:** This makes the table surface the deepest drawdowns first by default.

---

## Results States

| Option | Description | Selected |
|--------|-------------|----------|
| 区分三类状态 | 无符合股票、刷新/筛选失败、筹码峰不可用分别显示。 | ✓ |
| 简化成两类状态 | 无结果、数据不可用。 | |
| 只在表格里显示空值/错误标记 | 不额外做状态说明。 | |

**User's choice:** 区分三类状态。
**Notes:** Chip peak unavailable is a row-level enrichment state, not a reason to hide a matched stock.

---

## the agent's Discretion

- Layout placement, exact labels, sorting affordance, and component factoring should follow existing app conventions.

## Deferred Ideas

- None introduced during this discussion.
