---
phase: 09
slug: incremental-refresh-workflow
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-27
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> This strategy is bound to the finalized Phase 09 plan set.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.*` / package scripts |
| **Quick run command** | `npm run test -- --run tests/refresh/market-data-store.test.ts tests/refresh/refresh-runner.test.ts` |
| **Full suite command** | `npm run verify` |
| **Estimated runtime** | Focused tests should stay under local practical runtime; full `npm run verify` remains the final gate |

---

## Sampling Rate

- **After every task commit:** Run the smallest test command covering the changed unit listed below.
- **After every plan wave:** Run `npm run test -- --run tests/refresh/market-data-store.test.ts tests/refresh/refresh-runner.test.ts tests/ui/status-workspace.test.tsx tests/chip/chip-runner.test.ts`.
- **Before `$gsd-verify-work`:** `npm run verify` must be green.
- **Max feedback latency:** keep quick checks scoped by subsystem; if they become slow, split by touched test file.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 09-01 | 1 | REFR-10, UI-07 | — | Operation/stage snapshots expose sanitized progress without token/path/provider payload leakage. | unit | `npm run test -- --run tests/refresh/refresh-store.test.ts` | ✅ | ⬜ pending |
| 09-01-02 | 09-01 | 1 | DATA-07, REFR-09, REFR-13 | — | Existing active cache is not corrupted; daily/factor gaps are planned independently. | unit | `npm run test -- --run tests/refresh/market-data-store.test.ts` | ✅ | ⬜ pending |
| 09-02-01 | 09-02 | 2 | DATA-07, REFR-09, REFR-13 | — | Ordinary refresh requests only missing/failed data items and preserves partial successes. | integration | `npm run test -- --run tests/refresh/refresh-runner.test.ts` | ✅ | ⬜ pending |
| 09-02-02 | 09-02 | 2 | REFR-09, REFR-11 | — | Screening reads only complete target dates and publishes only after paired-success readiness. | integration | `npm run test -- --run tests/refresh/market-data-reader.test.ts tests/refresh/refresh-runner.test.ts tests/screening/screening-runner.test.ts` | ✅ | ⬜ pending |
| 09-02-03 | 09-02 | 2 | REFR-10, REFR-11, UI-06 | — | Chip failure updates chip-stage status but does not fail the completed refresh. | integration | `npm run test -- --run tests/refresh/refresh-runner.test.ts tests/chip/chip-runner.test.ts` | ✅ | ⬜ pending |
| 09-03-01 | 09-03 | 2 | REFR-10, REFR-12 | — | Full rebuild keeps old active cache on failure and uses the operation lock. | unit | `npm run test -- --run tests/refresh/bootstrap-market-data.test.ts tests/refresh/full-rebuild-runner.test.ts` | ✅ / ❌ W0 | ⬜ pending |
| 09-03-02 | 09-03 | 2 | REFR-12 | — | CLI help is safe and does not expose secrets; rebuild remains operations-only. | unit/cli | `npm run rebuild:market -- --help` | ❌ W0 | ⬜ pending |
| 09-04-01 | 09-04 | 3 | REFR-10, UI-06, UI-07 | — | UI exposes sanitized stage progress and keeps results visible during chip processing. | component | `npm run test -- --run tests/ui/status-workspace.test.tsx` | ✅ | ⬜ pending |
| 09-04-02 | 09-04 | 3 | REFR-11, UI-06 | — | UI refreshes server snapshots on screening/chip markers without waiting for chip completion. | component | `npm run test -- --run tests/ui/status-workspace.test.tsx` | ✅ | ⬜ pending |
| 09-04-03 | 09-04 | 3 | REFR-12, UI-07 | — | Web UI has no full-rebuild entry and still passes workspace smoke coverage. | smoke | `npm run smoke -- --project=chromium tests/smoke/app-smoke.spec.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers current tests for refresh store, market store, runner, chip runner, UI component, and smoke paths.
- [ ] Create `tests/refresh/full-rebuild-runner.test.ts` in Plan 09-03 before relying on its command.
- [ ] Add `rebuild:market` script in Plan 09-03 before running CLI help verification.
- [ ] Confirm exact quick-test runtime after the first implementation wave.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full rebuild is operations-only | REFR-13 | Web absence is partly a product-surface review. | Confirm there is no visible full-rebuild action in the page and no web API route that triggers high-cost rebuild. |
| Stage progress is understandable during a real refresh | UI-06, UI-07 | Timing/progress perception is hard to fully prove in component tests. | Run the app, trigger refresh, observe 股票列表/行情/筛选/筹码阶段 statuses and sanitized failure display. |

---

## Validation Sign-Off

- [x] All final plan tasks have automated verify commands or explicit Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [ ] Feedback latency is measured and acceptable for the task size.
- [x] `nyquist_compliant: true` set in frontmatter after final plan binding.

**Approval:** approved 2026-06-27
