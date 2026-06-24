---
phase: 05
slug: results-table-experience
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
reviewed_at: 2026-06-24
---

# Phase 05 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run tests/results/results-snapshot.test.ts tests/ui/results-table.test.tsx` |
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
| 05-01-01 | 05-01 | 1 | UI-01, UI-02 | N/A | Snapshot fixtures cover unavailable, empty, ready and stale chip joins | unit/store | `npm run test -- --run tests/results/results-snapshot.test.ts` | yes | green |
| 05-01-02 | 05-01 | 1 | UI-01, UI-02 | N/A | Snapshot reads persisted rows only and keeps chip states explicit | unit/store | `npm run test -- --run tests/results/results-snapshot.test.ts` | yes | green |
| 05-01-03 | 05-01 | 1 | UI-01, UI-02 | N/A | Required columns and formatted values render in protected workspace | UI | `npm run test -- --run tests/results/results-snapshot.test.ts tests/ui/results-table.test.tsx` | yes | green |
| 05-02-01 | 05-02 | 2 | UI-03 | N/A | Sorting direction, defaults and unavailable chip ordering are defined | UI | `npm run test -- --run tests/ui/results-table.test.tsx` | yes | green |
| 05-02-02 | 05-02 | 2 | UI-03 | N/A | Accessible deterministic sorting uses stock-code tie-break | UI | `npm run test -- --run tests/ui/results-table.test.tsx` | yes | green |
| 05-02-03 | 05-02 | 2 | UI-04 | N/A | Empty/unavailable page states remain distinct from row-level chip states | UI | `npm run test -- --run tests/ui/results-table.test.tsx` | yes | green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- [x] `tests/results/results-snapshot.test.ts`
- [x] `tests/ui/results-table.test.tsx`

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All executable tasks have automated verification.
- [x] Sampling continuity is complete.
- [x] Wave 0 dependencies exist and run green.
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
