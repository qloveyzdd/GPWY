# Phase 02: Manual Refresh Cache - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Source:** ROADMAP + REQUIREMENTS + Phase 1 summaries

<domain>
## Phase Boundary

Phase 2 delivers the manual refresh and cache foundation required before any screening algorithm runs.

In scope:
- User can trigger one manual refresh from the protected web page.
- Server prevents concurrent refresh runs.
- Refresh jobs record start time, finish time, status, success/failure counts, and sanitized error summary.
- SQLite stores stock basics and recent daily bars.
- Page can show latest refresh status and latest successful refresh time.

Out of scope:
- MA20/MA60 screening, swing-high calculation, 85% threshold, and result ranking.
- Chip peak extraction for selected candidates.
- Scheduled refresh, queue workers, Redis, PostgreSQL, and multi-user permissions.
</domain>

<decisions>
## Implementation Decisions

### Cache Scope
- D-02-01: Store listed A-share stock basics from `stock_basic`.
- D-02-02: Store daily bars with at least `ts_code`, `trade_date`, `open`, `high`, `low`, `close`, and `vol`.
- D-02-03: Cache the latest 60 trading dates available from Tushare/tinyshare, not merely 60 calendar days.

### Refresh Execution
- D-02-04: Manual refresh is initiated by a protected API route and runs server-side only.
- D-02-05: Use SQLite state as the concurrency guard so duplicate browser clicks do not start multiple jobs.
- D-02-06: The first implementation may run in the Next.js server process; external queues are deferred.

### Failure Handling
- D-02-07: Store sanitized error categories and summaries only; do not persist raw token, headers, stack traces, or provider payloads.
- D-02-08: Failed refresh jobs must not be treated as the latest successful cache.
- D-02-09: Partial data may be written during a failed run only if it is tied to the failed job and not read as successful cache.

### UI Behavior
- D-02-10: The existing protected status workspace remains the first screen and gains manual refresh controls/status.
- D-02-11: The refresh button must be disabled or return an in-progress state while a refresh is running.
- D-02-12: Long-running refresh status should be visible through polling, not page reload assumptions.
</decisions>

<canonical_refs>
## Canonical References

### Phase 1 Foundation
- `.planning/phases/01-tushare-data-foundation/01-03-SUMMARY.md` - tinyshare provider, endpoint validation, and sanitizer decisions.
- `src/lib/tushare/provider.ts` - provider switch between REST and tinyshare.
- `src/lib/tushare/endpoints.ts` - central Tushare endpoint registry.
- `src/lib/validation-store.ts` - existing better-sqlite3 pattern for local SQLite persistence.
- `src/components/status/status-workspace.tsx` - protected first-screen status UI.

### Requirements
- `.planning/REQUIREMENTS.md` - `DATA-02`, `REFR-01`, `REFR-02`, `REFR-03`, `REFR-04`, `REFR-05`.
- `.planning/ROADMAP.md` - Phase 2 goal and success criteria.
</canonical_refs>

<specifics>
## Specific Ideas

- Prefer a dedicated refresh cache store instead of overloading validation snapshots.
- Keep refresh APIs under `/api/refresh/*`.
- Use injectable refresh workers in tests so unit tests do not consume real Tushare quota.
- Use the existing `classifyTushareError()` path for provider errors.
</specifics>

<deferred>
## Deferred Ideas

- Scheduled refresh is v2.
- Background queue service is v2 unless in-process execution becomes demonstrably unsafe.
- Result table and chart rendering are later phases.
</deferred>

---

*Phase: 02-manual-refresh-cache*
*Context gathered: 2026-06-23*
