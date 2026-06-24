---
phase: 01
slug: tushare-data-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-23
reviewed_at: 2026-06-24
---

# Phase 01 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run tests/auth/access-gate.test.ts tests/validation/config-boundary.test.ts tests/validation/basic-data.test.ts tests/validation/error-sanitizer.test.ts tests/validation/chip-price-validation.test.ts tests/validation/tinyshare-provider.test.ts tests/validation/status-store.test.ts tests/ui/status-workspace.test.tsx` |
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
| 01-01-01 | 01-01 | 1 | CONF-02 | T-01-SC | Package legitimacy approval is recorded before installation | manual gate | See Manual-Only Verifications | N/A | green |
| 01-01-02 | 01-01 | 1 | CONF-02 | T-01-SC | Build and test scripts remain runnable | build | `npm run verify` | yes | green |
| 01-01-03 | 01-01 | 1 | CONF-01, CONF-03, DEPL-02 | Auth boundary and server-only secrets remain protected | unit/integration/UI | `npm run test -- --run tests/auth/access-gate.test.ts tests/validation/config-boundary.test.ts tests/validation/status-store.test.ts tests/ui/status-workspace.test.tsx` | yes | green |
| 01-02-01 | 01-02 | 2 | CONF-01, DATA-04 | Tushare errors are classified and sanitized before exposure | unit | `npm run test -- --run tests/validation/error-sanitizer.test.ts tests/validation/config-boundary.test.ts` | yes | green |
| 01-02-02 | 01-02 | 2 | DATA-01, DATA-03, DATA-04, DEPL-02 | Protected validation records safe stock/price status | unit/integration | `npm run test -- --run tests/validation/basic-data.test.ts tests/validation/error-sanitizer.test.ts` | yes | green |
| 01-03-01 | 01-03 | 3 | CHIP-01, DATA-03, DATA-04 | Chip/price probes expose capability states without estimates | unit | `npm run test -- --run tests/validation/chip-price-validation.test.ts tests/validation/tinyshare-provider.test.ts` | yes | green |
| 01-03-02 | 01-03 | 3 | CHIP-01, DATA-03, DEPL-02 | Status UI renders sanitized provider outcomes | UI | `npm run test -- --run tests/ui/status-workspace.test.tsx tests/validation/config-boundary.test.ts` | yes | green |
| 01-03-03 | 01-03 | 3 | CHIP-01, DATA-01 | Tinyshare bridge preserves generic API shape and UTF-8 data | integration | `npm run test -- --run tests/validation/tinyshare-provider.test.ts tests/validation/basic-data.test.ts` | yes | green |

## Wave 0 Requirements

- [x] `package.json` verification scripts
- [x] `vitest.config.ts`
- [x] `tests/auth/access-gate.test.ts`
- [x] `tests/validation/config-boundary.test.ts`
- [x] `tests/validation/status-store.test.ts`
- [x] `tests/validation/basic-data.test.ts`
- [x] `tests/validation/error-sanitizer.test.ts`
- [x] `tests/validation/chip-price-validation.test.ts`
- [x] `tests/validation/tinyshare-provider.test.ts`
- [x] `tests/ui/status-workspace.test.tsx`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package legitimacy approval | CONF-02 | External registry review is a human supply-chain gate | Review package names and postinstall metadata before first installation. Completed with `approve-verified-packages` on 2026-06-23. |
| Real account can access configured stock/price/chip endpoints | DATA-01, DATA-03, CHIP-01 | Requires private token, current provider permissions and quota | Run data-source validation from the protected workspace and confirm safe success/warning/blocked states. Real tinyshare probes and user approval completed on 2026-06-23. |

## Validation Sign-Off

- [x] All executable tasks have automated verification; manual gates are explicitly documented.
- [x] Sampling continuity: no 3 consecutive executable tasks without automated verification.
- [x] Wave 0 dependencies exist and run green.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 20 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

## Validation Audit 2026-06-24

| Metric | Count |
|--------|-------|
| Gaps found | 9 stale pending/Wave 0 entries |
| Resolved | 9 |
| Escalated | 0 |

**Approval:** approved 2026-06-24
