# Roadmap: A Stock Downtrend Screener

## Milestones

- [x] **v1.0 MVP** — Phases 1-6，37/37 需求完成，2026-06-24 发布。归档：[路线图](./milestones/v1.0-ROADMAP.md) · [需求](./milestones/v1.0-REQUIREMENTS.md) · [审计](./milestones/v1.0-MILESTONE-AUDIT.md)
- [x] **v2.0 增量刷新与筹码分布对比** — Phases 7-11，27/27 需求完成，2026-06-30 发布。归档：[路线图](./milestones/v2.0-ROADMAP.md) · [需求](./milestones/v2.0-REQUIREMENTS.md) · [审计](./milestones/v2.0-MILESTONE-AUDIT.md)
- [ ] **v2.1 衰减筹码分布模型** — Phase 12，13 项需求。

## Phases

### Phase 12: Decay-Based Chip Distribution Model

**Goal:** 以 60 个交易日前的官方筹码分布为种子，按后续交易数据和可选衰减系数推演目标日筹码分布，并在详情页可解释地展示计算结果。
**Mode:** standard
**UI hint:** yes
**Depends on:** Phase 11
**Requirements:** DATA-10, DATA-11, DATA-12, CMOD-01, CMOD-02, CMOD-03, CMOD-04, CMOD-05, UI-08, UI-09, UI-10, VAL-01, VAL-02

**Success Criteria:**

1. 指定股票和目标交易日时，系统能定位并缓存 60 个交易日前的官方 `cyq_chips` 种子分布。
2. 推演过程使用种子日到目标日之间的日线、换手率和复权因子，且官方原始分布与计算分布分开保存。
3. 用户可选择 `0.3 / 0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0` 中任一衰减系数，并复用相同股票/日期/系数组合的计算结果。
4. 股票详情页展示计算分布时明确标注目标日、种子日、衰减系数和“计算分布”口径，不与官方 `cyq_chips` 混淆。
5. 最新有效交易日和前一有效交易日都支持计算分布；任一数据缺失时，另一天或官方原始图仍可显示并说明不可用原因。

## Progress

| Milestone | Phases | Requirements | Status | Shipped |
|-----------|--------|--------------|--------|---------|
| v1.0 MVP | 1-6 | 37/37 | Shipped | 2026-06-24 |
| v2.0 增量刷新与筹码分布对比 | 7-11 | 27/27 | Shipped | 2026-06-30 |
| v2.1 衰减筹码分布模型 | 12 | 0/13 | Planned | - |
