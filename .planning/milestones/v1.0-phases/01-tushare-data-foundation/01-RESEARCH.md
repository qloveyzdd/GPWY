# Phase 01: Tushare Data Foundation - Research

**Researched:** 2026-06-23
**Domain:** Next.js self-hosted diagnostics app, server-only Tushare validation, access protection
**Confidence:** MEDIUM

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 个人访问保护

- **D-01:** 首版使用应用访问密码作为最小个人访问保护。
- **D-02:** 访问密码通过 `.env` / 服务端环境变量配置，不能写入代码、页面响应、前端 bundle、日志或提交历史。
- **D-03:** 保护范围是整个网页；未通过访问密码前，用户不能查看页面、结果，也不能触发刷新或验证接口。
- **D-04:** 密码错误时停留在登录页并显示通用错误，例如“密码错误”；不要透露 token、接口、服务器或内部验证状态。

#### 数据源状态页

- **D-05:** Phase 1 基础网页使用完整状态面板。
- **D-06:** 状态面板展示 token 配置状态、Tushare 连接结果、股票基础信息样例、行情价格口径、筹码候选接口验证结果。
- **D-07:** 状态页只展示脱敏摘要，例如接口名称、成功/失败、字段列表、样例股票代码/名称、错误类别；不展示完整原始响应。
- **D-08:** 状态页默认读取上次验证结果，并提供按钮重新验证；首屏不自动调用 Tushare，避免无意消耗额度。

#### 行情价格口径

- **D-09:** Phase 1 先实测 Tushare 可稳定提供哪些价格口径，再锁定 MA20、MA60 和波段高点使用的价格口径。
- **D-10:** 选择原则是：能稳定获取前复权就使用前复权；如果前复权不可稳定获取，则退回未复权。
- **D-11:** 状态页必须明确显示当前使用的价格口径和原因；如果退回未复权，也必须显示原因和除权风险。

#### 筹码接口失败处理

- **D-12:** 用户选择不继续讨论本灰区，沿用项目既有决策：如果 `cyq_chips` / `cyq_perf` 或 Tushare 等价筹码接口不可用、字段不满足或账号权限不足，则标记筹码峰能力阻塞。
- **D-13:** 不允许使用未验证的自研筹码估算算法替代 Tushare 官方数据来伪造“筹码峰已完成”。

### the agent's Discretion

- 访问密码的具体环境变量名、cookie/session 机制、会话有效期和页面组件结构由规划/实现阶段决定，但必须满足整站保护、服务端校验和 token 不泄露。
- Tushare 状态验证的具体接口调用顺序由规划/实现阶段决定，但必须覆盖股票基础信息、行情价格口径和筹码候选接口。
- 错误分类文案可以由规划/实现阶段设计，但必须脱敏，并能区分 token 缺失、token 无效、权限不足、空数据、限频和网络/服务错误。

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONF-01 | 服务端环境变量读取 `TUSHARE_TOKEN`，且 token 不进入浏览器代码、页面响应或前端日志。 | Next.js 支持服务端读取环境变量；只有 `NEXT_PUBLIC_` 前缀变量会被用于浏览器侧公开配置，应禁止 token 使用该前缀。 |
| CONF-02 | 用户可以在云端服务器以自托管方式运行网页服务。 | Next.js 官方支持 self-hosting；Phase 1 应提供 `npm run dev`/`npm run build`/`npm start` 路径作为本地全栈运行证明。 |
| CONF-03 | 系统提供最小个人访问保护。 | 使用 HTTP-only session cookie + server-side password verification；中间件保护页面和验证 API。 |
| DATA-01 | 通过 Tushare 获取 A 股股票基础信息，至少包含股票代码和名称。 | Tushare 官方 Python client 显示通用 `api_name` 查询模式；执行期应调用 `stock_basic` 并指定字段。 |
| DATA-03 | 明确记录行情价格口径。 | Phase 1 应实测未复权 `daily`、前复权候选能力和 `adj_factor` 可用性，保存选择原因。 |
| DATA-04 | Tushare 接口失败、权限不足、空数据或限频时记录脱敏错误原因。 | 建立统一错误分类：missing_config、invalid_token、permission_denied、empty_data、rate_limited、network_or_service。 |
| CHIP-01 | 用真实 Tushare token 验证筹码相关候选接口或字段是否可用，优先验证 `cyq_chips`、`cyq_perf` 或等价能力。 | `cyq_chips`/`cyq_perf` 在本研究中未能通过可抓取官方文档确认，只能作为候选 `api_name` 进入真实 token 验证。 |
| DEPL-02 | 缺少 `TUSHARE_TOKEN` 或 token 无效时显示明确服务端配置错误。 | UI-SPEC 已定义安全文案；后端应返回脱敏错误类别而不是原始异常。 |

