# Phase 05: Results Table Experience - Research

**Date:** 2026-06-23
**Phase:** 05-results-table-experience
**Status:** Complete

## Research Goal

Identify what needs to be known to plan the results table phase well, using the existing Phase 3 screening store, Phase 4 chip peak store, and current protected status workspace.

## Key Findings

### 1. Use a Results Snapshot Layer

The UI should not directly combine `readLatestScreeningResults()` and `readLatestChipPeakResults()` inside the component. A small server-side results snapshot helper should:

- Read latest screening run/results.
- Read latest chip peak run/results.
- Join chip peak results only when `chipPeakRun.screeningRunId === screeningRun.id`.
- Produce row records with explicit chip state: `available`, `blocked`, `failed`, or `missing`.
- Produce a page-level state: `ready`, `empty`, or `unavailable`.

This keeps table rendering simple and prevents duplicated state logic in tests and UI.

### 2. No New Table Library Is Needed

`package.json` has no TanStack Table dependency. Phase 5 only needs:

- Required columns.
- Three sortable metrics.
- Default sort by `currentHighRatio` ascending.

Adding TanStack Table now would be unnecessary. Use the existing shadcn `Table` primitives and local React state for sorting. Revisit TanStack only if later phases add filtering, column pinning, pagination, or large result sets.

### 3. Keep Results In The Existing Workspace

`src/app/page.tsx` already performs authenticated server-side reads and passes initial state into `StatusWorkspace`. `StatusWorkspace` already owns:

- Header controls.
- Manual refresh status.
- Validation status bands.
- Existing shadcn table usage.

Phase 5 should either add a focused `ResultsTable` child component under this workspace, or split the results section into `src/components/results/*` and pass a snapshot prop through `StatusWorkspace`. The latter keeps `StatusWorkspace` from becoming too large.

### 4. Chip Peak Unavailable Is Row-Level

Phase 4 deliberately persists blocked/failed chip peak results without estimates. Therefore:

- A matched stock remains visible even if chip peak is blocked.
- The chip peak column should show a clear marker such as `不可用` or `阻塞`, not `0` and not blank.
- Error summaries must remain sanitized and compact.

### 5. State Semantics Need Separate Signals

Phase 5 needs to distinguish:

- `empty`: screening ran successfully but no stocks matched.
- `unavailable`: no screening run exists, latest refresh failed, or result data cannot be read.
- row-level chip unavailable: screening row exists but chip peak is blocked/failed/missing.

The current stores do not persist screening failure runs. For Phase 5, treat "no latest screening run" as result data unavailable and use refresh status to provide the most useful cause. Do not add a new screening job system in this phase unless execution discovers it is required to satisfy the table contract.

## Recommended Plan Split

### 05-01: Latest Results Snapshot And Required Columns

Build the server-side results snapshot helper and render the required table columns with default current/high ratio ordering.

Primary value:
- UI-01 and UI-02 become testable.
- Phase 6 receives a stable row shape for chart links/detail views later.

### 05-02: Sorting And State Semantics

Add sortable headers/controls and the required empty/unavailable/chip-blocked states.

Primary value:
- UI-03 and UI-04 become testable.
- User decisions D-05-01 through D-05-03 are enforced.

## Risks

- If chip peak rows are joined without checking `screeningRunId`, stale chip data from an older screening run could appear in the current table.
- If chip unavailable is represented as `null` without a label, users may misread it as missing UI work rather than official data being blocked.
- If results logic is embedded only in React components, state coverage will be harder to test than a server-side snapshot helper.

## Verification Recommendations

- Unit-test the results snapshot with temporary SQLite fixtures.
- Component-test the results table with ready, empty, unavailable, and chip-blocked snapshots.
- Run full `npm run verify` after implementation.

---
*Research completed: 2026-06-23*
