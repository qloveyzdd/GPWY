---
phase: 03
slug: downtrend-screening-engine
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
reviewed_at: 2026-06-24
---

# Phase 03 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run tests/screening/indicators.test.ts tests/screening/downtrend-screen.test.ts tests/screening/screening-store.test.ts tests/screening/screening-runner.test.ts` |
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
| 03-01-01 | 03-01 | 1 | SCRN-01, SCRN-02, SCRN-03, SCRN-08 | N/A | MA and slope edge cases are defined as pure fixtures | unit | `npm run test -- --run tests/screening/indicators.test.ts` | yes | green |
| 03-01-02 | 03-01 | 1 | SCRN-01, SCRN-02, SCRN-03 | N/A | Chronological MA20/MA60 and 5-point slope helpers are deterministic | unit | `npm run test -- --run tests/screening/indicators.test.ts` | yes | green |
| 03-02-01 | 03-02 | 2 | SCRN-04, SCRN-05, SCRN-06, SCRN-08 | N/A | Current interval-high regression cases and threshold boundary are defined | unit | `npm run test -- --run tests/screening/downtrend-screen.test.ts` | yes | green |
| 03-02-02 | 03-02 | 2 | SCRN-02, SCRN-03, SCRN-04, SCRN-05, SCRN-06, SCRN-07 | N/A | Evaluator walks backward while previous high is greater and emits explainable values | unit | `npm run test -- --run tests/screening/indicators.test.ts tests/screening/downtrend-screen.test.ts` | yes | green |
| 03-03-01 | 03-03 | 3 | SCRN-07, SCRN-08 | N/A | Store and runner fixtures cover latest-cache reads and accepted-only persistence | store/integration | `npm run test -- --run tests/screening/screening-store.test.ts tests/screening/screening-runner.test.ts` | yes | green |
| 03-03-02 | 03-03 | 3 | SCRN-01, SCRN-02, SCRN-03, SCRN-04, SCRN-05, SCRN-06, SCRN-07, SCRN-08 | N/A | Cache-driven screening persists source job and all computed values | integration | `npm run test -- --run tests/screening/indicators.test.ts tests/screening/downtrend-screen.test.ts tests/screening/screening-store.test.ts tests/screening/screening-runner.test.ts` | yes | green |

## Superseded Plan Language

`03-02-PLAN.md` and its historical summary describe the original local-high/fallback algorithm. The canonical requirement was changed after user validation. Nyquist coverage uses the current implementation and regression tests:

- move backward only while the previous trading day's high is strictly greater;
- stop on lower or equal high;
- latest-day new high becomes the interval high;
- `002930` and `301608` examples are covered.

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- [x] `tests/screening/indicators.test.ts`
- [x] `tests/screening/downtrend-screen.test.ts`
- [x] `tests/screening/screening-store.test.ts`
- [x] `tests/screening/screening-runner.test.ts`

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All executable tasks have automated verification.
- [x] Sampling continuity is complete.
- [x] Wave 0 dependencies exist and run green.
- [x] Current requirements override superseded historical plan wording.
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
