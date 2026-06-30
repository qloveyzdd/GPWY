# Phase 7: Standardized Market Data Cache - Research

**Researched:** 2026-06-25
**Domain:** SQLite generation-based market cache, raw/adjusted A-share quotes, safe cache migration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-07-01:** The first web-triggered manual refresh after upgrade automatically detects that the standardized cache is not ready and bootstraps the latest 60 market trading days. No separate operator initialization is required.
- **D-07-02:** The refresh UI must distinguish bootstrap from an ordinary refresh with the state text “正在初始化缓存”.
- **D-07-03:** If bootstrap fails, partial standardized-cache data is discarded. The next manual refresh starts the full 60-day bootstrap from the beginning rather than resuming.
- **D-07-04:** During bootstrap, the previous screening results remain usable and are explicitly labeled “旧缓存结果”.
- **D-07-05:** After the initial 60-day bootstrap, all newly fetched trading days remain stored. Screening continues to read only the latest 60 valid trading days.
- **D-07-06:** Historical quotes and adjustment factors are retained when a stock becomes suspended, delisted, or absent from the current tradable list.
- **D-07-07:** Stock master data preserves listed, suspended, and delisted status records. Screening processes only currently tradable stocks.
- **D-07-08:** Standardized market data has no automatic retention cutoff. Deletion is an explicit future operations concern.
- **D-07-09:** Cache activation is market-complete but stock-tolerant: the market-level 60-day set must be complete, while individual stocks with insufficient history are skipped by screening.
- **D-07-10:** A stock missing a required adjustment factor is skipped with a recorded reason. It does not block activation of the whole cache, and the system must not fall back to unadjusted prices for that stock.
- **D-07-11:** Activation requires exactly 60 target market trading days whose full-market daily quote and adjustment-factor requests have both succeeded and been stored.
- **D-07-12:** After the standardized cache passes validation and becomes active, the workflow immediately runs screening and produces results from the new cache.
- **D-07-13:** The existing task-scoped stock and daily-bar tables remain in place after the standardized cache is activated. Phase 7 does not delete them.
- **D-07-14:** Automatic fallback is allowed only while the standardized cache is not ready or has failed validation. Once activated, the normal read path does not fall back to legacy cache data.
- **D-07-15:** Phase 7 provides no legacy-cache cleanup command or manual SQLite cleanup instructions.
- **D-07-16:** The user interface does not display legacy-cache disk usage or cleanup notices.

### the agent's Discretion
- Exact normalized table and index names.
- How cache readiness and the active cache generation are represented internally, provided activation is atomic.
- Exact validation report structure and skip-reason codes.
- Whether stock status synchronization uses one multi-status request or separate provider requests.

### Deferred Ideas (OUT OF SCOPE)
- Provider concurrency, retry scheduling, and persistent Python workers belong to Phase 8.
- Ordinary incremental refresh, resume behavior, detailed progress tracking, and an operations full-rebuild command belong to Phase 9.
- Legacy cache cleanup, compaction, disk-usage display, and cleanup documentation are deferred beyond Phase 7.
- Full-market historical backfill remains a future requirement.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Normalized stock/quote/factor storage | Database/Storage | API/Backend | Uniqueness, retention, and activation are durable data invariants |
| 60-day bootstrap | API/Backend | Database/Storage | Server orchestrates provider reads; store owns atomic persistence |
| Dynamic front adjustment | API/Backend | Database/Storage | Read model combines raw quotes and factors before screening |
| Cache validation and activation | Database/Storage | API/Backend | Activation must be atomic and visible consistently to all readers |
| Legacy result fallback | API/Backend | Database/Storage | Read routing depends on active generation state |
| Bootstrap/legacy labels | Browser/Client | Frontend Server | User-visible state is derived from server cache status |
</architectural_responsibility_map>

<research_summary>
## Summary

The phase should use a **generation-based normalized cache**, not a destructive in-place migration. A cache generation represents a coherent market dataset built by bootstrap or a future rebuild. Raw quotes and adjustment factors are unique within a generation by stock and trade date; a singleton cache-state record identifies the active generation. The first bootstrap builds a non-active generation, validates all 60 target market dates, then switches the active pointer in one short SQLite transaction. A failed building generation is deleted, satisfying the user's restart-from-zero rule without touching legacy results.

