---
phase: 06-charts-and-deployment
plan: "06-03"
subsystem: deployment
tags: [playwright, smoke, proxy, readme, self-hosting]

requires:
  - phase: 06-charts-and-deployment
    provides: "06-02 result table and inline chart user path"
provides:
  - "Cloud self-hosting and environment variable instructions"
  - "Playwright smoke verification for protected workspace, results table, and inline chart"
  - "Next 16 proxy-based access gate without middleware deprecation warning"
affects: [deployment, auth-boundary, smoke-tests, docs]

tech-stack:
  added:
    - "@playwright/test@1.61.0"
  patterns:
    - "Seeded smoke SQLite database isolated from real Tushare/tinyshare credentials"
    - "Optional PLAYWRIGHT_BROWSER_CHANNEL override for machines with system Chrome"

key-files:
  created:
    - .env.example
    - playwright.config.ts
    - src/proxy.ts
    - tests/smoke/app-smoke.spec.ts
    - tests/smoke/seed-smoke-db.ts
  modified:
    - README.md
    - package.json
    - package-lock.json
    - tests/auth/access-gate.test.ts
    - vitest.config.ts
  removed:
    - src/middleware.ts

key-decisions:
  - "Use seeded SQLite smoke data so page verification never calls real market data providers."
  - "Keep `npm run verify` focused on typecheck, lint, unit/component tests, and production build; run browser smoke separately."
  - "Use Next 16 `proxy.ts` naming while preserving the existing auth behavior."

requirements-completed: [DEPL-01, DEPL-03]

duration: 35 min
completed: 2026-06-23
---

# Phase 06 Plan 03: Deployment And Smoke Verification Summary

**The project now has deployment instructions, placeholder environment configuration, proxy-based access protection, and a browser smoke test for the final v1 screen.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-06-23T14:35:00Z
- **Completed:** 2026-06-23T15:00:00Z
- **Tasks:** 4
- **Files modified:** 10

## Accomplishments

- Added `.env.example` with placeholders only.
- Reworked `README.md` to cover local setup, tinyshare dependency setup, cloud self-hosting, PM2 startup, and verification commands.
- Added `@playwright/test`, `playwright.config.ts`, and a seeded smoke test that logs in, verifies the results table, selects a stock row, and checks that the K-line canvas renders.
- Migrated the access gate from `src/middleware.ts` to `src/proxy.ts` and updated auth tests.
- Excluded `tests/smoke/**` from Vitest so browser tests and unit tests do not execute each other.

## Task Commits

Tasks 1-4 were implemented in a combined execution commit:

1. **Tasks 1-4: smoke verification, proxy migration, and deployment docs** - `a58d39b` (`feat(06-03): add deployment smoke verification`)

**Plan metadata:** committed separately with this summary.

## Files Created/Modified

- `.env.example` - Placeholder-only environment variable template.
- `README.md` - Local run, cloud deployment, tinyshare setup, verification, and current capabilities.
- `playwright.config.ts` - Smoke test web server, seeded database setup, safe test env vars, and optional browser channel override.
- `tests/smoke/app-smoke.spec.ts` - Browser smoke test for login, results table, row selection, and chart canvas.
- `tests/smoke/seed-smoke-db.ts` - Deterministic smoke database seed.
- `src/proxy.ts` - Next 16 request boundary for auth protection.
- `tests/auth/access-gate.test.ts` - Updated to test `proxy`.
- `vitest.config.ts` - Excludes smoke tests from Vitest.
- `package.json` / `package-lock.json` - Adds Playwright dependency and `npm run smoke`.

## Decisions Made

- Kept Docker/systemd out of scope and documented PM2 as the simpler personal-server option.
- Did not embed or echo any real token/password in committed files.
- Documented the system Chrome fallback for local smoke runs when Playwright Chromium download is unavailable.

## Deviations from Plan

- `npm run smoke` could not use Playwright's bundled Chromium until the browser package is installed. The local machine had Chrome available, so the smoke test was verified with `PLAYWRIGHT_BROWSER_CHANNEL=chrome`; README documents both the default Chromium install path and the Chrome fallback.

## Issues Encountered

- The first smoke run failed because the Playwright browser binary was not installed.
- A timed browser install left an active Playwright download lock until the process exited.
- Vitest initially picked up the Playwright smoke spec during `npm run verify`; `tests/smoke/**` is now excluded from Vitest.
- `npm install` reported 2 moderate vulnerabilities. No force upgrade was applied because that would be a dependency policy change outside this plan.

## User Setup Required

- For default smoke checks on a new machine, run `npx playwright install chromium` before `npm run smoke`.
- If Chromium download fails on a Windows machine with Chrome installed, run `$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"; npm run smoke`.

## Verification

- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint`
- `D:\NodeJS\npm.cmd run verify`
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='chrome'; D:\NodeJS\npm.cmd run smoke`

All final verification commands passed.

## Next Phase Readiness

Phase 06 implementation is ready for phase-level verification and milestone wrap-up.

---
*Phase: 06-charts-and-deployment*
*Completed: 2026-06-23*
