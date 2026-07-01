# Requirements: A Stock Downtrend Screener

**Defined:** 2026-06-30
**Milestone:** v2.1 衰减筹码分布模型
**Core Value:** 用户可以可靠地筛出当前价格低于最近下降区间波段高点 85% 的 A 股，并用可解释的筹码分布辅助研判。

## Milestone v2.1 Requirements

### Chip Model Data

- [ ] **DATA-10**: 系统可以为指定股票和目标交易日定位 60 个交易日前的有效交易日，并获取该日官方 `cyq_chips` 完整筹码分布作为种子分布。
- [x] **DATA-11**: 系统可以获取并缓存种子日到目标日之间的日线、成交量、换手率和复权因子，保证筹码推演使用同一复权口径。
- [x] **DATA-12**: 系统将官方原始 `cyq_chips`、60 日种子分布和推演后的计算分布分开存储，不用计算结果覆盖官方数据。

### Decay-Based Chip Calculation

- [ ] **CMOD-01**: 系统以 60 日前种子筹码分布为初始状态，按后续每个交易日的交易数据逐日转换为目标日期的计算筹码分布。
- [x] **CMOD-02**: 每个交易日的旧筹码衰减和新增筹码分配必须使用可解释公式，至少纳入换手率、成交价格区间和复权调整，不使用无法追溯的纯数值增减。
- [x] **CMOD-03**: 用户可以在固定衰减系数集合中选择一个值：`0.3 / 0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0`。
- [x] **CMOD-04**: 同一股票、目标日期和衰减系数组合的计算结果可以被复用；当种子分布或交易数据缺失时，系统明确标记不可用原因。
- [ ] **CMOD-05**: 推演算法应能分别计算最新有效交易日和前一有效交易日的分布，保持 v2.0 双日对比体验。

### Results Experience

- [ ] **UI-08**: 股票详情页可以切换衰减系数，并显示对应的计算筹码分布图。
- [ ] **UI-09**: 图表必须清楚标明“计算分布”而非官方 `cyq_chips`，并展示目标日、种子日和当前衰减系数。
- [ ] **UI-10**: 当计算分布不可用时，页面保留官方原始分布或现有可用图，并单独说明计算不可用原因。

### Validation

- [x] **VAL-01**: 算法单元测试覆盖衰减系数、复权调整、缺失交易数据、缺失种子分布和双目标日期计算。
- [ ] **VAL-02**: 至少用一组已知股票和日期生成可复现对比数据，用于观察不同衰减系数对分布形态的影响。

## Out of Scope

| Feature | Reason |
|---------|--------|
| 承诺与通达信/同花顺完全一致 | 这些软件的筹码算法不是公开标准，v2.1 目标是建立可解释、可调参、可对比的内部模型 |
| 获取全市场完整历史筹码分布 | 当前需求只要求以目标日前 60 个交易日的官方分布为种子，不做全历史回放 |
| 把计算分布伪装成官方数据 | 计算分布必须独立标注，避免混淆数据源口径 |
| 自由输入任意衰减系数 | 初期只允许固定集合，降低验证矩阵和缓存复杂度 |
| 改变下降趋势筛选算法 | v2.1 聚焦筹码分布模型，不改变 MA20/MA60、负斜率和 85% 回撤筛选口径 |

## Traceability

| Requirement | Planned Phase | Status |
|-------------|---------------|--------|
| DATA-10 | Phase 12 | Planned |
| DATA-11 | Phase 12 | Planned |
| DATA-12 | Phase 12 | Planned |
| CMOD-01 | Phase 12 | Planned |
| CMOD-02 | Phase 12 | Planned |
| CMOD-03 | Phase 12 | Planned |
| CMOD-04 | Phase 12 | Planned |
| CMOD-05 | Phase 12 | Planned |
| UI-08 | Phase 12 | Planned |
| UI-09 | Phase 12 | Planned |
| UI-10 | Phase 12 | Planned |
| VAL-01 | Phase 12 | Planned |
| VAL-02 | Phase 12 | Planned |

**Coverage:**
- v2.1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-06-30*
