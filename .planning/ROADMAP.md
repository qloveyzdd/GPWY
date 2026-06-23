# Roadmap: A Stock Downtrend Screener

## Overview

v1.0 先验证 Tushare 数据可得性和筹码峰口径，再建立手动刷新与缓存管线，随后实现可测试的下降趋势筛选算法，最后交付表格、图表和云端自托管能力。路线图采用 Vertical MVP 模式：每个阶段都交付一个可验证的端到端能力，避免先堆技术层后才发现核心数据不可用。

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Tushare Data Foundation** - 建立可运行网页骨架并验证 Tushare token、行情和筹码候选接口。 (completed 2026-06-23)
- [x] **Phase 2: Manual Refresh Cache** - 交付手动刷新、刷新锁、状态记录和 SQLite 数据缓存。 (completed 2026-06-23)
- [x] **Phase 3: Downtrend Screening Engine** - 实现 MA20/MA60、波段高点、85% 阈值和筛选结果持久化。 (completed 2026-06-23)
- [x] **Phase 4: Chip Peak Integration** - 从 Tushare 筹码数据提取筹码峰，并处理接口不可用阻塞状态。 (completed 2026-06-23)
- [x] **Phase 5: Results Table Experience** - 展示最新筛选结果表格、排序和失败/空结果状态。 (completed 2026-06-23)
- [ ] **Phase 6: Charts and Deployment** - 展示单只股票图表，并补齐云端自托管、安全和验证命令。

## Phase Details

### Phase 1: Tushare Data Foundation

**Goal:** 用户可以打开基础网页，服务端安全读取 Tushare token，并验证股票基础信息、行情价格口径和筹码候选接口是否可用。
**Mode:** mvp
**UI hint:** yes
**Depends on:** Nothing (first phase)
**Requirements:** CONF-01, CONF-02, CONF-03, DATA-01, DATA-03, DATA-04, CHIP-01, DEPL-02
**Success Criteria** (what must be TRUE):

  1. 用户可以访问云端网页入口并看到数据源连接状态。
  2. 系统可以在服务端读取 `TUSHARE_TOKEN`，且前端不会暴露 token。
  3. 系统可以用真实 token 获取股票基础信息样例。
  4. 系统可以明确记录行情价格口径选择。
  5. 系统可以报告筹码候选接口可用、不可用或权限不足。

**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md: Walking skeleton with Next.js scaffold, server-only config, access gate, SQLite validation snapshot, and status workspace.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md: Server-only Tushare client, stock_basic validation, market data probe, and sanitized latest-status API.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md: Chip candidate endpoint validation, price-basis decision recording, final status sections, and real-token verification.

### Phase 2: Manual Refresh Cache

**Goal:** 用户可以手动触发一次刷新，系统防重复运行并缓存股票基础信息、60 日行情、刷新状态和错误摘要。
**Mode:** mvp
**UI hint:** yes
**Depends on:** Phase 1
**Requirements:** DATA-02, REFR-01, REFR-02, REFR-03, REFR-04, REFR-05
**Success Criteria** (what must be TRUE):

  1. 用户可以点击刷新按钮启动一次刷新。
  2. 系统可以阻止并发重复刷新。
  3. 系统可以保存每次刷新任务的开始时间、结束时间、状态和错误摘要。
  4. 页面可以展示最新刷新状态和最近一次成功刷新时间。
  5. 系统可以缓存股票基础信息和最近 60 个交易日行情。

**Plans:** 3/3 plans executed

Plans:
**Wave 1**

- [x] 02-01: Define SQLite schema and data access layer for refresh/cache records

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02: Build manual refresh controller with locking and status reporting

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03: Fetch and cache stock basics plus 60-day daily bars

### Phase 3: Downtrend Screening Engine

**Goal:** 系统可以基于缓存行情计算下降趋势条件，筛出当前价不超过区间高点 85% 的股票，并保存可解释的筛选数值。
**Mode:** mvp
**UI hint:** no
**Depends on:** Phase 2
**Requirements:** SCRN-01, SCRN-02, SCRN-03, SCRN-04, SCRN-05, SCRN-06, SCRN-07, SCRN-08
**Success Criteria** (what must be TRUE):

  1. 系统可以计算 MA20 和 MA60。
  2. 系统可以判断 `MA20 < MA60` 且 MA20 最近 5 个交易日斜率为负。
  3. 系统可以识别最近 60 个交易日内最近局部波段高点，找不到时退化为 60 日最高价。
  4. 系统可以筛出当前收盘价 `<= 区间高点 * 0.85` 的股票。
  5. 算法单元测试覆盖 MA、斜率、波段高点、退化高点和阈值边界。

