---
phase: 01
slug: tushare-data-foundation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-23
reviewed_at: 2026-06-23
---

# Phase 01 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library |
| **Config file** | `vitest.config.ts` created in plan 01-01 |
| **Quick run command** | `D:\NodeJS\npm.cmd run test -- --run` |
| **Full suite command** | `D:\NodeJS\npm.cmd run verify` |
| **Estimated runtime** | under 60 seconds after dependencies install |

## Sampling Rate

- **After every task commit:** Run `D:\NodeJS\npm.cmd run test -- --run`
- **After every plan wave:** Run `D:\NodeJS\npm.cmd run verify`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | CONF-02 | T-01-SC | Packages verified before install | registry/build | `D:\NodeJS\npm.cmd run verify` | W1 | pending |
| 01-01-02 | 01-01 | 1 | CONF-01, CONF-03, DEPL-02 | T-01-01/T-01-02/T-01-03 | Access gate protects page/API and secrets stay server-only | unit/integration | `D:\NodeJS\npm.cmd run test -- --run tests/auth/access-gate.test.ts tests/validation/config-boundary.test.ts` | W1 | pending |
| 01-01-03 | 01-01 | 1 | CONF-02 | T-01-04 | Status page reads/writes SQLite validation snapshots only | unit/integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/status-store.test.ts tests/ui/status-workspace.test.tsx` | W1 | pending |
| 01-02-01 | 01-02 | 2 | DATA-01, DATA-04, DEPL-02 | T-01-05/T-01-06 | Tushare client sanitizes errors and never returns token | unit | `D:\NodeJS\npm.cmd run test -- --run tests/validation/basic-data.test.ts tests/validation/error-sanitizer.test.ts` | W2 | pending |
| 01-02-02 | 01-02 | 2 | DATA-01, DATA-03, DATA-04 | T-01-06 | Basic data validation records safe sample and price-basis probe result | unit/integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/basic-data.test.ts` | W2 | pending |
| 01-03-01 | 01-03 | 3 | CHIP-01, DATA-03, DATA-04 | T-01-07 | Chip/price probes record available, blocked, or permission states without estimates | unit | `D:\NodeJS\npm.cmd run test -- --run tests/validation/chip-price-validation.test.ts` | W3 | pending |
| 01-03-02 | 01-03 | 3 | CHIP-01, DATA-03, DEPL-02 | T-01-08 | Status UI displays sanitized chip and price-basis results | UI contract | `D:\NodeJS\npm.cmd run test -- --run tests/ui/status-workspace.test.tsx` | W3 | pending |

## Wave 0 Requirements

- [ ] `package.json` scripts: `test`, `typecheck`, `lint`, `build`, `verify`
- [ ] `vitest.config.ts`
- [ ] `tests/auth/access-gate.test.ts`
- [ ] `tests/validation/config-boundary.test.ts`
- [ ] `tests/validation/status-store.test.ts`
- [ ] `tests/validation/basic-data.test.ts`
- [ ] `tests/validation/error-sanitizer.test.ts`
- [ ] `tests/validation/chip-price-validation.test.ts`
- [ ] `tests/ui/status-workspace.test.tsx`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Tushare token can access stock/basic/price/chip candidate endpoints | DATA-01, DATA-03, CHIP-01 | Requires user's private `TUSHARE_TOKEN` and account permissions | Run the local app with `.env.local`, log in, click `重新验证数据源`, and confirm status sections show safe success/warning/blocked states without raw token or payload. |
| Package legitimacy review if npm registry verification fails | CONF-02 | Local sandbox cannot complete npm/slopcheck checks | If execution cannot verify a package with `npm.cmd view`, review the package list before allowing install. |

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency target < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-23
