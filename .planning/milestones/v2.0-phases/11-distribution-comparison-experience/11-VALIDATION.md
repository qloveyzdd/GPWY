---
phase: 11
slug: distribution-comparison-experience
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-30
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + Playwright |
| **Config file** | `vitest.config.mts`, `playwright.config.ts` |
| **Quick run command** | `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx` |
| **Full suite command** | `D:\NodeJS\npm.cmd run verify` |
| **Smoke command** | `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` |
| **Estimated runtime** | focused tests < 90s; full verify depends on Next build |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific Vitest command listed below.
- **After Wave 1:** Run `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/results-table.test.tsx` plus `D:\NodeJS\npm.cmd run typecheck`.
- **After Wave 2:** Run `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts tests/ui/results-table.test.tsx tests/ui/stock-kline-chart.test.tsx` plus `D:\NodeJS\npm.cmd run typecheck`.
- **Before `$gsd-verify-work`:** `D:\NodeJS\npm.cmd run verify` and smoke must pass, unless Playwright browser dependency is explicitly unavailable and documented.
- **Max feedback latency:** keep focused Vitest checks scoped to affected files; do not rely only on full verify.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 11-01 | 1 | CHRT-07, CHRT-08, CHRT-09, CHRT-11 | T-11-01 | Chart DTO removes legacy chip peak overlay and exposes actual latest/previous trade dates. | type/unit | `D:\NodeJS\npm.cmd run typecheck` | ✅ | ⬜ pending |
| 11-01-02 | 11-01 | 1 | CHRT-07, CHRT-08, CHRT-10 | T-11-02, T-11-03 | Single-day distribution failure does not make the whole detail unavailable and does not leak secrets. | unit | `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts` | ✅ | ⬜ pending |
| 11-01-03 | 11-01 | 1 | CHRT-07, CHRT-08, CHRT-09 | T-11-01 | Shared price levels and max percent are generated from all successful levels, not Top-N. | unit | `D:\NodeJS\npm.cmd run test -- --run tests/results/chart-data.test.ts` | ✅ | ⬜ pending |
| 11-02-01 | 11-02 | 1 | UI-05 | T-11-05 | Table no longer exposes chip peak fields or chip status badges. | component | `D:\NodeJS\npm.cmd run test -- --run tests/ui/results-table.test.tsx` | ✅ | ⬜ pending |
| 11-02-02 | 11-02 | 1 | UI-05 | T-11-06 | Only current/high ratio and drawdown sort keys remain. | component/type | `D:\NodeJS\npm.cmd run test -- --run tests/ui/results-table.test.tsx && D:\NodeJS\npm.cmd run typecheck` | ✅ | ⬜ pending |
| 11-02-03 | 11-02 | 1 | UI-05 | T-11-04 | Existing inline row expansion remains accessible and correctly positioned. | component | `D:\NodeJS\npm.cmd run test -- --run tests/ui/results-table.test.tsx` | ✅ | ⬜ pending |
| 11-03-01 | 11-03 | 2 | CHRT-11 | T-11-08 | K-line chart contains only interval high and 85% threshold markLines. | component | `D:\NodeJS\npm.cmd run test -- --run tests/ui/stock-kline-chart.test.tsx` | ✅ | ⬜ pending |
| 11-03-02 | 11-03 | 2 | CHRT-07, CHRT-08, CHRT-09 | T-11-07 | Previous/latest distribution charts render from shared-scale DTO. | component | `D:\NodeJS\npm.cmd run test -- --run tests/ui/stock-kline-chart.test.tsx` | ✅ | ⬜ pending |
| 11-03-03 | 11-03 | 2 | CHRT-10 | T-11-09 | Unavailable card is isolated per target and missing uses neutral empty-state treatment. | component | `D:\NodeJS\npm.cmd run test -- --run tests/ui/stock-kline-chart.test.tsx` | ✅ | ⬜ pending |
| 11-04-01 | 11-04 | 3 | UI-05, CHRT-07, CHRT-08, CHRT-09, CHRT-10, CHRT-11 | T-11-10, T-11-11 | Browser key path proves no legacy chip peak UI and dual distribution detail works from seeded distribution data. | smoke | `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line` | ✅ | ⬜ pending |
| 11-04-02 | 11-04 | 3 | UI-05, CHRT-11 | T-11-10 | Final grep confirms old chip peak UI strings are removed from table/chart components. | static | `rg "chipPeakPrice|筹码峰价格|筹码峰[0-9]|chipPeaks|chipPeakState" src/components/results src/components/charts` | ✅ | ⬜ pending |
| 11-04-03 | 11-04 | 3 | UI-05, CHRT-07, CHRT-08, CHRT-09, CHRT-10, CHRT-11 | — | Full type/lint/test/build gate passes before verification. | full | `D:\NodeJS\npm.cmd run verify` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure is sufficient:

- `tests/results/chart-data.test.ts` exists for server-side ChartSnapshot aggregation.
- `tests/ui/results-table.test.tsx` exists for table columns, sorting, and inline expansion.
- `tests/ui/stock-kline-chart.test.tsx` exists for client chart rendering and ECharts option assertions.
- `tests/smoke/seed-smoke-db.ts` already seeds `chip_distribution_*` tables with available and blocked cases.
- `tests/smoke/app-smoke.spec.ts` exists for protected workspace browser coverage.

No Wave 0 scaffolding is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual balance of two distribution cards | CHRT-07, CHRT-08 | Component tests can assert structure/options, but final visual density is easier to judge in browser. | Open a seeded result row and confirm previous/latest cards are same size, readable, and not visually weighted toward latest. |
| Missing state tone is not over-alarming | CHRT-10 | CSS tone can be tested only indirectly. | Use or seed a missing previous target and confirm it reads as normal empty state, not severe system error. |

Manual checks are supplementary; they do not replace the automated gates above.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all required test infrastructure.
- [x] No watch-mode flags.
- [x] Feedback latency bounded by focused Vitest commands before full verify.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending execution
