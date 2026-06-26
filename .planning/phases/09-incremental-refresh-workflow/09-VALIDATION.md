---
phase: 09
slug: incremental-refresh-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> This strategy is intentionally drafted before `09-PLAN.md` because Phase 09 is blocked by the UI-SPEC gate. Task IDs must be bound after UI-SPEC and PLAN generation.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.*` / package scripts |
| **Quick run command** | `npm run test -- --run tests/refresh/market-data-store.test.ts tests/refresh/refresh-runner.test.ts` |
| **Full suite command** | `npm run verify` |
| **Estimated runtime** | To be measured during execution |

---

## Sampling Rate

- **After every task commit:** Run the smallest test command covering the changed unit.
- **After every plan wave:** Run `npm run test -- --run tests/refresh/market-data-store.test.ts tests/refresh/refresh-runner.test.ts tests/ui/status-workspace.test.tsx tests/chip/chip-runner.test.ts`.
- **Before `$gsd-verify-work`:** `npm run verify` must be green.
- **Max feedback latency:** keep quick checks under local practical runtime; if they become slow, split by touched subsystem.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-store-gap-planning | TBD | TBD | DATA-07, REFR-09, REFR-10 | — | Existing active cache is not corrupted by partial refresh failure. | unit | `npm run test -- --run tests/refresh/market-data-store.test.ts` | ✅ | ⬜ pending |
| TBD-ordinary-refresh | TBD | TBD | REFR-09, REFR-10, REFR-11 | — | Ordinary refresh requests only missing/failed data and keeps old result on incomplete market data. | integration | `npm run test -- --run tests/refresh/refresh-runner.test.ts` | ✅ | ⬜ pending |
| TBD-screening-boundary | TBD | TBD | REFR-11, REFR-12 | — | Screening success publishes results before chip completion; chip failure does not fail refresh. | integration | `npm run test -- --run tests/refresh/refresh-runner.test.ts tests/chip/chip-runner.test.ts` | ✅ | ⬜ pending |
| TBD-stage-status-ui | TBD | TBD | UI-06, UI-07 | — | UI exposes sanitized stage progress and does not leak provider token/path details. | component | `npm run test -- --run tests/ui/status-workspace.test.tsx` | ✅ | ⬜ pending |
| TBD-full-rebuild-cli | TBD | TBD | REFR-13 | — | Full rebuild has no web entry and activates only after a complete building generation validates. | unit/smoke | `npm run test -- --run tests/refresh/bootstrap-market-data.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Bind this validation map to concrete task IDs after `09-PLAN.md` is generated.
- [ ] Add missing test stubs if the final plan introduces a new refresh-stage store file or CLI entrypoint without existing coverage.
- [ ] Confirm exact quick-test runtime after the first implementation wave.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full rebuild is operations-only | REFR-13 | Web absence is partly a product-surface review. | Confirm there is no visible full-rebuild action in the page and no web API route that triggers high-cost rebuild. |
| Stage progress is understandable during a real refresh | UI-06, UI-07 | Timing/progress perception is hard to fully prove in component tests. | Run the app, trigger refresh, observe 股票列表/行情/筛选/筹码阶段 statuses and sanitized failure display. |

---

## Validation Sign-Off

- [ ] All final plan tasks have automated verify commands or explicit Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Feedback latency is measured and acceptable for the task size.
- [ ] `nyquist_compliant: true` set in frontmatter after final plan binding.

**Approval:** pending
