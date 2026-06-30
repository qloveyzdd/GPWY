---
phase: 09-incremental-refresh-workflow
plan: "09-04"
subsystem: refresh-ui
tags: [react, polling, stage-progress, smoke]

requires:
  - phase: 09-incremental-refresh-workflow
    plan: "09-02"
    provides: "Refresh status markers and chip background operation"
  - phase: 09-incremental-refresh-workflow
    plan: "09-03"
    provides: "Full rebuild operation kind and no-web-entry contract"
provides:
  - "Four-stage refresh progress panel"
  - "Polling while any active work exists"
  - "router.refresh triggers for screening and chip markers"
  - "Smoke coverage that full rebuild is not exposed in the web UI"
affects: [status-workspace, smoke-tests, user-refresh-experience]

tech-stack:
  added: []
  patterns:
    - "Client polling follows hasActiveWork instead of refresh job isRunning"
    - "Server-rendered results refresh on resultVersion/chipVersion markers"

key-files:
  created: []
  modified:
    - src/components/status/status-workspace.tsx
    - tests/ui/status-workspace.test.tsx
    - tests/smoke/app-smoke.spec.ts

key-decisions:
  - "The primary CTA is ordinary incremental refresh only; full rebuild is shown only as a blocking status when already running."
  - "Stage error rendering performs a final UI redaction pass before displaying errorSummary."
  - "Smoke verification uses the current Playwright config without a named chromium project."

patterns-established:
  - "Stage cards always render all four known stages even when no work has started."
  - "Repeated identical resultVersion values do not trigger repeated router.refresh calls."

requirements-completed: [REFR-10, REFR-11, REFR-12, UI-06, UI-07]

duration: 13 min
completed: 2026-06-29
---

# Phase 09 Plan 04: Status UI Stage Progress Summary

**状态页现在展示四阶段刷新进度，按 result/chip marker 刷新服务端结果，并且不暴露全量重建入口。**

## Performance

- **Duration:** 13 min
- **Started:** 2026-06-29T17:49:27+08:00
- **Completed:** 2026-06-29T18:02:47+08:00
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- 重写 `StatusWorkspace` 的 refresh 区域，新增股票列表、行情/复权、筛选、筹码处理四阶段卡片。
- 主 CTA 改为 `开始增量刷新` / `刷新进行中`，禁用条件使用 `hasActiveWork`。
- polling 改为任意 active work 期间持续执行；chip background running 且 `activeJob=null` 时仍继续轮询。
- `resultVersion` 变化触发一次 `router.refresh()`；`chipVersion` 或 chip terminal 变化触发额外刷新。
- full rebuild running 只显示阻塞文案，不提供按钮、链接、菜单或 web API 入口。

## Task Commits

1. **Task 1-3: Stage panel, polling markers, smoke no-rebuild-entry coverage** - `62c5763` (`feat`)

## Files Created/Modified

- `src/components/status/status-workspace.tsx` - Stage panel, active-work polling, marker refresh logic, UI redaction.
- `tests/ui/status-workspace.test.tsx` - Covers stage labels, sanitization, polling markers, chip partial results, full rebuild blocking.
- `tests/smoke/app-smoke.spec.ts` - Verifies incremental refresh CTA and absence of full rebuild web entry.

## Decisions Made

- Full rebuild blocking copy can mention full rebuild, but no clickable control may use that name.
- UI performs a final sanitization pass for stage error summaries even though backend stores sanitized summaries.
- Kept existing validation cards and results table layout; stage panel is inserted above supporting status sections.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The planned smoke command included `--project=chromium`, but this repo has no named Playwright project. The equivalent configured smoke test passed with `npm run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line`.
- Local Playwright Chromium was missing; installed via `npx playwright install chromium` before rerunning smoke.

## User Setup Required

None.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/ui/status-workspace.test.tsx`
- `D:\NodeJS\npm.cmd run smoke -- tests/smoke/app-smoke.spec.ts --reporter=line`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/components/status tests/ui tests/smoke`
- `D:\NodeJS\npm.cmd run verify`

All 6 UI tests, smoke test, type checking, focused lint, and full project verification passed. Full verification result: 29 test files and 161 tests passed; production build passed.

## Self-Check: PASSED

- Four stage labels render: 股票列表、行情/复权、筛选、筹码处理。
- Failed stage displays failed count and sanitized reason without token/path/table leakage.
- Result marker changes refresh server-rendered results without waiting for chip completion.
- Chip partial/running state does not hide published results.
- Web UI exposes no full rebuild start entry.

## Next Phase Readiness

Phase 9 implementation is complete and ready for phase-level verification.

---
*Phase: 09-incremental-refresh-workflow*
*Completed: 2026-06-29*
