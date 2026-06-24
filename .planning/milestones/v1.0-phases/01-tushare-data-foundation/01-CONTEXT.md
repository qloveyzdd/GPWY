# Phase 1: Tushare Data Foundation - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>

## Phase Boundary

本阶段交付 Tushare 数据基础验证能力：用户可以访问受保护的基础网页，服务端安全读取 Tushare token，并验证股票基础信息、行情价格口径和筹码候选接口是否可用。

本阶段不实现完整手动刷新管线、全市场筛选算法、结果表格、股票图表或云端部署完善项；这些分别属于后续阶段。

</domain>

<decisions>

## Implementation Decisions

### 个人访问保护

- **D-01:** 首版使用应用访问密码作为最小个人访问保护。
- **D-02:** 访问密码通过 `.env` / 服务端环境变量配置，不能写入代码、页面响应、前端 bundle、日志或提交历史。
- **D-03:** 保护范围是整个网页；未通过访问密码前，用户不能查看页面、结果，也不能触发刷新或验证接口。
- **D-04:** 密码错误时停留在登录页并显示通用错误，例如“密码错误”；不要透露 token、接口、服务器或内部验证状态。

### 数据源状态页

- **D-05:** Phase 1 基础网页使用完整状态面板。
- **D-06:** 状态面板展示 token 配置状态、Tushare 连接结果、股票基础信息样例、行情价格口径、筹码候选接口验证结果。
- **D-07:** 状态页只展示脱敏摘要，例如接口名称、成功/失败、字段列表、样例股票代码/名称、错误类别；不展示完整原始响应。
- **D-08:** 状态页默认读取上次验证结果，并提供按钮重新验证；首屏不自动调用 Tushare，避免无意消耗额度。

### 行情价格口径

- **D-09:** Phase 1 先实测 Tushare 可稳定提供哪些价格口径，再锁定 MA20、MA60 和波段高点使用的价格口径。
- **D-10:** 选择原则是：能稳定获取前复权就使用前复权；如果前复权不可稳定获取，则退回未复权。
- **D-11:** 状态页必须明确显示当前使用的价格口径和原因；如果退回未复权，也必须显示原因和除权风险。

### 筹码接口失败处理

- **D-12:** 用户选择不继续讨论本灰区，沿用项目既有决策：如果 `cyq_chips` / `cyq_perf` 或 Tushare 等价筹码接口不可用、字段不满足或账号权限不足，则标记筹码峰能力阻塞。
- **D-13:** 不允许使用未验证的自研筹码估算算法替代 Tushare 官方数据来伪造“筹码峰已完成”。

### the agent's Discretion

- 访问密码的具体环境变量名、cookie/session 机制、会话有效期和页面组件结构由规划/实现阶段决定，但必须满足整站保护、服务端校验和 token 不泄露。
- Tushare 状态验证的具体接口调用顺序由规划/实现阶段决定，但必须覆盖股票基础信息、行情价格口径和筹码候选接口。
- 错误分类文案可以由规划/实现阶段设计，但必须脱敏，并能区分 token 缺失、token 无效、权限不足、空数据、限频和网络/服务错误。

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope

- `.planning/PROJECT.md` - Defines product goal, core value, algorithm boundary, out-of-scope decisions, and Tushare-first constraint.
- `.planning/ROADMAP.md` - Defines Phase 1 goal, success criteria, requirements list, and phase boundary.
- `.planning/STATE.md` - Current project position and known blockers for Phase 1.

### Requirements

- `.planning/REQUIREMENTS.md` - Defines Phase 1 requirements: CONF-01, CONF-02, CONF-03, DATA-01, DATA-03, DATA-04, CHIP-01, DEPL-02.

### Research

- `.planning/research/SUMMARY.md` - Summarizes roadmap implications and research gaps for Tushare chip endpoint availability and price adjustment basis.
- `.planning/research/STACK.md` - Recommends Next.js, Node.js, SQLite, ECharts, and server-only Tushare access.
- `.planning/research/ARCHITECTURE.md` - Defines server-only Tushare client, cache-before-compute pattern, and component boundaries.
- `.planning/research/PITFALLS.md` - Documents critical pitfalls: chip endpoint assumptions, price adjustment ambiguity, token leakage, and over-fetching Tushare.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- No business application code exists yet. The repository currently contains planning artifacts and generated project guidance only.

### Established Patterns

- No existing application architecture, routing, component, database, or test pattern exists yet.
- Phase 1 should establish the initial conventions for server-only Tushare access, environment validation, minimal access protection, and status-panel UI.

### Integration Points

- New code will connect to the project root as the first application scaffold.
- Generated `AGENTS.md` must remain the project guidance source for future Codex/GSD work.

</code_context>

<specifics>

## Specific Ideas

- The access password must come from `.env` / server environment rather than from UI configuration or committed files.
- The status page should show the last validation result first and let the user explicitly re-run validation.
- The status page should be useful for debugging but safe for personal cloud exposure: no raw API response, no token, no sensitive stack details.
- Price basis should prefer front-adjusted prices when Tushare can provide them reliably; otherwise use unadjusted prices with a visible warning.

</specifics>

<deferred>

## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Tushare Data Foundation*
*Context gathered: 2026-06-23*
