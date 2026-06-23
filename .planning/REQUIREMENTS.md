# Requirements: A Stock Downtrend Screener

**Defined:** 2026-06-23
**Core Value:** 用户可以可靠地筛出当前价格低于最近下降区间波段高点 85% 的 A 股，并直观看到对应筹码峰位置。

## User Stories

- 作为个人用户，我可以在云端网页中手动刷新 A 股数据，并看到最新一次筛选结果。
- 作为个人用户，我可以看到哪些股票满足 MA20/MA60 下降趋势和 85% 回撤条件。
- 作为个人用户，我可以在表格中快速比较股票代码、名称、当前价、区间高点、当前/高点比例、下跌幅度和筹码峰价格。
- 作为个人用户，我可以打开单只股票图表，查看价格走势、MA20、MA60、波段高点、85% 阈值线和筹码峰位置。
- 作为维护者，我可以确认 Tushare token 只在服务端使用，并能排查刷新失败原因。

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Configuration

- [x] **CONF-01**: 系统可以通过服务端环境变量读取 `TUSHARE_TOKEN`，且 token 不会进入浏览器代码、页面响应或前端日志。
- [x] **CONF-02**: 用户可以在云端服务器以自托管方式运行网页服务。
- [x] **CONF-03**: 系统提供最小个人访问保护，避免公开访问者触发刷新或查看结果。

### Tushare Data

- [x] **DATA-01**: 系统可以通过 Tushare 获取 A 股股票基础信息，至少包含股票代码和股票名称。
- [x] **DATA-02**: 系统可以获取每只候选股票最近 60 个交易日的行情数据，至少包含交易日期、开盘价、最高价、最低价、收盘价和成交量。
- [x] **DATA-03**: 系统可以明确记录行情价格口径，说明 MA20、MA60 和波段高点使用未复权、前复权或后复权中的哪一种。
- [x] **DATA-04**: 系统可以在 Tushare 接口失败、权限不足、空数据或限频时记录脱敏错误原因。

### Refresh

- [x] **REFR-01**: 用户可以在网页中手动触发一次数据刷新。
- [x] **REFR-02**: 系统可以防止同一时间重复运行多个刷新任务。
- [x] **REFR-03**: 系统可以记录每次刷新任务的开始时间、结束时间、状态、成功股票数、失败股票数和错误摘要。
- [x] **REFR-04**: 页面可以展示最新一次刷新状态和最新一次成功刷新时间。
- [ ] **REFR-05**: 系统可以缓存刷新依赖的股票基础信息、行情数据、筹码数据和筛选结果，页面默认读取缓存结果。

### Screening

- [x] **SCRN-01**: 系统可以基于最近 60 个交易日收盘价计算 MA20 和 MA60。
- [x] **SCRN-02**: 系统可以判断最新交易日是否满足 `MA20 < MA60`。
- [x] **SCRN-03**: 系统可以判断 `MA20` 最近 5 个交易日斜率是否为负。
- [x] **SCRN-04**: 系统可以在最近 60 个交易日内识别最近一个波段高点：该日最高价高于前后各 3 个交易日最高价。
- [x] **SCRN-05**: 如果最近 60 个交易日内不存在符合条件的波段高点，系统可以退化使用最近 60 日最高价作为区间高点。
- [x] **SCRN-06**: 系统可以筛选当前收盘价 `<= 区间高点 * 0.85` 的股票。
- [x] **SCRN-07**: 系统可以为每只入选股票保存当前价、区间高点、当前价/高点比例和下跌幅度。
- [x] **SCRN-08**: 筛选算法具备单元测试，覆盖 MA 计算、MA20 斜率、波段高点、退化高点和 85% 阈值边界。

### Chip Peak

- [x] **CHIP-01**: 系统可以用真实 Tushare token 验证筹码相关候选接口或字段是否可用，优先验证 `cyq_chips`、`cyq_perf` 或 Tushare 等价能力。
- [x] **CHIP-02**: 如果 Tushare 返回筹码分布数据而不是直接筹码峰字段，系统可以把占比最高的价格档识别为筹码峰价格，并记录该提取口径。
- [x] **CHIP-03**: 系统可以为每只入选股票获取并保存筹码峰价格。
- [x] **CHIP-04**: 如果 Tushare 账号无权访问筹码相关数据，系统必须把筹码峰需求标记为阻塞，并显示脱敏原因，而不是用未验证估算算法替代。

### Results Table

- [x] **UI-01**: 页面可以展示最新一次成功筛选出的股票列表。
- [x] **UI-02**: 表格至少展示股票代码、名称、当前价、区间高点、当前价/高点比例、下跌幅度和筹码峰价格。
- [x] **UI-03**: 用户可以按当前价/高点比例、下跌幅度或筹码峰价格对结果排序。
- [x] **UI-04**: 页面可以清楚区分“无符合股票”和“刷新失败/数据不可用”两种状态。