Raw OHLCV and adjustment factors must be stored independently. Screening reads only the active generation and computes front-adjusted values per stock using `raw_price × factor_at_day / factor_at_latest_stock_bar`. If a required factor is absent, the stock is skipped with an explicit reason. Existing adjusted `daily_bars` cannot be imported because their original prices and factors are unrecoverable.

The current task-scoped tables and screening results remain intact. While no normalized generation is active, result and chart reads continue through the legacy path and surface “旧缓存结果”. After activation, normalized reads become authoritative and the workflow immediately runs screening. Phase 7 remains serial; bounded concurrency is deliberately deferred to Phase 8.

**Primary recommendation:** Build a generation-scoped normalized cache with an atomic active-generation pointer, dynamic adjustment read model, and explicit legacy fallback before activation only.
</research_summary>

<standard_stack>
## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLite | bundled 3.x | Durable normalized cache and atomic activation | Existing deployment is single-host; transactions and unique keys match the consistency requirements |
| better-sqlite3 | 12.11.1 | Synchronous prepared statements and short transactions | Already established in the project and suitable for server-side batch writes |
| Zod | 4.4.3 | Validate environment/config and internal status payloads | Existing project convention; useful for new cache status types |
| Vitest | 4.1.9 | Store, adjustment, bootstrap, and fallback tests | Existing test stack with temp SQLite fixtures |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing Tushare clients | project-local | Fetch stock statuses, daily quotes, and factors | Bootstrap remains provider-agnostic between REST and tinyshare |
| Existing ECharts/React UI | project-local | Preserve chart behavior after data-source switch | Only compatibility changes in Phase 7 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Generation-based cache | Canonical tables plus temporary staging tables | Staging works for one bootstrap but becomes awkward for future full rebuilds |
| Active generation pointer | Rename/swap physical tables | Table swaps complicate schema initialization and concurrent readers |
| Dynamic adjustment | Rewrite all historical adjusted prices whenever a factor changes | More writes, harder recovery, and risks mixed adjustment bases |
| SQLite | PostgreSQL | Unnecessary operational complexity for a personal single-instance service |

**Installation:** No new runtime dependency is required.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```text
Manual refresh
    │
    ▼
Read cache state
    ├── active generation exists ──> Phase 9 ordinary refresh path (later)
    │
    └── no active generation
            │
            ▼
       create BUILDING generation
            │
            ├── fetch/upsert stock statuses
            ├── discover 60 market dates
            ├── fetch raw daily quotes per date
            └── fetch adjustment factors per date
            │
            ▼
       validate generation
            ├── invalid ──> delete generation rows ──> keep legacy results
            └── valid
                  │
                  ▼
          atomic active-pointer switch
                  │
                  ▼
          dynamic adjusted read model
                  │
                  ▼
          existing screening algorithm
                  │
                  ▼
          new screening results published
```

### Recommended Project Structure

```text
src/lib/refresh/
├── market-data-types.ts       # normalized records, generation/status types
├── market-data-store.ts       # schema, generation lifecycle, UPSERTs, reads
├── market-data-reader.ts      # active-generation adjusted read model
├── bootstrap-market-data.ts   # serial 60-day build, validation, activation
├── fetch-refresh-data.ts      # provider mapping; raw quotes/factors returned separately
├── refresh-runner.ts          # detects and runs bootstrap
└── refresh-store.ts           # legacy job/cache store retained
```

### Pattern 1: Generation-Based Atomic Activation

**What:** Build all new data under a non-active generation ID, validate it, then update a singleton active-generation pointer in one transaction.

**When to use:** Initial migration and future full rebuilds where readers must never observe partial data.

**Recommended schema shape:**

```sql
create table market_cache_generations (
  id integer primary key autoincrement,
  status text not null check (status in ('building', 'active', 'failed', 'retired')),
  started_at text not null,
  activated_at text,
  target_trade_date_count integer not null
);

create table market_cache_state (
  singleton_id integer primary key check (singleton_id = 1),
  active_generation_id integer,
  foreign key (active_generation_id) references market_cache_generations(id)
);
```

Activation should use a short explicit transaction. SQLite allows multiple readers but only one writer, so network operations must finish before the activation transaction begins. An immediate write transaction can establish the write lock before changing status and pointer.

### Pattern 2: Generation-Scoped Natural Keys

