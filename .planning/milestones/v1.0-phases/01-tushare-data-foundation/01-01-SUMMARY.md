---
phase: 01-tushare-data-foundation
plan: "01-01"
subsystem: auth-ui-database-foundation
tags: [nextjs, shadcn, sqlite, better-sqlite3, vitest, middleware, session-cookie]
requires: []
provides:
  - "Next.js App Router self-hosted application scaffold"
  - "Password-protected personal workspace entry"
  - "HTTP-only signed session cookie helpers"
  - "SQLite validation snapshot read/write store"
  - "Sanitized data-source status workspace"
affects: [01-02, 01-03, validation-api, status-ui, deployment]
tech-stack:
  added: [next, react, react-dom, shadcn, lucide-react, zod, better-sqlite3, vitest, testing-library-react, jsdom]
  patterns: [server-only-config-boundary, hmac-session-cookie, sqlite-latest-snapshot, sanitized-status-ui]
key-files:
  created:
    - package.json
    - components.json
    - vitest.config.ts
    - src/middleware.ts
    - src/app/login/page.tsx
    - src/app/api/status/route.ts
    - src/app/api/validation/run/route.ts
    - src/components/status/status-workspace.tsx
    - src/lib/config.ts
    - src/lib/auth/session.ts
    - src/lib/validation-store.ts
    - src/lib/validation-types.ts
  modified:
    - src/app/page.tsx
    - src/app/layout.tsx
    - src/app/globals.css
    - README.md
key-decisions:
  - "Use shadcn v4 nova preset because base-neutral no longer exists; keep neutral behavior through components.json baseColor=neutral and explicit CSS variables."
  - "Use HMAC-signed HTTP-only session cookies keyed by APP_PASSWORD for personal-use access protection."
  - "Keep page load read-only against SQLite; /api/validation/run currently records configuration status and does not call Tushare."
patterns-established:
  - "All browser-visible config status is reduced to booleans, categories, and remediation copy."
  - "Protected API routes verify session server-side even when middleware already checked cookie presence."
  - "Validation results are stored as one latest sanitized JSON snapshot in SQLite."
requirements-completed: [CONF-01, CONF-02, CONF-03, DEPL-02]
duration: 35min
completed: 2026-06-23
---

# Phase 01-01: Walking Skeleton Summary

**受密码保护的 Next.js 数据源状态工作台，包含服务端配置边界、HMAC session cookie、SQLite 最近验证快照和 shadcn 状态面板。**

## Performance

- **Duration:** 约 35 分钟
- **Started:** 2026-06-23T05:58:00+08:00
- **Completed:** 2026-06-23T06:21:00+08:00
- **Tasks:** 3
- **Files modified:** 约 35 个

## Accomplishments

- 建立 Next.js App Router、TypeScript、Tailwind/shadcn、Vitest 和自托管脚本。
- 新增 `/login`、受保护首页、`/api/status`、`/api/validation/run` 和 `src/middleware.ts` 访问门禁。
- 新增服务端配置读取、HMAC 签名 session cookie、SQLite 快照读写、状态工作台 UI。
- 增加访问保护、配置脱敏、SQLite 快照和 UI 状态测试。

## Task Commits

1. **Task 1: Confirm package legitimacy before install** - 人工确认 `approve-verified-packages`，无文件提交。
2. **Task 2: Scaffold Next.js and verification scripts** - `61d2c86` (`feat`)
3. **Task 3: Add access gate, config boundary, SQLite snapshot, and status workspace** - `0900413` (`feat`)

## Files Created/Modified

