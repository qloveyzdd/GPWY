---
phase: 11-distribution-comparison-experience
plan: 11-02
subsystem: results-table
tags: [results-table, sorting, ui, chip-distribution]
requires:
  - phase: 11-distribution-comparison-experience
    provides: Phase 11 context decisions for table simplification
provides:
  - Results table without chip peak columns or chip peak sorting
  - Preserved row-level inline chart expansion
affects: [results-workspace, stock-detail-entry]
tech-stack:
  added: []
  patterns: [table-only-trend-sorting, inline-detail-expansion]
key-files:
  created: []
  modified:
    - src/components/results/results-table.tsx
    - tests/ui/results-table.test.tsx
key-decisions:
  - "The results table no longer exposes chip distribution availability; all chip state belongs in the expanded detail area."
patterns-established:
  - "Results table sorting is restricted to current/high ratio and drawdown percent."
requirements-completed: [UI-05]
duration: 4 min
completed: 2026-06-30
---

# Phase 11 Plan 11-02: Results Table Simplification Summary

**Results table now removes chip peak fields and keeps only trend-oriented sorting plus inline detail expansion.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-30T06:14:45+08:00
- **Completed:** 2026-06-30T06:18:08+08:00
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Removed the chip peak price column and all row-level chip peak/status rendering.
- Removed chip peak sorting and narrowed `SortKey` to current/high ratio and drawdown percent.
- Updated table `colSpan` to match the six-column layout.
- Preserved mouse and keyboard inline chart expansion.

## Task Commits

1. **Tasks 1-3: Table surface and sorting simplification** — `e9c6e42` (`feat(11-02): remove chip peak table surface`)

## Files Created/Modified

- `src/components/results/results-table.tsx` — removes chip peak cell, chip state badge, chip peak sort key, and adjusts detail colSpan.
- `tests/ui/results-table.test.tsx` — asserts no chip peak table surface and preserves sorting/inline expansion behavior.

## Decisions Made

- Kept backend chip peak compatibility fields in test fixtures and `ResultRow`; only UI consumption was removed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/ui/results-table.test.tsx` — passed
- `D:\NodeJS\npm.cmd run test -- --run tests/ui/results-table.test.tsx tests/ui/status-workspace.test.tsx` — passed
- `D:\NodeJS\npm.cmd run typecheck` — passed
- `D:\NodeJS\npm.cmd run lint -- src/components/results tests/ui/results-table.test.tsx` — passed
- `rg "chipPeakPrice|筹码峰价格|按筹码峰价格排序|ChipPeakCell|ResultChipPeakState|chipState" src/components/results/results-table.tsx` — no matches

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 11-03 full stock detail chart implementation.

---
*Phase: 11-distribution-comparison-experience*
*Completed: 2026-06-30*