**What:** Quote and factor uniqueness is `(generation_id, ts_code, trade_date)`. This removes refresh-job duplication while permitting a future replacement generation to coexist temporarily.

```sql
create table market_daily_quotes (
  generation_id integer not null,
  ts_code text not null,
  trade_date text not null,
  open real not null,
  high real not null,
  low real not null,
  close real not null,
  vol real not null,
  fetched_at text not null,
  primary key (generation_id, ts_code, trade_date)
);
```

SQLite UPSERT evaluates conflicts per row against a primary key or unique index, making repeated provider writes idempotent.

### Pattern 3: Dynamic Front-Adjusted Read Model

**What:** Persist raw prices and factors; create a pure reader that groups by stock, selects the latest available factor for that stock's latest bar, validates factor coverage, and maps prices to the common basis.

```typescript
adjusted = raw * factorAtDay / latestFactorForStock;
```

**Rules:**
- Use the stock's latest stored bar, not the market's latest date, as its adjustment basis.
- Require a factor for every bar included in the screening window.
- Return a structured skip reason when factor coverage is incomplete.
- Do not mutate or persist the derived adjusted prices.

### Pattern 4: Read Routing Before and After Activation

**What:** A focused cache-source resolver selects:
- `legacy` when no active normalized generation exists;
- `normalized` when an active generation exists.

After activation, normalized reader failures are errors, not a reason to silently fall back to legacy data. This enforces D-07-14 and prevents stale results from masking a broken active cache.

### Anti-Patterns to Avoid

- **Importing old `daily_bars`:** They are already adjusted and cannot be reconstructed as raw prices.
- **Using a boolean ready flag without generation identity:** It cannot distinguish partial, active, failed, or future rebuilt datasets.
- **Activating date-by-date:** Readers could observe a mixed 59/60-day cache.
- **Holding transactions during provider calls:** SQLite has one writer; long write transactions increase `SQLITE_BUSY` risk.
- **Fallback after activation:** Silently serving legacy data would hide normalized-cache corruption.
- **Deleting old task tables:** Explicitly outside Phase 7.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic cache switch | File-copy flags or process memory state | SQLite transaction + active generation row | Survives process restart and gives all readers one durable truth |
| Idempotent writes | Read-then-insert loops | Primary keys plus SQLite UPSERT | Avoids races and duplicate rows |
| Transaction nesting | Custom nested BEGIN logic | Small store transactions; SAVEPOINT only if truly nested | SQLite BEGIN transactions do not nest |
| Adjustment fallback | Approximate missing factors | Structured stock skip | Wrong price basis invalidates MA and interval high |
| Migration rollback | Mutating old tables in place | New tables/generation alongside legacy tables | Old results remain usable until activation |

**Key insight:** The cache is a published dataset, not merely a group of rows. Publication needs an explicit generation lifecycle and atomic pointer.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Generation Validates Dates but Not Paired Datasets
**What goes wrong:** A date has quotes but missing/partial factors and is counted complete.
**Why it happens:** Validation only counts distinct quote dates.
**How to avoid:** Track or query both quote-date and factor-date completion; all 60 target dates must have both provider operations marked successful.
**Warning signs:** Market has 60 quote dates but many stocks are unexpectedly skipped for factors.

### Pitfall 2: Latest Market Factor Used for Suspended Stocks
**What goes wrong:** A suspended stock has no quote on the newest market date, so using the market's factor basis produces incorrect ratios or no result.
**Why it happens:** Adjustment basis is selected globally instead of per stock.
**How to avoid:** Use each stock's latest bar and corresponding factor as its basis.
**Warning signs:** Suspended stocks produce missing-latest-factor errors despite complete historical rows.

### Pitfall 3: Partial Bootstrap Survives Failure
**What goes wrong:** Next attempt treats partial rows as valid progress despite the user choosing restart-from-zero.
**Why it happens:** Failure only marks a job failed but leaves generation data.
**How to avoid:** Delete the failed building generation and all dependent rows in a short cleanup transaction.
**Warning signs:** Second bootstrap issues fewer date requests than the first after a failure.

### Pitfall 4: Stock Status Sync Deletes History
**What goes wrong:** Replacing the current listed-stock set removes delisted/suspended metadata or cascades market data.
**Why it happens:** Current-list synchronization is modeled as truncate-and-reload.
**How to avoid:** UPSERT status records by `ts_code`; never delete quote/factor rows because a status changes.
**Warning signs:** Stock count drops sharply after status refresh or old chart data disappears.

