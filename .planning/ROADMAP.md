# Roadmap: A Stock Downtrend Screener

## Milestones

- [x] **v1.0 MVP** — Phases 1-6，37/37 需求完成，2026-06-24 发布。归档：[路线图](./milestones/v1.0-ROADMAP.md) · [需求](./milestones/v1.0-REQUIREMENTS.md) · [审计](./milestones/v1.0-MILESTONE-AUDIT.md)
- [ ] **v2.0 增量刷新与筹码分布对比** — Phases 7-11，27 项需求。

## v2.0 Overview

v2.0 先修正行情数据模型和复权口径，再建立统一的受控请求调度与持久 tinyshare provider；在此基础上交付可恢复的增量刷新、双交易日完整筹码分布和双图展示。筛选算法保持 v1.0 口径不变，具体性能标准将在新架构产生真实运行数据后制定。

## Phases

- [x] **Phase 7: Standardized Market Data Cache** — 建立原始日线与复权因子标准化缓存，并安全完成首次 60 日引导。 (completed 2026-06-26)
- [x] **Phase 8: Controlled Provider Concurrency** — 建立统一限流调度器和可复用 tinyshare worker。 (completed 2026-06-26)
- [x] **Phase 9: Incremental Refresh Workflow** — 交付可恢复的增量刷新、阶段进度和运维全量重建。 (completed 2026-06-29)
- [ ] **Phase 10: Dual-Day Chip Distribution** — 保存并增量补齐最新交易日与前一交易日的完整筹码分布。
- [ ] **Phase 11: Distribution Comparison Experience** — 删除表格筹码峰并交付两个独立筹码分布图。

## Phase Details

### Phase 7: Standardized Market Data Cache

**Goal:** 系统拥有可增量更新、复权口径正确且不会破坏现有可用结果的市场数据缓存。
**Mode:** standard
**UI hint:** no
**Depends on:** Phase 6
**Requirements:** DATA-05, DATA-06, DATA-08, DATA-09

**Success Criteria:**

1. 原始日线按股票代码和交易日唯一保存，重复写入不会产生重复记录。
2. 复权因子独立保存，最近 60 日行情可以按同一最新基准动态计算前复权价格。
3. 升级时从 provider 重新引导最近 60 个交易日，不把旧复权快照导入新原始行情表。
4. 新缓存通过交易日、股票覆盖和复权因子完整性校验后才成为筛选数据源。
5. 引导或校验失败时，页面仍能读取最后一份可用筛选结果。

### Phase 8: Controlled Provider Concurrency

**Goal:** 所有 Tushare/tinyshare 请求在明确的资源和接口额度边界内并行执行，且单项异常不会无限阻塞。
**Mode:** standard
**UI hint:** no
**Depends on:** Phase 7
**Requirements:** REFR-06, REFR-07, REFR-08

**Success Criteria:**

1. 测试能够证明峰值在途请求数永远不超过服务端环境变量配置。
2. 网络、服务和限频错误按有界退避策略重试，权限与配置错误不做无效重试。
3. tinyshare 批量刷新期间复用固定数量 Python worker，而不是每个请求启动一个进程。
4. 单项请求超时或 worker 退出时，在途项目可以失败或重新入队，刷新不会永久停滞。
5. REST 和 tinyshare provider 遵循同一调度与错误分类契约。

### Phase 9: Incremental Refresh Workflow

**Goal:** 用户可以手动运行可恢复的增量刷新，并在筛选完成后立即看到结果和可解释的阶段进度。
**Mode:** standard
**UI hint:** yes
**Depends on:** Phase 8
**Requirements:** DATA-07, REFR-09, REFR-10, REFR-11, REFR-12, REFR-13, UI-06, UI-07

**Success Criteria:**

1. 普通刷新只请求本地缺失的有效交易日；无新增交易日时不会重新下载已有 60 日行情。
2. 刷新中断后再次运行会跳过已完成日期并继续缺失或失败项目。
3. 页面可看到行情、筛选和筹码阶段的状态、进度与失败数量。
4. 行情和筛选完成后立即发布新筛选结果，筹码阶段可以继续后台处理或部分失败。
5. 维护者可通过运维命令执行全量重建，网页没有高成本重建入口。

**Plans:** 4/4 plans complete

Plans:

**Wave 1**
- [x] 09-01-PLAN.md — 建立阶段进度、运行锁和 active generation 增量差集基础。

**Wave 2 *(blocked on Wave 1 completion)***
- [x] 09-02-PLAN.md — 实现普通增量刷新、筛选发布边界和后台筹码阶段。
- [x] 09-03-PLAN.md — 提供运维全量重建 CLI，并保留 building generation 原子激活语义。

**Wave 3 *(blocked on Wave 2 completion)***
- [x] 09-04-PLAN.md — 在页面展示四阶段进度，并按筛选/chip marker 刷新结果。

### Phase 10: Dual-Day Chip Distribution

**Goal:** 系统可以可靠缓存每只入选股票连续两个有效交易日的完整筹码分布，并复用已成功数据。
**Mode:** standard
**UI hint:** no
**Depends on:** Phase 9
**Requirements:** CHIP-05, CHIP-06, CHIP-07, CHIP-08, CHIP-09, CHIP-10

**Success Criteria:**

1. 每只入选股票的目标日期来自最新有效日线及其前一条有效日线，不按自然日前一天推断。
2. provider 支持时，一个日期区间请求可以返回并保存两个目标交易日的数据。
3. 每个目标日期保存全部价格档位和占比，不受旧的前三筹码峰限制。
4. 同一股票同一日期的价格档位在事务内完整替换，不会残留旧分布。
5. 已完整缓存的日期被跳过，缺失或失败日期可单独重试并保留独立状态和脱敏原因。

### Phase 11: Distribution Comparison Experience

**Goal:** 用户可以在不依赖表格筹码峰的情况下，对比股票最新和前一有效交易日的完整筹码分布。
**Mode:** standard
**UI hint:** yes
**Depends on:** Phase 10
**Requirements:** UI-05, CHRT-07, CHRT-08, CHRT-09, CHRT-10, CHRT-11

**Success Criteria:**

1. 结果表格不再显示筹码峰字段，也不再提供筹码峰排序。
2. 股票详情同时提供最新有效交易日和前一有效交易日的完整筹码分布图。
3. 两个图分别显示准确交易日期、价格档位和占比。
4. 某一天失败或阻塞时，另一天的可用图仍正常显示，并单独说明不可用原因。
5. K 线图移除前三筹码峰标记，类型检查、组件测试、生产构建和浏览器关键路径验证通过。

## Progress

**Execution Order:** Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11

| Phase | Requirements | Status | Completed |
|-------|--------------|--------|-----------|
| 7. Standardized Market Data Cache | 4/4 | Complete    | 2026-06-26 |
| 8. Controlled Provider Concurrency | 3/3 | Complete   | 2026-06-26 |
| 9. Incremental Refresh Workflow | 4/4 | Complete   | 2026-06-29 |
| 10. Dual-Day Chip Distribution | 3/4 | In Progress|  |
| 11. Distribution Comparison Experience | 6 | Not started | — |

**Coverage:** 27/27 v2.0 requirements mapped exactly once.
