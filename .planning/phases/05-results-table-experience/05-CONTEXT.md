# Phase 05: Results Table Experience - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 turns persisted screening and chip peak records into the first usable results table in the protected web workspace.

This phase does:
- Read latest persisted screening results from SQLite.
- Join or align the latest chip peak enrichment state for the same screening run.
- Render a table with stock code, name, current price, interval high, current/high ratio, drawdown, and chip peak price.
- Allow sorting by current/high ratio, drawdown, and chip peak price.
- Clearly distinguish no matching stocks, refresh/screening failure or missing data, and chip peak unavailable states.

This phase does not:
- Build stock charts or detail views; those are Phase 6.
- Add CSV export, search filters, watchlists, or configurable screening parameters.
- Recompute screening or chip peak logic in the UI.
- Create estimated chip peaks when official chip data is blocked or unavailable.

</domain>

<decisions>
## Implementation Decisions

### Default Results Ordering
- **D-05-01:** The default table order is current price / interval high ratio ascending. Lower ratios appear first, which also surfaces the deepest drawdowns first.

### Results State Semantics
- **D-05-02:** The UI must distinguish three states: no matching stocks, refresh/screening failure or unavailable result data, and chip peak unavailable for otherwise valid screening rows.
- **D-05-03:** Chip peak unavailable should not hide a stock that matched screening. The row remains visible with a clear unavailable/blocked marker for chip peak instead of a numeric value.

### the agent's Discretion
- The user chose to discuss only the core decisions. Layout placement, exact labels, sorting control styling, and component factoring should follow the existing protected status workspace style unless implementation finds a concrete usability issue.
- The implementation may add a small results summary above the table if it improves scanability without expanding Phase 5 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` — UI-01 through UI-04 and REFR-05 cache-read expectation.
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria, and Phase 6 boundary.

### Upstream Screening and Chip Data
- `.planning/phases/03-downtrend-screening-engine/03-CONTEXT.md` — persisted screening values and ratio/drawdown semantics.
- `.planning/phases/03-downtrend-screening-engine/03-03-SUMMARY.md` — screening result store and latest-result APIs.
- `.planning/phases/04-chip-peak-integration/04-CONTEXT.md` — chip peak source and blocked-state rules.
- `.planning/phases/04-chip-peak-integration/04-02-SUMMARY.md` — chip peak store and runner outputs.

### Existing Code
- `src/app/page.tsx` — protected home page currently renders `StatusWorkspace`.
- `src/components/status/status-workspace.tsx` — current first-screen layout, refresh/validation controls, polling, status copy, and shadcn table usage.
- `src/components/ui/table.tsx` — existing table primitives.
- `src/lib/screening/screening-store.ts` — latest screening run/result readers.
- `src/lib/chip/chip-store.ts` — latest chip peak run/result readers.
- `src/lib/refresh/refresh-runner.ts` — latest refresh status reader for failure/unavailable states.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StatusWorkspace` already owns the protected first screen and has refresh/validation controls; Phase 5 can extend this workspace or split result rendering into a child component.
- `Button`, `Badge`, `Alert`, `Separator`, and `Table` components already exist and match the current app style.
- `readLatestScreeningResults()` and `readLatestChipPeakResults()` provide the data needed for table rows.

### Established Patterns
- Server-side reads happen in `src/app/page.tsx`, then initial data is passed to a client workspace component.
- Refresh status is polled client-side only while a refresh is running.
- Statuses use concise Chinese copy plus badges; sensitive provider details stay server-side or sanitized.

### Integration Points
- Phase 5 should add a server-side results snapshot read near `readRefreshStatus()` and pass it to the page/workspace.
- A results aggregation helper can combine screening rows with chip peak rows by `screeningRunId` and `tsCode`.
- UI tests should extend the existing `tests/ui/status-workspace.test.tsx` pattern or add a focused results table test.

</code_context>

<specifics>
## Specific Ideas

- Default sort: current/high ratio ascending.
- State copy should make it obvious whether there are no qualifying stocks, no usable result data, or only the chip peak enrichment is unavailable.
- Keep matching stocks visible even when chip peak is blocked; the chip peak cell should show a clear unavailable marker.

</specifics>

<deferred>
## Deferred Ideas

- Search/filter controls, CSV export, watchlists, and configurable screening parameters remain out of Phase 5.
- Stock detail charts and chart/table value parity are Phase 6.

</deferred>

---
*Phase: 05-results-table-experience*
*Context gathered: 2026-06-23*
