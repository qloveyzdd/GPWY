---
phase: 7
slug: standardized-market-data-cache
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 + Testing Library + Playwright 1.61.0 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-store.test.ts tests/refresh/market-data-reader.test.ts` |
| **Full suite command** | `D:\NodeJS\npm.cmd run verify` |
| **Estimated runtime** | Focused tests ~5 seconds; full verification ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest command.
- **After every plan wave:** Run all Phase 7 refresh, screening, results, and UI tests plus `typecheck`.
- **Before `$gsd-verify-work`:** `D:\NodeJS\npm.cmd run verify` must be green.
- **Max feedback latency:** 15 seconds for focused tests.

---

## Threat References

| Threat | Risk | Required secure behavior |
|--------|------|--------------------------|
| **T-07-01** | Provider token, raw payload, path, or internal error leakage | Persist and render only sanitized summaries; never store secrets in cache metadata |
| **T-07-02** | Partial or corrupt generation activated as authoritative | Activation is transactional and blocked unless all 60 paired market dates validate |
| **T-07-03** | Bootstrap blocks SQLite readers or exhausts storage through repeated failed generations | No network calls inside write transactions; failed building generation is deleted |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | DATA-05 | T-07-02 | Natural keys prevent duplicate canonical rows | integration | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-store.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | DATA-05 | T-07-02, T-07-03 | Generation lifecycle and cleanup are transactional | integration | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-store.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | DATA-06 | T-07-02 | Missing factors skip a stock instead of using raw prices | unit | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-reader.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | DATA-06 | T-07-02 | Active generation is the only normalized screening source | integration | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-reader.test.ts tests/screening/screening-runner.test.ts tests/results/chart-data.test.ts` | partial | ⬜ pending |
| 07-03-01 | 03 | 3 | DATA-08 | T-07-01, T-07-03 | Provider responses are mapped without persisting secrets | unit | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/bootstrap-market-data.test.ts tests/refresh/fetch-refresh-data.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 3 | DATA-08 | T-07-02 | Exactly 60 paired market dates are required before activation | integration | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/bootstrap-market-data.test.ts tests/refresh/market-data-store.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-03 | 03 | 3 | DATA-08 | T-07-02, T-07-03 | Failure deletes partial generation and success immediately screens | integration | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/bootstrap-market-data.test.ts tests/refresh/refresh-runner.test.ts tests/screening/screening-runner.test.ts` | partial | ⬜ pending |
| 07-04-01 | 04 | 4 | DATA-09 | T-07-01 | Cache source/status contains no secret or database path | component | `D:\NodeJS\npm.cmd run test -- --run tests/ui/status-workspace.test.tsx tests/ui/results-table.test.tsx` | partial | ⬜ pending |
| 07-04-02 | 04 | 4 | DATA-09 | T-07-02 | Legacy fallback exists only before normalized activation | integration | `D:\NodeJS\npm.cmd run test -- --run tests/results/results-snapshot.test.ts tests/ui/status-workspace.test.tsx tests/ui/results-table.test.tsx` | partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/refresh/market-data-store.test.ts` — generation lifecycle, normalized UPSERT, activation, cleanup, and retention fixtures.
- [ ] `tests/refresh/market-data-reader.test.ts` — dynamic adjustment and structured skip-reason fixtures.
- [ ] `tests/refresh/bootstrap-market-data.test.ts` — 60-date bootstrap, status synchronization, failure restart, and immediate screening fixtures.
- [ ] Extend existing temp SQLite helpers where practical; do not introduce a second test database abstraction without a concrete reuse benefit.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing real database displays “旧缓存结果” during first normalized bootstrap | DATA-09 | Requires a pre-v2 SQLite database and a live browser session | Back up `.data/refresh.sqlite`, start the app, trigger first refresh, confirm old rows remain visible with the exact label until activation |
| First live provider bootstrap creates a complete normalized generation | DATA-08 | Real Tushare/tinyshare data shape and permissions cannot be fully represented by mocks | Run one authenticated refresh with a real token; inspect status and confirm activation or sanitized failure without exposing the token |

---

## Validation Sign-Off

- [x] All anticipated tasks have an automated verification command or Wave 0 dependency.
- [x] Sampling continuity: no 3 consecutive tasks without automated verification.
- [x] Wave 0 covers all missing test references.
- [x] No watch-mode flags.
- [x] Focused feedback latency target is below 15 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-25