</phase_requirements>

## Summary

Phase 1 should create a walking skeleton that proves the full stack works before later screening phases depend on it. The smallest useful capability is: a user enters an app access password, opens the status workspace, reads the last stored validation snapshot from SQLite, clicks a validation button, and the server writes a new sanitized snapshot after checking configuration and Tushare candidate APIs.

The hardest constraint is not rendering the page; it is proving data-source truth safely. The plan must make Tushare token access server-only, classify failures without leaking raw API details, and treat chip candidate availability as a measured result rather than an assumption.

**Primary recommendation:** Scaffold a self-hosted Next.js App Router app with shadcn official components, HTTP-only access session, SQLite-backed validation snapshots, a server-only Tushare client, and explicit validation result records for stock basics, price basis, and chip candidates.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Whole-site password gate | Frontend Server / API | Browser UI | Password verification and session issuance must run server-side; browser only submits password and renders generic errors. |
| Status workspace rendering | Browser / Client | Frontend Server | The user scans status summaries and triggers validation from the UI; data is loaded through same-origin server routes. |
| Tushare token loading | API / Backend | - | `TUSHARE_TOKEN` must be read only in server code and never serialized to the browser. |
| Tushare API calls | API / Backend | External Tushare Pro API | All external calls cross a server boundary to protect token and normalize errors. |
| Last validation result | Database / Storage | API / Backend | SQLite owns durable snapshot storage; API reads/writes sanitized records. |
| Price-basis decision | API / Backend | Database / Storage | The validation runner decides usable price basis and persists reason/risk for later phases. |
| Chip candidate status | API / Backend | Database / Storage | The validation runner tries candidate interfaces and records available/blocked/permission-denied states. |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | Local: 24.15.0; fallback 22 LTS | Runtime for self-hosted Next.js | Local version is available and matches project research direction. |
| npm | Local: 11.12.1 via `D:\NodeJS\npm.cmd` | Package install and scripts | PowerShell blocks `npm.ps1`; plans should call `npm.cmd` explicitly on Windows. |
| Next.js App Router | Lock exact version during scaffold | Full-stack app, page routing, route handlers | Official docs support `create-next-app` and App Router setup. [CITED: nextjs.org/docs/app/getting-started/installation] |
| React | Next-compatible version from scaffold | UI rendering | Installed by the Next scaffold; keep version coupled to Next. |
| SQLite + `better-sqlite3` | Lock exact version during scaffold | Store last validation snapshots | A real DB read/write satisfies walking skeleton and D-08 without building the later full cache. |
| Tushare Pro REST API | Official current API | Stock basic, market data, chip candidate validation | User-selected data source; official Python client confirms generic `api_name` query shape. [CITED: github.com/waditu/tushare] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| shadcn official CLI/components | Lock exact version during scaffold | Button/input/alert/badge/table/tooltip per UI-SPEC | Initialize during scaffold; third-party registries are not allowed in Phase 1. |
| lucide-react | Lock exact version during scaffold | Status/action icons | UI-SPEC requires lucide icons for status and actions. |
| zod | Lock exact version during scaffold | Env, request, and Tushare response validation | Use at every server boundary and Tushare response boundary. |
| Vitest | Lock exact version during scaffold | Fast unit/integration checks | Next.js official testing guide supports Vitest for app testing. [CITED: nextjs.org/docs/app/guides/testing/vitest] |
| React Testing Library + jsdom | Lock exact version during scaffold | Status UI contract tests | Validate login/status states without full browser e2e. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Next.js full-stack | Separate React + Express | More moving parts with no Phase 1 benefit. |
| HTTP-only signed session cookie | Full user account system | Full accounts are out of scope; a signed access session is enough for personal use. |
| SQLite validation snapshots | In-memory last result | In-memory state would fail walking skeleton DB read/write and lose last status on restart. |
| Tushare REST generic client | Python Tushare SDK bridge | Python bridge adds deployment complexity; keep as fallback only if REST behavior fails. |