### Charts

- [ ] **CHRT-01**: 用户可以选择表格中的一只股票并查看该股票最近 60 个交易日图表。
- [ ] **CHRT-02**: 图表可以展示价格走势、MA20 和 MA60。
- [ ] **CHRT-03**: 图表可以标记用于筛选的区间高点。
- [ ] **CHRT-04**: 图表可以标记 `区间高点 * 0.85` 的阈值线。
- [ ] **CHRT-05**: 图表可以标记筹码峰价格。
- [ ] **CHRT-06**: 图表上的数值与表格中的当前价、区间高点、比例、下跌幅度和筹码峰价格一致。

### Deployment

- [ ] **DEPL-01**: 项目提供云端自托管所需的启动方式和必要环境变量说明。
- [x] **DEPL-02**: 系统在缺少 `TUSHARE_TOKEN` 或 token 无效时显示明确的服务端配置错误。
- [ ] **DEPL-03**: 项目提供基础验证命令，至少覆盖类型检查、算法单元测试和页面冒烟检查。

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Automation

- **AUTO-01**: 系统可以每日定时刷新数据。
- **AUTO-02**: 系统可以保留多次刷新历史并比较结果变化。

### Analysis

- **ANLY-01**: 用户可以调整筛选参数，例如交易日窗口、MA 周期、斜率天数和高点比例阈值。
- **ANLY-02**: 用户可以导出筛选结果为 CSV。
- **ANLY-03**: 系统可以展示更多技术指标，但不得影响 v1 核心筛选口径。

### Collaboration

- **COLL-01**: 系统支持多人账号、权限和审计。
- **COLL-02**: 系统支持公开访问下的限流和访问控制。

### Infrastructure

- **INFRA-01**: 系统可以从 SQLite 迁移到 PostgreSQL。
- **INFRA-02**: 系统可以将长耗时刷新任务拆分为后台队列。

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 自动交易或下单 | 当前目标是筛选与可视化，不做交易执行闭环 |
| 买卖建议或收益承诺 | 工具只展示数据和筛选依据，不输出投资建议 |
| 非 Tushare 主数据源 | 首版保持数据口径一致，避免多源价格和筹码数据冲突 |
| 未验证筹码峰估算算法 | 用户要求优先使用 Tushare；无官方数据时应阻塞而非伪完成 |
| 多人权限系统 | 首版仅供个人使用，避免权限模型稀释核心功能 |
| 自动每日刷新 | 用户已确认首版手动刷新，自动化放入 v2 |
| 完整移动端体验 | 首版以桌面网页研判为主，只保证基本可访问 |

## Acceptance Criteria

- Tushare token 只在服务端读取，前端 bundle 和页面响应不包含 token。
- 使用样例数据时，筛选算法测试覆盖 MA20、MA60、MA20 斜率、波段高点和 85% 阈值。
- 使用真实 Tushare token 时，系统能明确报告筹码相关接口可用、不可用或权限不足。
- 刷新完成后，页面可以展示最新成功结果；刷新失败时可以展示脱敏错误摘要。
- 表格和图表展示的关键数值一致。
- 图表必须能解释每只股票为什么入选：MA20、MA60、区间高点、85% 阈值和筹码峰都可见。

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CONF-03 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| REFR-01 | Phase 2 | Complete |
| REFR-02 | Phase 2 | Complete |
| REFR-03 | Phase 2 | Complete |
| REFR-04 | Phase 2 | Complete |
| REFR-05 | Phase 2 | Partial |
| SCRN-01 | Phase 3 | Complete |
| SCRN-02 | Phase 3 | Complete |
| SCRN-03 | Phase 3 | Complete |
| SCRN-04 | Phase 3 | Complete |
| SCRN-05 | Phase 3 | Complete |
| SCRN-06 | Phase 3 | Complete |
| SCRN-07 | Phase 3 | Complete |
| SCRN-08 | Phase 3 | Complete |
| CHIP-01 | Phase 1 | Complete |
| CHIP-02 | Phase 4 | Complete |
| CHIP-03 | Phase 4 | Complete |
| CHIP-04 | Phase 4 | Complete |
| UI-01 | Phase 5 | Complete |
| UI-02 | Phase 5 | Complete |
| UI-03 | Phase 5 | Complete |
| UI-04 | Phase 5 | Complete |
| CHRT-01 | Phase 6 | Pending |
| CHRT-02 | Phase 6 | Pending |
| CHRT-03 | Phase 6 | Pending |
| CHRT-04 | Phase 6 | Pending |
| CHRT-05 | Phase 6 | Pending |
| CHRT-06 | Phase 6 | Pending |
| DEPL-01 | Phase 6 | Pending |
| DEPL-02 | Phase 1 | Complete |
| DEPL-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-06-23*
*Last updated: 2026-06-23 after Phase 4 verification*
