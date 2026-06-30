---
phase: 10
slug: dual-day-chip-distribution
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-29
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.mts` |
| **Quick run command** | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-distribution-store.test.ts tests/chip/chip-runner.test.ts` |
| **Full suite command** | `D:\NodeJS\npm.cmd run verify` |
| **Estimated runtime** | ~90-180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific Vitest command.
- **After every plan wave:** Run `D:\NodeJS\npm.cmd run typecheck` plus affected Vitest files.
- **Before `$gsd-verify-work`:** `D:\NodeJS\npm.cmd run verify` must be green.
- **Max feedback latency:** 180 seconds for quick feedback.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | CHIP-07, CHIP-08, CHIP-10 | T-10-01 | Error summaries remain sanitized; no token/path/provider payload stored in visible DTOs | unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-distribution-store.test.ts` | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | CHIP-07, CHIP-08, CHIP-10 | T-10-02 | Date-level status prevents successful data from being hidden by another date failure | unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-distribution-store.test.ts` | ✅ | ⬜ pending |
| 10-02-01 | 02 | 2 | CHIP-05, CHIP-06, CHIP-09, CHIP-10 | T-10-03 | Provider calls use scheduler priority and do not add unbounded concurrency | unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-runner.test.ts` | ✅ | ⬜ pending |
| 10-02-02 | 02 | 2 | CHIP-05, CHIP-06, CHIP-09, CHIP-10 | T-10-04 | Missing/blocked/failed reasons are persisted as sanitized categories and summaries | unit | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-runner.test.ts` | ✅ | ⬜ pending |
| 10-03-01 | 03 | 3 | CHIP-07, CHIP-10 | T-10-05 | Previous-day success is never shown as latest-day chip peak | unit | `D:\NodeJS\npm.cmd run test -- --run tests/results/results-snapshot.test.ts tests/results/chart-data.test.ts` | ✅ | ⬜ pending |
| 10-04-01 | 04 | 3 | CHIP-05, CHIP-09, CHIP-10 | T-10-06 | Refresh chip stage exposes aggregate counts without leaking internal secrets | unit | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/refresh-runner.test.ts tests/ui/status-workspace.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing Vitest infrastructure covers all phase requirements. No Wave 0 setup is required.

---

## Manual-Only Verifications

All Phase 10 behaviors have automated verification. Manual UI review is deferred to Phase 11 because chart replacement is out of scope.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-29
