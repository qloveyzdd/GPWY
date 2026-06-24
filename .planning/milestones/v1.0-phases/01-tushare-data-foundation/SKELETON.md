# Walking Skeleton - A Stock Downtrend Screener

**Phase:** 1
**Generated:** 2026-06-23

## Capability Proven End-to-End

A password-authenticated personal user can open the status workspace, read the last SQLite validation snapshot, trigger a protected server-side Tushare validation run, and see a sanitized result written back to SQLite.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js App Router with TypeScript | One self-hosted app can own pages, route handlers, server-only config, and validation APIs. |
| Data layer | SQLite via a small validation snapshot store | Phase 1 needs one real read/write for last validation status without building the later full refresh cache. |
| Auth | App password plus HTTP-only signed session cookie | Matches personal-use requirement and avoids a full account system. |
| Deployment target | Self-hosted Node process | Project target is a cloud server, not a serverless runtime. |
| Directory layout | `src/app`, `src/components`, `src/lib/auth`, `src/lib/tushare`, `src/lib/validation` | Separates UI, access control, external API, and validation logic for later phases. |

## Stack Touched in Phase 1

- [ ] Project scaffold: Next.js, TypeScript, lint, test runner, shadcn official component setup.
- [ ] Routing: at least one protected page and two protected route handlers.
- [ ] Database: SQLite validation snapshot read and write.
- [ ] UI: status workspace button wired to the validation API.
- [ ] Local full-stack run command: `D:\NodeJS\npm.cmd run dev`.

## Out of Scope (Deferred to Later Slices)

- Full-market refresh cache.
- Downtrend screening calculations.
- Final screening results table.
- Stock detail chart.
- Automated daily refresh.
- Multi-user accounts.
- Non-Tushare primary data sources.
- Estimated chip peak calculation.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without changing these architectural decisions:

- Phase 2: Manual refresh cache and refresh status records.
- Phase 3: Downtrend screening engine over cached market data.
- Phase 4: Chip peak extraction and blocked-state handling for selected candidates.
- Phase 5: Latest results table with sorting and empty/failure states.
- Phase 6: Per-stock chart and cloud self-hosting hardening.