**Installation pattern:** execution must first verify package names and registry availability, then run the scaffold and installs. Do not use unverified packages from training memory.

## Package Legitimacy Audit

Local package verification could not complete because the workspace sandbox blocks outbound npm/PyPI access. `slopcheck` is not installed and `pip install slopcheck` failed due network restrictions. Therefore every package below is treated as `[ASSUMED]` for planning safety even when the package name is cited by official docs.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `next` | npm | unknown in local sandbox | unknown | official docs cite package | unavailable | Flagged - executor must verify before install |
| `react` | npm | unknown in local sandbox | unknown | installed by Next scaffold | unavailable | Flagged - executor must verify before install |
| `react-dom` | npm | unknown in local sandbox | unknown | installed by Next scaffold | unavailable | Flagged - executor must verify before install |
| `shadcn` | npm | unknown in local sandbox | unknown | official shadcn docs cite CLI | unavailable | Flagged - executor must verify before install |
| `lucide-react` | npm | unknown in local sandbox | unknown | UI-SPEC-selected icon library | unavailable | Flagged - executor must verify before install |
| `zod` | npm | unknown in local sandbox | unknown | project research-selected validation library | unavailable | Flagged - executor must verify before install |
| `better-sqlite3` | npm | unknown in local sandbox | unknown | project research-selected SQLite binding | unavailable | Flagged - executor must verify before install |
| `vitest` | npm | unknown in local sandbox | unknown | official Next testing guide supports Vitest | unavailable | Flagged - executor must verify before install |
| `@testing-library/react` | npm | unknown in local sandbox | unknown | official testing ecosystem | unavailable | Flagged - executor must verify before install |
| `jsdom` | npm | unknown in local sandbox | unknown | required for DOM tests under Vitest | unavailable | Flagged - executor must verify before install |

**Packages removed due to slopcheck [SLOP] verdict:** none, because slopcheck could not run.
**Packages flagged as suspicious [SUS]:** none; all packages are `[ASSUMED]` because registry checks could not run.

Planner requirement: first execution plan must include a package legitimacy gate before package install. If `npm.cmd view <package> version` cannot verify a package during execution, stop for user review instead of installing.

## Architecture Patterns

### System Architecture Diagram

```text
Browser
  -> password form
  -> status workspace
  -> "重新验证数据源" action
        |
        v
Next.js server boundary
  -> access password verification
  -> HTTP-only signed session cookie
  -> protected status API
  -> protected validation API
        |
        v
Server-only modules
  -> config loader (APP_PASSWORD, TUSHARE_TOKEN)
  -> Tushare client (generic api_name POST)
  -> validation runner
  -> error sanitizer
        |
        v
SQLite
  -> validation_snapshots
        |
        v
Tushare Pro API
  -> stock_basic
  -> daily / adj_factor / equivalent price-basis probes
  -> cyq_chips / cyq_perf / equivalent chip candidate probes
```

### Recommended Project Structure

```text
src/
  app/
    page.tsx
    layout.tsx
    api/
      status/route.ts
      validation/run/route.ts
  components/
    status/status-workspace.tsx
  lib/
    auth/session.ts
    config.ts
    validation-store.ts
    validation/
      run-basic-validation.ts
      chip-and-price-validation.ts
      result-sanitizer.ts
    tushare/
      client.ts
      endpoints.ts
      types.ts
tests/
  validation/
  ui/
```

