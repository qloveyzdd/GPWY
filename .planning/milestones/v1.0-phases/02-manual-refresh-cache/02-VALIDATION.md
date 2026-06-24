---
phase: 02
slug: manual-refresh-cache
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
reviewed_at: 2026-06-24
---

# Phase 02 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run tests/refresh/refresh-store.test.ts tests/refresh/refresh-runner.test.ts tests/refresh/fetch-refresh-data.test.ts tests/auth/access-gate.test.ts tests/ui/status-workspace.test.tsx` |
| **Full suite command** | `npm run verify` |
| **Estimated runtime** | under 20 seconds |

## Sampling Rate

- **After every task commit:** Run the task-specific command below.
- **After every plan wave:** Run `npm run verify`.
- **Before phase verification:** Full suite must be green.
- **Max feedback latency:** 20 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 1 | REFR-02, REFR-03, REFR-05 | N/A | Store fixtures define lock and latest-success semantics | unit/store | `npm run test -- --run tests/refresh/refresh-store.test.ts` | yes | green |
| 02-01-02 | 02-01 | 1 | REFR-02, REFR-03, REFR-05 | N/A | SQLite permits one running job and isolates failed snapshots | unit/store | `npm run test -- --run tests/refresh/refresh-store.test.ts` | yes | green |
| 02-02-01 | 02-02 | 2 | REFR-01, REFR-02, REFR-03 | N/A | Controller behavior is defined without real provider calls | unit | `npm run test -- --run tests/refresh/refresh-runner.test.ts` | yes | green |
| 02-02-02 | 02-02 | 2 | REFR-01, REFR-02, REFR-03 | N/A | Refresh APIs require auth and persist sanitized outcomes | integration | `npm run test -- --run tests/refresh/refresh-runner.test.ts tests/auth/access-gate.test.ts` | yes | green |
| 02-02-03 | 02-02 | 2 | REFR-01, REFR-04 | N/A | UI starts refresh, shows running state and polls completion | UI | `npm run test -- --run tests/ui/status-workspace.test.tsx` | yes | green |
| 02-03-01 | 02-03 | 3 | DATA-02, REFR-03 | N/A | Provider fetch fixtures cover 60 trading dates and OHLCV | unit | `npm run test -- --run tests/refresh/fetch-refresh-data.test.ts` | yes | green |
| 02-03-02 | 02-03 | 3 | DATA-02 | N/A | Fetcher skips empty dates, retries safely and applies adjustment factors | unit | `npm run test -- --run tests/refresh/fetch-refresh-data.test.ts` | yes | green |
| 02-03-03 | 02-03 | 3 | DATA-02, REFR-03, REFR-05 | N/A | Default worker writes provider data and latest cache stats | integration | `npm run test -- --run tests/refresh/fetch-refresh-data.test.ts tests/refresh/refresh-runner.test.ts tests/refresh/refresh-store.test.ts` | yes | green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- [x] `tests/refresh/refresh-store.test.ts`
- [x] `tests/refresh/refresh-runner.test.ts`
- [x] `tests/refresh/fetch-refresh-data.test.ts`
- [x] `tests/auth/access-gate.test.ts`
- [x] `tests/ui/status-workspace.test.tsx`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full-market refresh succeeds with the configured provider | DATA-02, REFR-01 | Depends on private credentials, current provider availability and quota | Log in, start manual refresh and confirm succeeded status/cache counts or a sanitized provider failure. This supplements mocked automated coverage. |

## Validation Sign-Off

- [x] All executable tasks have automated verification.
- [x] Sampling continuity is complete.
- [x] Wave 0 dependencies exist and run green.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 20 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

## Validation Audit 2026-06-24

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Approval:** approved 2026-06-24