**Plans:** 3/3 plans executed

Plans:
**Wave 1**

- [x] 03-01: Implement moving-average and slope calculations with tests

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02: Implement swing-high and threshold logic with edge-case tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03: Persist screening results with explainable computed values

### Phase 4: Chip Peak Integration

**Goal:** 系统可以为入选股票获取 Tushare 筹码数据，提取并保存筹码峰价格；若权限或接口不可用，则明确阻塞而不使用估算替代。
**Mode:** mvp
**UI hint:** no
**Depends on:** Phase 3
**Requirements:** CHIP-02, CHIP-03, CHIP-04
**Success Criteria** (what must be TRUE):

  1. 系统可以从 Tushare 筹码分布数据中识别占比最高价格档作为筹码峰。
  2. 系统可以为每只入选股票保存筹码峰价格和提取口径。
  3. 如果账号无权访问筹码数据，系统会把筹码峰需求标记为阻塞。
  4. 系统不会使用未验证的筹码估算算法伪造筹码峰。

**Plans:** 2/2 plans executed

Plans:
**Wave 1**

- [x] 04-01: Implement chip distribution parser and peak extraction tests

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02: Integrate candidate chip fetch with blocked-state handling

### Phase 5: Results Table Experience

**Goal:** 用户可以在表格中查看最新成功筛选结果，并按关键指标排序，同时清楚区分无结果和刷新失败。
**Mode:** mvp
**UI hint:** yes
**Depends on:** Phase 4
**Requirements:** UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):

  1. 页面可以展示最新一次成功筛选出的股票列表。
  2. 表格展示股票代码、名称、当前价、区间高点、当前价/高点比例、下跌幅度和筹码峰价格。
  3. 用户可以按当前价/高点比例、下跌幅度或筹码峰价格排序。
  4. 页面可以区分无符合股票、刷新失败和数据不可用。

**Plans:** 2/2 plans complete

Plans:

**Wave 1**

- [x] 05-01: Build latest results snapshot and required-column table

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02: Add sorting plus empty/failure/data-unavailable states

### Phase 6: Charts and Deployment

**Goal:** 用户可以查看单只股票最近 60 个交易日图表，并获得可部署、可验证、token 不泄露的云端运行版本。
**Mode:** mvp
**UI hint:** yes
**Depends on:** Phase 5
**Requirements:** CHRT-01, CHRT-02, CHRT-03, CHRT-04, CHRT-05, CHRT-06, DEPL-01, DEPL-03
**Success Criteria** (what must be TRUE):

  1. 用户可以选择一只股票并查看最近 60 个交易日图表。
  2. 图表展示价格走势、MA20、MA60、区间高点、85% 阈值线和筹码峰价格。
  3. 图表上的关键数值与表格一致。
  4. 项目提供云端自托管启动方式和必要环境变量说明。
  5. 项目提供类型检查、算法单元测试和页面冒烟检查命令。

**Plans:** 2/3 plans executed

Plans:

**Wave 1**

- [x] 06-01: Close refresh-to-results workflow and chart data foundation

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02: Build inline K-line chart experience

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 06-03: Add self-host deployment docs and smoke verification

**Cross-cutting constraints:**

- CHRT-06: 图表数据必须复用持久化筛选/筹码结果中的关键数值。

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Tushare Data Foundation | 3/3 | Complete    | 2026-06-23 |
| 2. Manual Refresh Cache | 3/3 | Complete    | 2026-06-23 |
| 3. Downtrend Screening Engine | 3/3 | Complete    | 2026-06-23 |
| 4. Chip Peak Integration | 2/2 | Complete    | 2026-06-23 |
| 5. Results Table Experience | 2/2 | Complete   | 2026-06-23 |
| 6. Charts and Deployment | 2/3 | In Progress|  |