- `package.json` - Next.js、测试、构建和验证脚本。
- `components.json` - shadcn 官方组件配置，`baseColor=neutral`。
- `src/middleware.ts` - 未认证页面跳转登录，未认证 API 返回 401。
- `src/app/login/page.tsx` - 访问密码输入页和通用错误文案。
- `src/app/page.tsx` - 认证后读取 SQLite 快照并渲染状态工作台。
- `src/app/api/status/route.ts` - 返回最近一次脱敏验证快照。
- `src/app/api/validation/run/route.ts` - 写入当前服务端配置验证快照。
- `src/lib/config.ts` - 服务端环境变量读取与脱敏配置状态。
- `src/lib/auth/session.ts` - HMAC 签名 session cookie 生成、验证、清除。
- `src/lib/validation-store.ts` - SQLite 最近验证快照存取。
- `src/components/status/status-workspace.tsx` - 数据源状态摘要、分区和手动验证按钮。
- `tests/**` - 访问门禁、配置边界、SQLite 和 UI 组件测试。

## Decisions Made

- shadcn 4.11 不再支持计划中试探的 `base-neutral` preset；采用官方 `nova` preset，并用 `components.json` 和 CSS 变量保持中性浅色主题。
- `middleware` 只做快速门禁，API route 和页面仍在服务端二次验证 session，防止仅凭 cookie 存在就授权。
- `/api/validation/run` 在本计划只验证服务器配置并写入 SQLite；真实 Tushare 调用留给 01-02 和 01-03。

## Deviations from Plan

### Auto-fixed Issues

**1. shadcn preset 命名变化**
- **Found during:** Task 2
- **Issue:** `base-neutral` 不是 shadcn 4.11 可用 preset。
- **Fix:** 使用 `nova` 初始化，并保留 `baseColor: neutral` 与 UI-SPEC 指定 CSS 变量。
- **Files modified:** `components.json`, `src/app/globals.css`
- **Verification:** `npm run verify`
- **Committed in:** `61d2c86`

**2. 删除未使用的 Next 模板 public 资产**
- **Found during:** Task 3
- **Issue:** 模板 SVG 不再被页面引用，会给仓库留下无关样板资产。
- **Fix:** 删除 `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`。
- **Verification:** `npm run verify`
- **Committed in:** `0900413`

**Total deviations:** 2 个自动修正。  
**Impact on plan:** 均为脚手架适配或样板清理，未扩大功能范围。

## Issues Encountered

- `npm audit` 报告 2 个 moderate 项，来源为 Next 内部依赖 `postcss <8.5.10`；npm 建议的自动修复会把 Next 降级到 9.3.3，不可接受，暂记录风险。
- Next 16 构建提示 `middleware` 文件约定已弃用并建议迁移到 `proxy`；当前计划明确要求 `src/middleware.ts`，且构建通过，后续可在兼容性清理中评估迁移。

## User Setup Required

需要在本地或服务器 `.env.local` 设置：

```bash
APP_PASSWORD=your-access-password
TUSHARE_TOKEN=your-tushare-token
```

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/auth/access-gate.test.ts tests/validation/config-boundary.test.ts tests/validation/status-store.test.ts tests/ui/status-workspace.test.tsx` - PASS
- `D:\NodeJS\npm.cmd run verify` - PASS
- `rg "NEXT_PUBLIC_TUSHARE|TUSHARE_TOKEN|APP_PASSWORD|readTushareTokenSecret|loadServerConfig" -n src tests README.md package.json` - PASS，未发现 `NEXT_PUBLIC_TUSHARE`，secret 只在服务端配置、API、测试和 README 示例中出现。

## Next Phase Readiness

01-02 可以直接复用：

- `readTushareTokenSecret()` 读取服务端 token。
- `/api/validation/run` 作为受保护验证入口。
- `writeValidationSnapshot()` 写入 Tushare `stock_basic` 验证结果。
- `StatusWorkspace` 已能展示连接、股票样本、价格口径和筹码候选状态。

## Self-Check: PASSED

- Summary 已创建。
- Task 验证命令已通过。
- 代码提交已存在且可回溯。
- 已知风险已记录。

---
*Phase: 01-tushare-data-foundation*
*Completed: 2026-06-23*