### Pitfall 5: UI Labels Derived Only From Refresh Job Status
**What goes wrong:** A running legacy refresh and a first normalized bootstrap look identical; legacy results are not labeled.
**Why it happens:** Cache source/readiness is not included in the status snapshot.
**How to avoid:** Expose cache mode/source explicitly from server state.
**Warning signs:** UI can show “刷新缓存中” but cannot distinguish bootstrap.
</common_pitfalls>

<code_examples>
## Code Examples

### SQLite UPSERT by Natural Key

```sql
insert into market_daily_quotes
  (generation_id, ts_code, trade_date, open, high, low, close, vol, fetched_at)
values (?, ?, ?, ?, ?, ?, ?, ?, ?)
on conflict(generation_id, ts_code, trade_date) do update set
  open = excluded.open,
  high = excluded.high,
  low = excluded.low,
  close = excluded.close,
  vol = excluded.vol,
  fetched_at = excluded.fetched_at;
```

Source: SQLite UPSERT documentation.

### Short Atomic Activation

```typescript
db.exec("begin immediate");
try {
  markGenerationActive.run(generationId, activatedAt);
  setActiveGeneration.run(generationId);
  db.exec("commit");
} catch (error) {
  db.exec("rollback");
  throw error;
}
```

Source: SQLite transaction documentation. Provider calls and generation validation must happen before this block.

### Pure Dynamic Adjustment

```typescript
function adjustWindow(
  bars: RawDailyQuote[],
  factorByDate: Map<string, number>,
): AdjustedDailyBar[] | StockSkip {
  const sorted = [...bars].sort((a, b) =>
    a.tradeDate.localeCompare(b.tradeDate),
  );
  const latest = sorted.at(-1);
  const latestFactor = latest && factorByDate.get(latest.tradeDate);

  if (!latest || !latestFactor || latestFactor <= 0) {
    return { status: "skipped", reason: "missing_latest_adjustment_factor" };
  }

  for (const bar of sorted) {
    const factor = factorByDate.get(bar.tradeDate);
    if (!factor || factor <= 0) {
      return { status: "skipped", reason: "missing_adjustment_factor" };
    }
  }

  return sorted.map((bar) => {
    const ratio = factorByDate.get(bar.tradeDate)! / latestFactor;
    return {
      ...bar,
      open: bar.open * ratio,
      high: bar.high * ratio,
      low: bar.low * ratio,
      close: bar.close * ratio,
    };
  });
}
```

Source: Existing project formula, reorganized so raw data remains canonical.
</code_examples>

<sota_updates>
## State of the Art (2024-2026)

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Snapshot rows keyed by every refresh job | Long-lived normalized cache plus generation publication | Eliminates repeated 60-day copies |
| Persist pre-adjusted historical prices | Persist raw prices and derive adjustment at read time | Correct when future corporate actions change the latest basis |
| In-memory “ready” state | Durable generation lifecycle in SQLite | Safe across process restarts |
| Long write transaction around fetch | Fetch first, short transaction to persist/activate | Preserves page reads and reduces lock contention |

**Relevant SQLite behavior:**
- WAL allows readers and a writer to operate concurrently on the same host, but still permits only one writer.
- Automatic WAL checkpoints occur by default; Phase 7 should not add custom checkpoint management unless tests reveal a need.
- WAL must not be used on a network filesystem. The deployment remains local-disk SQLite on one server.
</sota_updates>

<open_questions>
## Open Questions (RESOLVED)

1. **How should full-market request completion be persisted? — RESOLVED**
   - What we know: activation requires paired success for 60 quote/factor dates.
   - Resolution: include a minimal generation-date manifest in Phase 7 because validation cannot safely infer provider success solely from row counts; Phase 9 can extend it with richer progress fields.

2. **Should WAL mode be enabled explicitly? — RESOLVED**
   - What we know: single-host deployment and concurrent reads during bootstrap fit WAL well.
   - Resolution: do not make WAL a Phase 7 correctness requirement. Preserve the current journal behavior unless centralized initialization can enable WAL without changing existing tests; short transactions remain the required concurrency protection.