### Pattern 1: Server-only Config Boundary

**What:** Read `APP_PASSWORD` and `TUSHARE_TOKEN` only from server modules. Never expose them through `NEXT_PUBLIC_*`, serialized props, API response payloads, logs, or test snapshots.

**When to use:** Every route handler, server action, and validation runner.

**Example:**

```typescript
// Source: Next.js environment variable guidance; exact implementation written during execution.
// Keep secrets in server-only modules and return only booleans or sanitized status codes.
```

### Pattern 2: Generic Tushare Client With Endpoint Registry

**What:** Implement one client method that accepts `api_name`, `fields`, and `params`, then validates and sanitizes the result. Keep endpoint names in `endpoints.ts`.

**When to use:** `stock_basic`, price-basis probes, and chip candidate probes.

**Example:**

```typescript
// Source: official Tushare Python client generic query pattern.
// request body shape: token + api_name + params + fields.
```

### Pattern 3: Sanitized Validation Snapshot

**What:** Store only safe summaries in SQLite: status, interface name, field names, sample stock code/name, price basis, chip candidate status, error category, and timestamp.

**When to use:** Status page default load and validation rerun completion.

### Anti-Patterns to Avoid

- **Calling Tushare from client code:** leaks token and makes error sanitization unenforceable.
- **Rendering raw Tushare responses:** violates D-07 and can leak request or account details.
- **Treating chip endpoint names as confirmed:** `cyq_chips`/`cyq_perf` remain candidates until real token validation succeeds.
- **Computing full screening in Phase 1:** belongs to later phases; Phase 1 only validates data-source capability and records basis decisions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI primitives | Custom ad-hoc buttons/inputs/badges | shadcn official components | UI-SPEC already locks component contract and registry safety. |
| Request/env validation | Manual scattered `if` checks | zod schemas | Centralized errors and safer boundary handling. |
| SQLite binding | Custom file serialization | better-sqlite3 | A real DB read/write is required; JSON files invite race and shape drift. |
| Tushare data approximation | Chip peak or price basis estimates | Real Tushare validation result | User requires official data or blocked status. |
| Session signing crypto | Custom crypto scheme | Node crypto HMAC via small server-only helper | Avoid storing raw password or inventing token formats. |

## Common Pitfalls

### Pitfall 1: Token Leaks Through Frontend Boundaries

**What goes wrong:** Token appears in client bundle, JSON response, console logs, or test output.
**Why it happens:** Server/client boundaries in App Router are easy to blur.
**How to avoid:** Put config loading in `src/lib/config.ts`, import it only from route handlers/server modules, and test that rendered/API output does not contain token-shaped values.
**Warning signs:** `TUSHARE_TOKEN` referenced from `.tsx` components or variables named `NEXT_PUBLIC_TUSHARE_*`.

### Pitfall 2: Status Page Triggers API Calls on Load

**What goes wrong:** Opening the page consumes Tushare quota.
**Why it happens:** Developers load status by directly running validation instead of reading last snapshot.
**How to avoid:** `GET /api/status` reads SQLite only; `POST /api/validation/run` is the only path that calls Tushare.
**Warning signs:** `page.tsx` or status GET route imports Tushare client.

### Pitfall 3: Price Basis Is Recorded As Text Only

**What goes wrong:** UI says "front adjusted" but later phases cannot rely on a machine-readable basis.
**Why it happens:** Basis is treated as copy instead of data.
**How to avoid:** Store `{ basis: "front_adjusted" | "unadjusted" | "unknown", reason, risk }` in the validation snapshot.

### Pitfall 4: Chip Candidate Failure Is Treated As App Failure

**What goes wrong:** Missing chip permission blocks all status validation.
**Why it happens:** Endpoint capability and overall connectivity are conflated.
**How to avoid:** Record chip status separately as `available`, `permission_denied`, `empty`, `not_supported`, or `blocked`.

