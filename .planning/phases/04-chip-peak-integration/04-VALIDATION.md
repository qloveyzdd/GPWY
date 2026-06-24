---
phase: 04
slug: chip-peak-integration
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
reviewed_at: 2026-06-24
---

# Phase 04 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run tests/chip/chip-peak.test.ts tests/chip/chip-store.test.ts tests/chip/chip-runner.test.ts` |
| **Full suite command** | `npm run verify` |
| **Estimated runtime** | under 15 seconds |

## Sampling Rate

- **After every task commit:** Run the task-specific command below.
- **After every plan wave:** Run `npm run verify`.
- **Before phase verification:** Full suite must be green.
- **Max feedback latency:** 15 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 04-01 | 1 | CHIP-02, CHIP-04 | N/A | Official rows, tie-breaks, top-three ranking and malformed input are defined | unit | `npm run test -- --run tests/chip/chip-peak.test.ts` | yes | green |
| 04-01-02 | 04-01 | 1 | CHIP-02, CHIP-04 | N/A | Parser uses latest `cyq_chips` rows and never estimates missing data | unit | `npm run test -- --run tests/chip/chip-peak.test.ts` | yes | green |
| 04-02-01 | 04-02 | 2 | CHIP-03, CHIP-04, REFR-05 | N/A | Store and runner fixtures define succeeded/blocked/failed persistence | store/integration | `npm run test -- --run tests/chip/chip-store.test.ts tests/chip/chip-runner.test.ts` | yes | green |
| 04-02-02 | 04-02 | 2 | CHIP-03, CHIP-04, REFR-05 | N/A | Official chip peaks and ranked levels persist without raw provider data | integration | `npm run test -- --run tests/chip/chip-peak.test.ts tests/chip/chip-store.test.ts tests/chip/chip-runner.test.ts` | yes | green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- [x] `tests/chip/chip-peak.test.ts`
- [x] `tests/chip/chip-store.test.ts`
- [x] `tests/chip/chip-runner.test.ts`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Current account can retrieve official chip distributions | CHIP-03, CHIP-04 | Depends on private provider permission and quota | Run a manual refresh and confirm top-three levels or an explicit sanitized blocked state. Automated tests cover both branches with mocked official responses. |

## Validation Sign-Off

- [x] All executable tasks have automated verification.
- [x] Sampling continuity is complete.
- [x] Wave 0 dependencies exist and run green.
- [x] No unverified estimate path exists.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 15 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

## Validation Audit 2026-06-24

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Approval:** approved 2026-06-24
