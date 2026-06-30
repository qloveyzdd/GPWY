# Phase 7: Standardized Market Data Cache - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 replaces the task-scoped 60-day adjusted-price snapshots with a standardized market data cache that stores stock status, raw daily quotes, and adjustment factors independently.

This phase does:
- Automatically bootstrap the new cache with the latest 60 complete market trading days when the user first refreshes after upgrading.
- Calculate front-adjusted prices from raw quotes and stored adjustment factors when screening reads the data.
- Validate the new cache before switching screening to it.
- Keep the previous usable results available while bootstrap is incomplete or has failed.
- Preserve market data accumulated after bootstrap.

This phase does not:
- Implement provider concurrency, persistent tinyshare workers, or rate limiting; those are Phase 8.
- Implement ordinary missing-date incremental refresh and interruption recovery; those are Phase 9.
- Add full-history backfill or change the existing downtrend screening algorithm.
- Delete or compact the old task-scoped cache.

</domain>

<decisions>
## Implementation Decisions

### First Bootstrap
- **D-07-01:** The first web-triggered manual refresh after upgrade automatically detects that the standardized cache is not ready and bootstraps the latest 60 market trading days. No separate operator initialization is required.
- **D-07-02:** The refresh UI must distinguish bootstrap from an ordinary refresh with the state text “正在初始化缓存”.
- **D-07-03:** If bootstrap fails, partial standardized-cache data is discarded. The next manual refresh starts the full 60-day bootstrap from the beginning rather than resuming.
- **D-07-04:** During bootstrap, the previous screening results remain usable and are explicitly labeled “旧缓存结果”.

### Historical Data Retention
- **D-07-05:** After the initial 60-day bootstrap, all newly fetched trading days remain stored. Screening continues to read only the latest 60 valid trading days.
- **D-07-06:** Historical quotes and adjustment factors are retained when a stock becomes suspended, delisted, or absent from the current tradable list.
- **D-07-07:** Stock master data preserves listed, suspended, and delisted status records. Screening processes only currently tradable stocks.
- **D-07-08:** Standardized market data has no automatic retention cutoff. Deletion is an explicit future operations concern.

### Cache Activation Rules
- **D-07-09:** Cache activation is market-complete but stock-tolerant: the market-level 60-day set must be complete, while individual stocks with insufficient history are skipped by screening.
- **D-07-10:** A stock missing a required adjustment factor is skipped with a recorded reason. It does not block activation of the whole cache, and the system must not fall back to unadjusted prices for that stock.
- **D-07-11:** Activation requires exactly 60 target market trading days whose full-market daily quote and adjustment-factor requests have both succeeded and been stored.
- **D-07-12:** After the standardized cache passes validation and becomes active, the workflow immediately runs screening and produces results from the new cache.

### Legacy Cache
- **D-07-13:** The existing task-scoped stock and daily-bar tables remain in place after the standardized cache is activated. Phase 7 does not delete them.
- **D-07-14:** Automatic fallback is allowed only while the standardized cache is not ready or has failed validation. Once activated, the normal read path does not fall back to legacy cache data.
- **D-07-15:** Phase 7 provides no legacy-cache cleanup command or manual SQLite cleanup instructions.
- **D-07-16:** The user interface does not display legacy-cache disk usage or cleanup notices.