## Code Examples

Verified patterns from official sources are referenced at the level available in this sandbox:

### Next.js Route Handler Boundary

```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/route
// Implement GET /api/status and POST /api/validation/run as route handlers.
```

### Next.js Environment Variables

```typescript
// Source: https://nextjs.org/docs/app/guides/environment-variables
// Use server-side env access for APP_PASSWORD and TUSHARE_TOKEN.
// Do not use NEXT_PUBLIC_ for secrets.
```

### Tushare Generic API Query

```typescript
// Source: https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/client.py
// Mirror the generic api_name + params + fields query shape in TypeScript.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router first scaffold | App Router first scaffold | Next.js current docs | Plan app structure under `src/app`. |
| `shadcn-ui` package naming | `shadcn` CLI naming in current docs | shadcn current docs | Verify `shadcn` package before install. |
| Client-rendered secrets | Server-only env access | Current Next.js env guidance | Keep Tushare token out of browser paths. |

**Deprecated/outdated:**
- Treating Tushare chip candidate endpoint names as confirmed from memory: not acceptable; execution must verify with real token.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cyq_chips` and `cyq_perf` are valid Tushare candidate `api_name` values for this account. | Phase Requirements / Architecture Patterns | Chip validation may return not_supported or permission_denied; later chip-peak phase stays blocked. |
| A2 | `better-sqlite3` can install in the target Windows/cloud Node environment. | Standard Stack | If native install fails, execution must choose an SQLite alternative before continuing. |
| A3 | `shadcn` CLI package name remains valid. | Package Legitimacy Audit | Scaffold step must verify CLI package before executing it. |

## Open Questions (RESOLVED)

1. **Should Phase 1 call Tushare on page load?** RESOLVED: no. Page load reads the last SQLite validation snapshot per D-08.
2. **Should chip endpoint failure fail the whole validation?** RESOLVED: no. It marks chip capability blocked or degraded per D-12/D-13 while other status sections can still show their own results.
3. **Should Phase 1 choose a price basis without testing?** RESOLVED: no. It tests availability and records the selected basis and reason per D-09 through D-11.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next.js runtime | yes | 24.15.0 | Use Node 22 LTS on cloud if needed |
| npm | Package install/scripts | yes via `D:\NodeJS\npm.cmd` | 11.12.1 | Use `npm.cmd`; avoid blocked `npm.ps1` |
| Python | slopcheck attempt | yes | 3.11.9 | Not needed for app runtime |
| slopcheck | Package legitimacy audit | no | - | Executor must run npm registry checks and stop if packages cannot be verified |
| Tushare token | Real data validation | unknown | server env | Missing token returns config error per DEPL-02 |
| package.json | Existing frontend scaffold | no | - | Phase 1 creates it |

**Missing dependencies with no fallback:**
- Valid `TUSHARE_TOKEN` for real endpoint validation. Without it, Phase 1 can still show a configuration error but cannot mark Tushare data available.

**Missing dependencies with fallback:**
- `slopcheck`; fallback is explicit npm registry verification plus user review if registry checks fail.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + React Testing Library |
| Config file | `vitest.config.ts` created during Phase 1 scaffold |
| Quick run command | `D:\NodeJS\npm.cmd run test -- --run` |
| Full suite command | `D:\NodeJS\npm.cmd run verify` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CONF-01 | Token and password are server-only and not rendered or returned | unit/integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/config-boundary.test.ts` | Wave 1 |
| CONF-02 | App can build and start under self-hosted Next scripts | build | `D:\NodeJS\npm.cmd run build` | Wave 1 |
| CONF-03 | Unauthenticated user cannot access status or validation endpoints | integration | `D:\NodeJS\npm.cmd run test -- --run tests/auth/access-gate.test.ts` | Wave 1 |
| DATA-01 | `stock_basic` validation returns safe stock code/name sample or sanitized error | unit/integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/basic-data.test.ts` | Wave 2 |
| DATA-03 | Price basis result is machine-readable and explains fallback risk | unit | `D:\NodeJS\npm.cmd run test -- --run tests/validation/chip-price-validation.test.ts` | Wave 3 |
| DATA-04 | Tushare errors are classified and sanitized | unit | `D:\NodeJS\npm.cmd run test -- --run tests/validation/error-sanitizer.test.ts` | Wave 2 |
| CHIP-01 | Chip candidate interfaces are attempted and recorded as available/blocked/permission denied | unit/integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/chip-price-validation.test.ts` | Wave 3 |
| DEPL-02 | Missing/invalid token displays safe service configuration error | unit/integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/basic-data.test.ts` | Wave 2 |

