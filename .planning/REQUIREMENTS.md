# Requirements: A Stock Downtrend Screener

**Defined:** 2026-06-25
**Core Value:** 用户可以可靠地筛出当前价格低于最近下降区间波段高点 85% 的 A 股，并直观看到对应筹码分布。

## Milestone v2.0 Requirements

### Data Cache

- [x] **DATA-05**: 系统按股票代码和交易日唯一保存原始日线行情，不再按刷新任务复制完整 60 日行情快照。
- [x] **DATA-06**: 系统独立保存复权因子，并在筛选读取时按同一最新基准动态计算前复权价格。
- [x] **DATA-07**: 普通刷新只获取本地缓存中缺失的有效交易日行情和复权因子。
- [x] **DATA-08**: 首次升级到新缓存结构时，系统从数据源重新获取最近 60 个交易日，不把旧复权快照作为原始行情迁移。
- [x] **DATA-09**: 新缓存完成完整性验证前，系统继续保留并提供最后一份可用筛选结果。

### Refresh Workflow

- [x] **REFR-06**: 行情和筹码数据请求使用受控并发，且并发参数仅通过服务端环境变量配置。
- [x] **REFR-07**: 系统对限频、网络或临时服务错误执行有次数上限的退避重试，对配置或权限错误不做无效重试。
- [x] **REFR-08**: tinyshare provider 使用可复用的持久 Python worker，避免每个数据请求重新启动 Python 进程。
- [x] **REFR-09**: 刷新中断后，系统可以识别并跳过已完成的数据项目，继续处理缺失或失败项目。
- [x] **REFR-10**: 系统记录刷新各阶段的状态、开始时间、结束时间、总数、完成数、失败数和重试数。
- [x] **REFR-11**: 行情刷新和筛选成功后，页面立即提供新的筛选结果，不等待筹码分布处理全部完成。
- [ ] **REFR-12**: 维护者可以通过运维命令执行手动全量重建，网页不提供全量重建入口。
- [x] **REFR-13**: 当数据源没有新增交易日时，普通刷新不会重新下载已有 60 日行情。

### Chip Distribution

- [ ] **CHIP-05**: 系统为每只入选股票确定最新有效交易日和前一有效交易日，并获取这两个交易日的筹码分布。
- [ ] **CHIP-06**: 数据源支持时，系统使用一次日期区间请求获取同一股票两个目标交易日的筹码数据。
- [ ] **CHIP-07**: 系统保存两个目标交易日的全部筹码价格档位和占比，不再将前三筹码峰作为源数据。
- [ ] **CHIP-08**: 系统在单个事务内完整替换同一股票同一交易日的筹码价格档位，避免残留旧数据。
- [ ] **CHIP-09**: 系统复用已完整缓存的筹码分布，只请求缺失或失败的股票交易日。
- [ ] **CHIP-10**: 系统分别记录两个目标交易日筹码分布的成功、阻塞或失败状态及脱敏原因。

### Results Experience

- [ ] **UI-05**: 结果表格删除筹码峰字段和筹码峰排序能力。
- [x] **UI-06**: 筹码分布尚未完成或部分失败时，用户仍可查看已发布的筛选结果。
- [x] **UI-07**: 页面展示当前刷新阶段、阶段进度和失败数量。

### Charts

- [ ] **CHRT-07**: 股票详情展示最新有效交易日的完整筹码分布图。
- [ ] **CHRT-08**: 股票详情展示前一有效交易日的完整筹码分布图。
- [ ] **CHRT-09**: 两个筹码分布图分别标明实际交易日期，避免使用含糊的自然日描述。
- [ ] **CHRT-10**: 某一交易日筹码数据失败时，另一交易日的可用分布图仍能正常展示。
- [ ] **CHRT-11**: K 线图移除原有前三筹码峰标记，由两个完整筹码分布图替代。

## Future Requirements

### Performance Targets

- **PERF-01**: 根据 v2.0 实测阶段耗时、候选数量、失败率和限频情况制定可量化刷新耗时标准。

### Automation

- **AUTO-01**: 系统可以每日定时刷新数据。
- **AUTO-02**: 系统可以保留多次筛选历史并比较结果变化。

### Analysis

- **ANLY-01**: 用户可以调整交易日窗口、均线周期、斜率天数和高点比例阈值。
- **ANLY-02**: 用户可以导出筛选结果为 CSV。
- **ANLY-03**: 系统可以按需执行全市场历史行情回填。

### Infrastructure

- **INFRA-01**: 系统可以从 SQLite 迁移到 PostgreSQL。
- **INFRA-02**: 系统可以将长耗时任务迁移到外部后台队列。

## Out of Scope

| Feature | Reason |
|---------|--------|
| 本里程碑承诺具体刷新分钟数 | 先完成增量与并发架构并采集真实数据，再制定性能标准 |
| 网页配置并发参数 | 并发涉及接口额度和服务器资源，仅通过服务端环境变量管理 |
| 网页全量重建按钮 | 全量重建成本高，仅允许维护者通过运维命令执行 |
| 自动定时刷新 | 本里程碑保持手动触发，先验证新刷新机制 |
| 全市场完整历史回填 | 不是解决当前刷新性能和双日筹码展示的必要条件 |
| PostgreSQL、Redis 或外部任务队列 | 个人单实例部署可继续使用 SQLite 和进程内调度 |
| 修改下降趋势筛选算法 | v2.0 保持 v1.0 已验证的筛选口径 |
| 自研筹码分布估算 | 继续使用 Tushare `cyq_chips`，不以 OHLCV 近似替代 |
| 表格筹码峰摘要 | 用户确认删除表格筹码峰字段，仅在详情展示完整双日分布 |

## Traceability

路线图创建后填充。每项 v2.0 需求必须且只能映射到一个阶段。

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-05 | Phase 7 | Complete |
| DATA-06 | Phase 7 | Complete |
| DATA-07 | Phase 9 | Complete |
| DATA-08 | Phase 7 | Complete |
| DATA-09 | Phase 7 | Complete |
| REFR-06 | Phase 8 | Complete |
| REFR-07 | Phase 8 | Complete |
| REFR-08 | Phase 8 | Complete |
| REFR-09 | Phase 9 | Complete |
| REFR-10 | Phase 9 | Complete |
| REFR-11 | Phase 9 | Complete |
| REFR-12 | Phase 9 | Pending |
| REFR-13 | Phase 9 | Complete |
| CHIP-05 | Phase 10 | Pending |
| CHIP-06 | Phase 10 | Pending |
| CHIP-07 | Phase 10 | Pending |
| CHIP-08 | Phase 10 | Pending |
| CHIP-09 | Phase 10 | Pending |
| CHIP-10 | Phase 10 | Pending |
| UI-05 | Phase 11 | Pending |
| UI-06 | Phase 9 | Complete |
| UI-07 | Phase 9 | Complete |
| CHRT-07 | Phase 11 | Pending |
| CHRT-08 | Phase 11 | Pending |
| CHRT-09 | Phase 11 | Pending |
| CHRT-10 | Phase 11 | Pending |
| CHRT-11 | Phase 11 | Pending |

**Coverage:**
- v2.0 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after roadmap mapping*
