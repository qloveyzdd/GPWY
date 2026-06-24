# Phase 01: Tushare Data Foundation - Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 22 planned new files
**Analogs found:** 0 / 22

## Summary

The repository has no application source code yet. There are no existing controllers, route handlers, components, services, database modules, tests, or styling files to use as analogs.

Planner and executor should treat these artifacts as the source of implementation patterns:

- `.planning/phases/01-tushare-data-foundation/01-RESEARCH.md`
- `.planning/phases/01-tushare-data-foundation/01-UI-SPEC.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/STACK.md`

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` | config | package scripts | none | no analog |
| `components.json` | config | shadcn registry config | none | no analog |
| `vitest.config.ts` | config | test runner | none | no analog |
| `src/app/layout.tsx` | route shell | render | none | no analog |
| `src/app/page.tsx` | route page | request-response/render | none | no analog |
| `src/app/api/status/route.ts` | route handler | request-response | none | no analog |
| `src/app/api/validation/run/route.ts` | route handler | request-response | none | no analog |
| `src/middleware.ts` | middleware | request-response guard | none | no analog |
| `src/components/status/status-workspace.tsx` | component | render + interaction | none | no analog |
| `src/lib/config.ts` | utility | env validation | none | no analog |
| `src/lib/auth/session.ts` | service | cookie/session | none | no analog |
| `src/lib/validation-store.ts` | storage service | SQLite read/write | none | no analog |
| `src/lib/tushare/client.ts` | service | external API request-response | none | no analog |
| `src/lib/tushare/endpoints.ts` | config | endpoint registry | none | no analog |
| `src/lib/tushare/types.ts` | model/types | transform | none | no analog |
| `src/lib/validation/run-basic-validation.ts` | service | external API + storage summary | none | no analog |
| `src/lib/validation/chip-and-price-validation.ts` | service | external API + transform | none | no analog |
| `src/lib/validation/result-sanitizer.ts` | utility | error transform | none | no analog |
| `tests/auth/access-gate.test.ts` | test | integration | none | no analog |
| `tests/validation/basic-data.test.ts` | test | unit/integration | none | no analog |
| `tests/validation/chip-price-validation.test.ts` | test | unit | none | no analog |
| `tests/ui/status-workspace.test.tsx` | test | component render | none | no analog |

## Pattern Assignments

No code analogs exist. Use these researched patterns instead:

### Route Handlers

**Source:** `01-RESEARCH.md` Pattern 1 and Pattern 2
**Apply to:** `src/app/api/status/route.ts`, `src/app/api/validation/run/route.ts`

Required pattern:
- Authenticate server-side before doing any work.
- Use zod for request/env boundary validation.
- Return sanitized result objects only.
- Do not import Tushare client from `GET /api/status`.

### Server-only Tushare Client

**Source:** `01-RESEARCH.md` Pattern 2
**Apply to:** `src/lib/tushare/client.ts`, `src/lib/tushare/endpoints.ts`, `src/lib/tushare/types.ts`

Required pattern:
- One generic `apiName + params + fields` request function.
- Endpoint registry keeps candidate names and requested fields centralized.
- All errors pass through sanitizer before UI or storage sees them.

### Status UI

**Source:** `01-UI-SPEC.md`
**Apply to:** `src/components/status/status-workspace.tsx`, `src/app/page.tsx`

Required pattern:
- Operational diagnostics console, not a landing page.
- Full status panel with summary strip and section bands.
- Use shadcn official components and lucide icons.
- Display `未验证`, `正常`, `警告`, `阻塞` status labels.
- Never render raw Tushare payloads or secrets.

## Shared Patterns

### Authentication and Access Control

**Source:** `01-CONTEXT.md` D-01 through D-04
**Apply to:** `src/middleware.ts`, all app routes, all API route handlers

Required pattern:
- App password comes from server env.
- HTTP-only session protects pages and validation APIs.
- Password failures use generic copy only.

### Error Handling

**Source:** `01-CONTEXT.md` D-07, `01-RESEARCH.md` Common Pitfalls
**Apply to:** Tushare client, validation runners, API handlers, status UI

Required pattern:
- Classify errors as missing_config, invalid_token, permission_denied, empty_data, rate_limited, network_or_service, or unknown.
- Store/display safe category, affected interface, and next step.
- Do not store/display raw exception objects.

### Validation Sampling

**Source:** `01-VALIDATION.md`
**Apply to:** every plan task

Required pattern:
- Every implementation task includes an automated Vitest/build/typecheck verification.
- Full phase gate is `D:\NodeJS\npm.cmd run verify`.

## No Analog Found

All planned application files have no codebase analog because this is the first application scaffold.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| All Phase 1 application files | mixed | mixed | Repository contains only planning artifacts and `AGENTS.md`. |

## Metadata

**Analog search scope:** repository root, excluding `.git`
**Files scanned:** planning artifacts only; no `src/`, `app/`, `components/`, `package.json`, or test files exist
**Pattern extraction date:** 2026-06-23