3. **How are “currently tradable” stocks identified? — RESOLVED**
   - What we know: stock statuses L/P/D must be retained.
   - Resolution: preserve provider status exactly; screening selects `L`, then naturally skips stocks lacking 60 usable bars.
</open_questions>

## Validation Architecture

### Test Layers

| Layer | Purpose | Target files |
|-------|---------|--------------|
| Pure unit | Dynamic adjustment, stock skip reasons, 60-date validation | `tests/refresh/market-data-reader.test.ts` |
| Store integration | Schema, UPSERT uniqueness, generation cleanup, atomic activation | `tests/refresh/market-data-store.test.ts` |
| Workflow integration | Auto-bootstrap detection, failure restart, immediate screening | `tests/refresh/bootstrap-market-data.test.ts`, `tests/refresh/refresh-runner.test.ts` |
| Compatibility integration | Legacy fallback before activation, normalized authority after activation | `tests/screening/screening-runner.test.ts`, `tests/results/chart-data.test.ts` |
| UI component | Exact bootstrap and legacy labels | `tests/ui/status-workspace.test.tsx`, `tests/ui/results-table.test.tsx` |

### Critical Test Scenarios

1. Duplicate quote/factor writes update one natural-key row.
2. A 59-date generation cannot activate; a paired 60-date generation can.
3. A missing stock factor yields a structured stock skip without blocking activation.
4. Adjustment basis changes when a later factor is added; historical raw rows remain unchanged.
5. Bootstrap failure deletes building-generation rows and preserves legacy results.
6. First successful bootstrap activates normalized reads and immediately creates a screening run.
7. Once active, a normalized-reader error does not silently fall back to legacy cache.
8. Suspended/delisted stock metadata and history remain after status synchronization.

### Quick Feedback Commands

```powershell
D:\NodeJS\npm.cmd run test -- --run tests/refresh/market-data-store.test.ts tests/refresh/market-data-reader.test.ts
D:\NodeJS\npm.cmd run test -- --run tests/refresh/bootstrap-market-data.test.ts tests/refresh/refresh-runner.test.ts tests/screening/screening-runner.test.ts
D:\NodeJS\npm.cmd run typecheck
```

### Full Phase Verification

```powershell
D:\NodeJS\npm.cmd run verify
```

### Security Validation

- Confirm provider tokens and raw provider payloads are never persisted in generation tables or UI status.
- Confirm bootstrap errors use the existing sanitized error classifier.
- Confirm all SQL uses prepared statements and generation IDs are internal numeric values.
- Confirm UI exposes only cache state/source, not database paths or disk details.

<sources>
## Sources

### Primary (HIGH confidence)
- https://sqlite.org/lang_upsert.html — conflict targets, per-row UPSERT behavior, and uniqueness requirements
- https://sqlite.org/lang_transaction.html — single-writer model, explicit transactions, `BEGIN IMMEDIATE`, commit/rollback behavior
- https://sqlite.org/wal.html — reader/writer concurrency, same-host constraint, checkpoint behavior
- https://tushare.pro/wctapi/documents/25.md — stock status values and stock-list query behavior
- https://tushare.pro/wctapi/documents/27.md — full-market daily quote queries by trade date
- https://tushare.pro/wctapi/documents/28.md — full-market adjustment factor queries by trade date
- `src/lib/refresh/refresh-store.ts` — current task-scoped schema and latest-success behavior
- `src/lib/refresh/fetch-refresh-data.ts` — current adjustment formula and provider mapping

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — milestone-level architecture conclusions validated against current code
- `.planning/research/PITFALLS.md` — milestone-level failure modes validated against current database design
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: SQLite normalized cache and generation activation
- Ecosystem: better-sqlite3, Tushare daily/adj_factor/stock_basic
- Patterns: generation publication, dynamic adjustment, legacy fallback
- Pitfalls: partial activation, mixed adjustment bases, data deletion, lock duration

**Confidence breakdown:**
- Standard stack: HIGH — existing stack and official documentation
- Architecture: HIGH — maps directly to phase invariants and current code
- Pitfalls: HIGH — derived from current schema and SQLite transaction rules
- Code examples: HIGH — official SQLite behavior plus existing project formula

**Research date:** 2026-06-25
**Valid until:** 2026-09-25
</metadata>

---

*Phase: 07-standardized-market-data-cache*
*Research completed: 2026-06-25*
*Ready for planning: yes*
