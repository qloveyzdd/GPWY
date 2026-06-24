---
phase: 06
slug: charts-and-deployment
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
reviewed_at: 2026-06-24
---

# Phase 06 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library + Playwright |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npm run test -- --run tests/refresh/refresh-runner.test.ts tests/results/chart-data.test.ts tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx tests/ui/status-workspace.test.tsx tests/auth/access-gate.test.ts tests/deployment/deployment-contract.test.ts` |
| **Full suite command** | `npm run verify` and `$env:PLAYWRIGHT_BROWSER_CHANNEL='chrome'; npm run smoke` |
| **Estimated runtime** | under 30 seconds |

## Sampling Rate

- **After every task commit:** Run the task-specific command below.
- **After every plan wave:** Run `npm run verify`.
- **Before phase verification:** Run the full suite and browser smoke.
- **Max feedback latency:** 30 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 06-01 | 1 | CHRT-06 | N/A | Full refresh workflow and failure semantics are defined | integration | `npm run test -- --run tests/refresh/refresh-runner.test.ts` | yes | green |
| 06-01-02 | 06-01 | 1 | CHRT-06 | N/A | Current-job cache feeds screening; chip failure remains non-fatal | integration | `npm run test -- --run tests/refresh/refresh-runner.test.ts tests/screening/screening-runner.test.ts tests/chip/chip-runner.test.ts` | yes | green |
| 06-01-03 | 06-01 | 1 | CHRT-06 | N/A | Chart snapshot reuses persisted row values and job-scoped bars | unit/integration | `npm run test -- --run tests/results/chart-data.test.ts tests/auth/access-gate.test.ts` | yes | green |
| 06-01-04 | 06-01 | 1 | CHRT-06 | N/A | UI refreshes server snapshots once workflow polling completes | UI | `npm run test -- --run tests/ui/status-workspace.test.tsx` | yes | green |
| 06-02-01 | 06-02 | 2 | CHRT-01, CHRT-02 | N/A | Chart loading/unavailable/ready states are DOM-testable | UI | `npm run test -- --run tests/ui/stock-kline-chart.test.tsx` | yes | green |
| 06-02-02 | 06-02 | 2 | CHRT-02, CHRT-03, CHRT-04, CHRT-05, CHRT-06 | N/A | Candlestick, MA and official overlay options are deterministic | UI | `npm run test -- --run tests/ui/stock-kline-chart.test.tsx` | yes | green |
| 06-02-03 | 06-02 | 2 | CHRT-01 | N/A | Accessible row selection controls inline chart placement | UI | `npm run test -- --run tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx` | yes | green |
| 06-02-04 | 06-02 | 2 | CHRT-01, CHRT-06 | N/A | Selected stock loads protected chart data without shifting table layout | UI | `npm run test -- --run tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx` | yes | green |
| 06-03-01 | 06-03 | 3 | DEPL-03 | N/A | Seeded smoke logs in and verifies table, top-three peaks and canvas | browser | `$env:PLAYWRIGHT_BROWSER_CHANNEL='chrome'; npm run smoke` | yes | green |
| 06-03-02 | 06-03 | 3 | DEPL-03 | N/A | Proxy keeps page and API auth behavior unchanged | unit/build | `npm run test -- --run tests/auth/access-gate.test.ts` | yes | green |
| 06-03-03 | 06-03 | 3 | DEPL-01 | N/A | README and placeholder env expose required self-host contract without secrets | contract | `npm run test -- --run tests/deployment/deployment-contract.test.ts` | yes | green |
| 06-03-04 | 06-03 | 3 | DEPL-03 | N/A | Verification scripts retain typecheck, lint, unit, build and smoke coverage | contract/full | `npm run verify` | yes | green |

## Wave 0 Requirements

Existing infrastructure plus the retroactive deployment contract cover all phase requirements:

- [x] `tests/refresh/refresh-runner.test.ts`
- [x] `tests/results/chart-data.test.ts`
- [x] `tests/ui/results-table.test.tsx`
- [x] `tests/ui/stock-kline-chart.test.tsx`
- [x] `tests/ui/status-workspace.test.tsx`
- [x] `tests/auth/access-gate.test.ts`
- [x] `tests/smoke/app-smoke.spec.ts`
- [x] `tests/smoke/seed-smoke-db.ts`
- [x] `tests/deployment/deployment-contract.test.ts`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App starts on the target cloud host behind the chosen process manager/reverse proxy | DEPL-01 | Host networking, process manager and DNS are environment-specific | Follow README self-host commands on the target server, log in and run `npm run verify` plus browser smoke. Automated contract tests validate the documented command surface. |

## Validation Sign-Off

- [x] All executable tasks have automated verification.
- [x] Sampling continuity is complete.
- [x] Wave 0 dependencies exist and run green.
- [x] Deployment documentation has an automated contract test.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 30 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

## Validation Audit 2026-06-24

| Metric | Count |
|--------|-------|
| Gaps found | 1 deployment documentation contract |
| Resolved | 1 |
| Escalated | 0 |

**Approval:** approved 2026-06-24
