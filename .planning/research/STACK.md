# Stack Research

**Domain:** A 股数据筛选与可视化网页
**Researched:** 2026-06-23
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24 LTS, fallback 22 LTS | 运行自托管网页服务 | 官方 LTS 运行时适合云端长期运行，Next.js 生态支持成熟 |
| Next.js | latest stable, pin in lockfile | 全栈网页应用 | 同一项目内完成页面、API route/server action、环境变量和部署，减少前后端分裂 |
| React | Next.js bundled compatible version | 表格和图表 UI | 与 Next.js 默认集成，适合交互式筛选结果页面 |
| SQLite | 3.x | 本地缓存刷新结果和行情切片 | 个人使用、手动刷新场景下足够简单；不需要一开始引入远程数据库 |
| Tushare Pro REST API | official current API | A 股基础信息、行情、筹码相关数据 | 用户指定数据源；服务端调用可保护 token |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| echarts / echarts-for-react | latest stable, pin in lockfile | K 线、均线、筹码峰可视化 | 展示价格走势、MA20、MA60、波段高点和筹码峰 |
| better-sqlite3 | latest stable, pin in lockfile | SQLite 同步访问 | 自托管 Node 服务端缓存数据，避免复杂 ORM |
| zod | latest stable, pin in lockfile | 环境变量和请求参数校验 | 校验 `TUSHARE_TOKEN`、刷新参数、API 响应结构 |
| TanStack Table | latest stable, pin in lockfile | 结果表格排序和筛选 | 当表格字段增多、需要稳定排序时引入 |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | 类型约束 | 对 Tushare 响应、筛选结果和图表数据建模 |
| ESLint | 基础质量检查 | 使用 Next.js 默认配置即可 |
| Vitest | 算法单元测试 | 重点测试 MA、波段高点、85% 阈值和筹码峰提取 |
| Playwright | 页面冒烟测试 | 验证刷新按钮、表格、图表渲染 |

## Installation

```bash
npx create-next-app@latest .
npm install echarts echarts-for-react better-sqlite3 zod @tanstack/react-table
npm install -D vitest playwright
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js fullstack | FastAPI + React | 如果后续需要大量 Python 数据处理、pandas 或异步任务队列 |
| SQLite | PostgreSQL | 如果未来变成多人使用、历史数据量明显扩大或需要远程部署多实例 |
| Direct REST to Tushare | Python tushare SDK | 如果 Tushare REST 行为不稳定，或必须使用 SDK 才能调用某些便捷接口 |
| ECharts | Recharts | 如果只需要简单折线图；但筹码峰和多轴图更适合 ECharts |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| 前端直接调用 Tushare | 会暴露 token，也难以统一缓存和限流 | 服务端 API route/server action 调用 |
| 首版引入 Redis/队列/微服务 | 个人手动刷新不需要该复杂度 | 单进程刷新任务加 SQLite 状态表 |
| 未验证筹码分布算法 | 会把数据口径问题伪装成“功能完成” | 先验证 Tushare `cyq_chips`/`cyq_perf` 或等价官方字段 |
| Serverless 部署假设 | 手动刷新可能有长耗时和本地 SQLite 写入 | 自托管 Node 进程，systemd/PM2 管理 |

## Stack Patterns by Variant

**If refresh takes under a few minutes:**
- Use a single authenticated refresh API route.
- Store refresh status and latest result in SQLite.

**If refresh exceeds request timeout:**
- Use refresh job table plus background worker loop in the same Node process.
- UI polls refresh status.

**If Tushare chip endpoint is not available to the account:**
- Do not approximate silently.
- Show the requirement as blocked and surface the missing endpoint/permission.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js latest stable | Node.js 24 LTS / 22 LTS | Pin exact versions in `package-lock.json` during scaffold |
| better-sqlite3 | Self-hosted Node runtime | Avoid serverless runtimes unless native module support is verified |
| echarts-for-react | React compatible with selected Next.js | Keep chart code client-side |

## Sources

- https://tushare.pro/ - official Tushare Pro entry point and data API positioning
- https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/client.py - official Tushare client shows generic `api_name` query pattern
- https://nodejs.org/en/about/previous-releases - Node.js release/LTS lifecycle
- https://nextjs.org/docs/app/getting-started/installation - official Next.js installation flow
- https://echarts.apache.org/en/index.html - official ECharts project

---
*Stack research for: A 股数据筛选与可视化网页*
*Researched: 2026-06-23*
