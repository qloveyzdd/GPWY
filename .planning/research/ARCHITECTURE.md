# Architecture Research

**Domain:** A 股数据筛选与可视化网页
**Researched:** 2026-06-23
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
Browser UI
  |-- results table
  |-- stock detail chart
  |-- manual refresh action
        |
        v
Next.js server
  |-- refresh API / server action
  |-- Tushare client
  |-- screening engine
  |-- chart data API
        |
        v
SQLite cache
  |-- stocks
  |-- daily_bars
  |-- chip_distributions / chip_peaks
  |-- screening_results
  |-- refresh_runs
        |
        v
Tushare Pro API
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| UI shell | 展示刷新状态、结果表和图表 | Next.js App Router pages/components |
| Refresh controller | 接收手动刷新请求、防重复运行、记录状态 | Server action or API route |
| Tushare client | 封装 token、api_name、fields、params、错误处理 | Server-only TypeScript module |
| Data cache | 保存股票基础信息、行情、筹码数据和结果 | SQLite tables |
| Screening engine | 计算 MA、波段高点、筛选条件 | Pure TypeScript functions with unit tests |
| Chip peak extractor | 从 Tushare 筹码接口结果提取峰值价格 | Prefer `cyq_chips` max percent; validate with token |
| Chart data builder | 把行情、均线、高点、筹码峰转成图表序列 | Server-side mapper, client-side ECharts |

## Recommended Project Structure

```text
src/
  app/
    page.tsx
    api/
      refresh/route.ts
      stocks/[ts_code]/chart/route.ts
  components/
    results-table.tsx
    stock-chart.tsx
    refresh-button.tsx
  lib/
    config.ts
    db/
      connection.ts
      schema.sql
      queries.ts
    tushare/
      client.ts
      endpoints.ts
      types.ts
    screening/
      moving-average.ts
      swing-high.ts
      downtrend.ts
      chip-peak.ts
  tests/
    screening/
      moving-average.test.ts
      swing-high.test.ts
      downtrend.test.ts
      chip-peak.test.ts
```

### Structure Rationale

- **`lib/tushare/`:** 外部 API 边界集中，便于替换 SDK/REST 实现。
- **`lib/screening/`:** 筛选算法必须是纯函数，才能可靠测试。
- **`lib/db/`:** SQLite 细节隔离，避免页面直接拼 SQL。
- **`components/`:** 表格和图表是 UI 层，不混入数据拉取逻辑。

## Architectural Patterns

### Pattern 1: Server-only Tushare Client

**What:** 只在服务端读取 `TUSHARE_TOKEN` 并调用 Tushare。

**When to use:** 所有 Tushare API 请求。

**Trade-offs:** 保护 token，但 UI 必须通过本地 API 获取数据。

### Pattern 2: Cache Before Compute

**What:** 先缓存原始行情和筹码数据，再基于缓存计算筛选结果。

**When to use:** 手动刷新流程。

**Trade-offs:** 多一层存储，但便于复现筛选结果和调试接口异常。

### Pattern 3: Pure Screening Functions

**What:** MA、波段高点、下降趋势和筹码峰提取都写成输入数组、输出结果的纯函数。

**When to use:** 所有算法模块。

**Trade-offs:** 需要先定义数据结构，但测试和维护成本更低。

## Data Flow

### Refresh Flow

```text
User clicks refresh
  -> create refresh_run
  -> fetch stock_basic
  -> fetch trade calendar / latest trade dates
  -> fetch 60-day daily bars per stock or batch by trade dates
  -> cache daily bars
  -> compute MA20/MA60 and swing high
  -> filter downtrend candidates
  -> fetch chip data for candidates
  -> extract chip peak
  -> save screening_results
  -> UI shows latest run
```

### Chart Flow

```text
User selects stock
  -> chart API reads cached daily bars and chip peak
  -> build price, MA20, MA60, swing high, chip peak series
  -> ECharts renders detail chart
```

### Key Data Flows

1. **Manual refresh:** 一次性拉取和计算，结果落库。
2. **Result browsing:** 页面默认读最新一次成功刷新结果。
3. **Per-stock detail:** 只按选中股票读取图表需要的数据。

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 个人使用 | 单 Node 进程 + SQLite 足够 |
| 小团队使用 | 加登录、刷新锁、请求限流；SQLite 仍可能足够 |
| 多用户公开访问 | 改 PostgreSQL、队列、缓存层和权限模型 |

### Scaling Priorities

1. **First bottleneck:** Tushare API 额度和请求耗时；通过缓存、批量策略、刷新锁缓解。
2. **Second bottleneck:** 刷新任务超过 HTTP 超时；改为后台 job 状态轮询。
3. **Third bottleneck:** SQLite 写锁和并发访问；多人场景再迁移 PostgreSQL。

## Anti-Patterns

### Anti-Pattern 1: UI 里直接算所有股票

**What people do:** 把行情全部发到前端再计算。

**Why it's wrong:** 数据量大、token 风险高、结果不可复现。

**Do this instead:** 服务端计算，前端只拿结果和单只图表数据。

### Anti-Pattern 2: 只保存最终结果

**What people do:** 不缓存原始行情和筹码接口响应。

**Why it's wrong:** 结果无法解释，接口异常难排查。

**Do this instead:** 保存本次刷新依赖的关键输入数据。

### Anti-Pattern 3: 筹码峰接口不可用时继续估算

**What people do:** 用成交量价格区间粗略模拟筹码峰。

**Why it's wrong:** 与用户指定的 Tushare 数据口径不一致。

**Do this instead:** 明确阻塞或进入后续研究，不把估算当成 v1 完成。

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Tushare Pro API | Server-side REST POST with token and api_name | 需要处理积分/权限、频率、空数据、停牌 |
| Cloud server | Self-hosted Next.js Node process | 使用 env 配置 token，避免 serverless SQLite 限制 |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI -> refresh controller | API route/server action | 必须防重复刷新 |
| refresh controller -> Tushare client | direct call | 所有 API 参数集中记录 |
| refresh controller -> screening engine | pure function call | 输入必须按交易日排序 |
| screening engine -> DB | repository/query function | 不在算法里写数据库 |

## Sources

- https://tushare.pro/ - official Tushare Pro source
- https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/client.py - official Tushare generic API client pattern
- https://nextjs.org/docs/app/getting-started/installation - official Next.js project setup
- https://nodejs.org/en/about/previous-releases - Node.js LTS lifecycle

---
*Architecture research for: A 股数据筛选与可视化网页*
*Researched: 2026-06-23*