### Sampling Rate

- **Per task commit:** `D:\NodeJS\npm.cmd run test -- --run`
- **Per wave merge:** `D:\NodeJS\npm.cmd run verify`
- **Phase gate:** `D:\NodeJS\npm.cmd run verify` and manual check of status workspace copy

### Wave 0 Gaps

- [ ] `package.json` test scripts
- [ ] `vitest.config.ts`
- [ ] `tests/validation/config-boundary.test.ts`
- [ ] `tests/auth/access-gate.test.ts`
- [ ] `tests/validation/basic-data.test.ts`
- [ ] `tests/validation/error-sanitizer.test.ts`
- [ ] `tests/validation/chip-price-validation.test.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Server-side password check and HTTP-only signed session cookie |
| V3 Session Management | yes | HTTP-only, same-site session cookie with expiry |
| V4 Access Control | yes | Middleware and route-handler guards protect pages and APIs |
| V5 Input Validation | yes | zod schemas for login and validation action boundaries |
| V6 Cryptography | yes | Node crypto HMAC for session signing; do not store raw password in client-visible places |
| V9 Communications | deployment-dependent | Self-host over HTTPS outside local dev |

### Known Threat Patterns for Phase 1

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tushare token disclosure | Information Disclosure | Server-only config, no raw responses, output scanning test |
| Password brute force | Denial of Service / Elevation | Generic error and same-origin route guard; heavy rate limiting deferred unless public exposure demands it |
| Session tampering | Tampering / Elevation | HMAC-signed HTTP-only cookie with expiry |
| Unauthenticated validation trigger | Elevation / DoS | Middleware and route guard block validation API without session |
| Raw error leakage | Information Disclosure | Error sanitizer maps exceptions to safe categories |
| Unverified package install | Tampering / Supply Chain | Package legitimacy gate before install |

## Sources

### Primary (HIGH confidence)

- https://nextjs.org/docs/app/getting-started/installation - Next.js installation and App Router scaffold path.
- https://nextjs.org/docs/app/guides/environment-variables - Next.js environment variable behavior and server/client exposure rules.
- https://nextjs.org/docs/app/api-reference/file-conventions/route - Route handler convention for status and validation APIs.
- https://nextjs.org/docs/app/guides/testing/vitest - Vitest guidance for Next.js apps.
- https://nextjs.org/docs/app/guides/self-hosting - Official self-hosting direction for Next.js.
- https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/client.py - Official Tushare client generic query shape.
- https://nodejs.org/en/about/previous-releases - Node.js LTS/release lifecycle.

### Secondary (MEDIUM confidence)

- https://ui.shadcn.com/docs - shadcn official documentation entry; CLI/package name still requires npm registry verification during execution.

### Tertiary (LOW confidence)

- `cyq_chips` / `cyq_perf` candidate names from project context and prior research; official docs were not fetchable in this sandbox because Tushare documentation pages require interactive site behavior.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - official framework docs support the shape, but local npm registry verification is blocked.
- Architecture: HIGH - server-only Tushare client and SQLite validation snapshots follow project constraints directly.
- Pitfalls: HIGH - token leakage, raw response leakage, quota-on-load, price-basis ambiguity, and chip endpoint assumptions are explicitly identified in project research and context.

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 for framework setup; Tushare endpoint availability must be rechecked at execution time with the user's token.