### the agent's Discretion
- Exact normalized table and index names.
- How cache readiness and the active cache generation are represented internally, provided activation is atomic and follows the rules above.
- Exact validation report structure and skip-reason codes.
- Whether stock status synchronization uses one multi-status request or separate provider requests, provided listed, suspended, and delisted states are retained.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/PROJECT.md` — v2.0 goal, Tushare-only source constraint, 60-day screening window, and existing project decisions.
- `.planning/REQUIREMENTS.md` — DATA-05, DATA-06, DATA-08, and DATA-09.
- `.planning/ROADMAP.md` — Phase 7 boundary, dependencies, and success criteria.
- `.planning/research/SUMMARY.md` — standardized storage, dynamic adjustment, migration risks, and suggested phase ordering.
- `.planning/research/ARCHITECTURE.md` — recommended raw quote, adjustment factor, stock master, activation, and migration model.
- `.planning/research/PITFALLS.md` — adjusted-price migration, partial data, stale cache, and transaction risks.

### Prior Behavior
- `.planning/milestones/v1.0-phases/06-charts-and-deployment/06-CONTEXT.md` — current full refresh workflow and requirement that failed enrichment must not hide usable results.
- `.planning/milestones/v1.0-phases/03-downtrend-screening-engine/03-CONTEXT.md` — existing 60-bar screening and skip semantics.

### Existing Code
- `src/lib/refresh/refresh-store.ts` — current task-scoped schema, latest-success reads, and transaction patterns to replace or adapt.
- `src/lib/refresh/fetch-refresh-data.ts` — current 60-day acquisition and in-memory front-adjustment logic.
- `src/lib/refresh/refresh-runner.ts` — current refresh workflow and success/failure boundary.
- `src/lib/refresh/refresh-types.ts` — current stock, quote, task, and cache types.
- `src/lib/screening/screening-runner.ts` — current dependency on a successful refresh job and task-scoped cache.
- `src/lib/results/results-snapshot.ts` — current latest-result behavior that must remain available during bootstrap.
- `src/lib/results/chart-data.ts` — current task-scoped daily bar reads used by charts.
- `tests/refresh/refresh-store.test.ts` — existing latest-success rollback behavior.
- `tests/refresh/fetch-refresh-data.test.ts` — current 60-day acquisition and front-adjustment behavior.
- `tests/screening/screening-runner.test.ts` — screening cache integration patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `better-sqlite3` transaction patterns in `refresh-store.ts` can be reused for normalized UPSERTs and atomic activation.
- `mapStockBasics`, `mapDailyBars`, and adjustment-factor parsing in `fetch-refresh-data.ts` provide validated provider-to-domain conversion.
- `evaluateDowntrendStock` already skips stocks without sufficient valid bars; Phase 7 should feed it dynamically adjusted bars rather than change the algorithm.
- `readLatestResultsSnapshot()` already reads persisted screening results independently of raw cache writes, which supports showing legacy results during bootstrap.

### Established Patterns
- Database access is organized as focused store modules with short synchronous SQLite transactions.
- Provider errors are classified and sanitized before persistence or UI exposure.
- Failed refreshes do not replace the latest successful task-scoped cache.
- Screening consumes persisted cache data and writes a separate immutable screening run.

### Integration Points
- `refresh-store.ts` needs standardized stock, raw quote, adjustment-factor, and readiness/activation storage.
- `fetch-refresh-data.ts` must return raw quotes and adjustment factors separately instead of pre-adjusting quotes before persistence.
- `screening-runner.ts` must gain a standardized-cache read path while preserving legacy fallback before activation.
- `refresh-runner.ts` must detect first-use bootstrap, expose bootstrap state, validate activation, and immediately run screening after activation.
- `chart-data.ts` must eventually read dynamically adjusted bars from the standardized cache; Phase 7 should preserve current chart behavior while changing the underlying reader.

</code_context>

<specifics>
## Specific Ideas

- Use the exact user-facing bootstrap state text “正在初始化缓存”.
- Use the exact legacy-result label “旧缓存结果” while bootstrap is incomplete or failed.
- Treat 60 target market trading days as a strict market-level invariant, but do not require every stock to have 60 usable rows.
- Never substitute unadjusted prices when adjustment factors are missing.

</specifics>

<deferred>
## Deferred Ideas

- Provider concurrency, retry scheduling, and persistent Python workers belong to Phase 8.
- Ordinary incremental refresh, resume behavior, detailed progress tracking, and an operations full-rebuild command belong to Phase 9.
- Legacy cache cleanup, compaction, disk-usage display, and cleanup documentation are deferred beyond Phase 7.
- Full-market historical backfill remains a future requirement.

</deferred>

---

*Phase: 07-standardized-market-data-cache*
*Context gathered: 2026-06-25*
