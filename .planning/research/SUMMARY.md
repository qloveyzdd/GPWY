# Project Research Summary

**Project:** A Stock Downtrend Screener
**Domain:** A 股数据筛选与可视化网页
**Researched:** 2026-06-23
**Confidence:** MEDIUM

## Executive Summary

这个项目适合按“单体全栈网页 + 服务端数据刷新 + 本地缓存 + 可测试筛选算法”的方式实现。用户是个人使用，刷新方式是手动触发，因此首版不需要队列、Redis、复杂登录或远程数据库。Next.js 自托管应用配合 SQLite 能覆盖页面、刷新接口、缓存和图表数据 API，复杂度最低。

最大风险不在页面，而在数据口径：Tushare 的行情复权口径和筹码峰接口可用性必须先实测。尤其是“筹码峰价格”可能不是一个直接字段，而是需要从筹码分布接口中取占比最高的价格档；如果账号权限或接口不可用，首版不能用自研估算冒充完成。

路线图应先做 Tushare 数据基础和接口验证，再做筛选管线，最后做表格和图表。这样可以尽早暴露筹码峰、行情口径、额度限制这些根本风险。

## Key Findings

### Recommended Stack

首版推荐使用自托管 Next.js + Node.js LTS + SQLite。Tushare token 只在服务端读取，刷新结果和行情切片写入 SQLite，表格和图表从本地结果读取。

**Core technologies:**
- Next.js: 页面、API route/server action 和部署入口统一。
- Node.js LTS: 云端自托管运行时。
- SQLite: 个人手动刷新场景下足够简单。
- ECharts: 适合价格、均线、阈值和筹码峰标记。
- TypeScript + Vitest: 筛选算法必须可测试。

### Expected Features

**Must have (table stakes):**
- Tushare token 服务端配置。
- 手动刷新。
- A 股基础信息获取。
- 最近 60 交易日行情缓存。
- MA20/MA60 计算。
- 最近波段高点识别。
- 下降区间 85% 筛选。
- 筹码峰接口验证与峰值提取。
- 表格和图表展示。

**Should have (competitive):**
- 每只股票显示入选原因和关键数值。
- 失败股票和接口错误明细。
- 缓存刷新结果，减少重复调用。

**Defer (v2+):**
- 自动每日刷新。
- 多人账号权限。
- CSV 导出。
- 可配置筛选参数。
- 多数据源融合。

### Architecture Approach

系统应分为 UI、刷新控制器、Tushare client、SQLite cache、筛选算法和图表数据构建器。筛选算法必须是纯函数；Tushare client 必须是 server-only；刷新流程先缓存输入，再计算和保存结果。

**Major components:**
1. UI shell - 刷新按钮、结果表、单只股票图表。
2. Tushare client - 封装 token、接口名、字段和错误处理。
3. SQLite cache - 保存股票、行情、筹码和刷新结果。
4. Screening engine - 计算 MA、波段高点、下降趋势和 85% 条件。
5. Chart data builder - 输出 ECharts 所需序列和标记。

### Critical Pitfalls

1. **筹码峰接口假设错误** - 必须用真实 token 验证 `cyq_chips`/`cyq_perf` 或等价接口。
2. **复权口径不明确** - 必须决定价格口径，否则 MA 和高点可能失真。
3. **Tushare 额度和耗时被低估** - 行情尽量批量或缓存，只对候选股取筹码。
4. **波段高点算法边界没测** - 必须写单元测试。
5. **图表不能解释筛选** - 必须标出高点、85% 阈值、MA 和筹码峰。

## Implications for Roadmap

### Phase 1: Tushare Data Foundation
**Rationale:** 先验证最根本的数据可得性，尤其是筹码峰。
**Delivers:** 项目脚手架、Tushare client、token 配置、基础行情样例、筹码候选接口验证。
**Addresses:** Tushare integration, stock_basic, daily bars, chip endpoint validation.
**Avoids:** 筹码接口假设错误、token 泄露、复权口径不明确。

### Phase 2: Screening Pipeline
**Rationale:** 数据可得后再实现筛选算法和缓存。
**Delivers:** SQLite schema、手动刷新流程、MA20/MA60、波段高点、85% 筛选、结果落库。
**Uses:** Screening engine, refresh_runs, screening_results.
**Implements:** 核心价值链路。

### Phase 3: Results UI and Charts
**Rationale:** 先保证数据正确，再做可视化。
**Delivers:** 结果表格、排序、刷新状态、单只股票图表、价格/均线/高点/筹码峰标记。
**Uses:** ECharts and table components.
**Implements:** 用户查看和研判体验。

### Phase 4: Hardening and Deployment
**Rationale:** 首版可用后再补部署和可靠性。
**Delivers:** 云端部署脚本/说明、访问保护、错误脱敏、刷新失败明细、基础冒烟测试。
**Uses:** Node self-hosting, env vars, process manager.

### Phase Ordering Rationale

- 先验证 Tushare 和筹码数据，避免页面完成后发现核心数据不可用。
- 筛选算法在 UI 前完成，保证图表展示的是可信结果。
- 部署放在最后，但环境变量和 server-only 边界从第一阶段开始设计。

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Tushare `cyq_chips`/`cyq_perf` 或等价筹码接口需要真实 token 验证。
- **Phase 1:** 行情复权口径需要确认使用 `daily` + `adj_factor`、`pro_bar` 还是其他方案。
- **Phase 2:** 全市场刷新调用策略需要结合 Tushare 额度测试。

Phases with standard patterns:
- **Phase 3:** 表格和 ECharts 图表是成熟模式。
- **Phase 4:** 单机 Node 自托管和 env 配置是成熟模式。

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Next.js/SQLite/ECharts 适配场景明确，但确切包版本在 scaffold 时锁定 |
| Features | HIGH | 用户已确认首版功能和交互方式 |
| Architecture | MEDIUM | 单体架构适合个人使用，但刷新耗时需实测 |
| Pitfalls | MEDIUM | 数据口径风险明确，但筹码接口需要真实账号验证 |

**Overall confidence:** MEDIUM

### Gaps to Address

- **筹码峰接口可用性:** Phase 1 必须用真实 token 试调用候选接口并保存样例字段。
- **复权价格口径:** Phase 1 必须明确 MA 和波段高点用什么价格口径。
- **刷新耗时和额度:** Phase 2 必须记录调用量、耗时和失败原因。

## Sources

### Primary (HIGH confidence)
- https://tushare.pro/ - official Tushare Pro entry point
- https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/client.py - official generic API client pattern
- https://nextjs.org/docs/app/getting-started/installation - official Next.js installation flow
- https://nodejs.org/en/about/previous-releases - Node.js LTS lifecycle
- https://echarts.apache.org/en/index.html - official ECharts project

### Project Context
- `.planning/PROJECT.md` - confirmed project scope, algorithm, and constraints

---
*Research completed: 2026-06-23*
*Ready for roadmap: yes*
