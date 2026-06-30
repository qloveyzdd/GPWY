# Phase 7: Standardized Market Data Cache - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 07-standardized-market-data-cache
**Areas discussed:** 首次引导方式、历史数据保留、缓存切换标准、旧缓存处理

---

## 首次引导方式

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Upgrade entry | Automatic bootstrap; require operator initialization; planner decides | Automatic bootstrap |
| UI state | Show initialization state; keep ordinary refresh state; planner decides | Show “正在初始化缓存” |
| Failed bootstrap | Resume partial data; restart all 60 days; planner decides | Restart all 60 days |
| Legacy result visibility | Show with legacy label; show without label; hide; planner decides | Show with “旧缓存结果” |

**User's choice:** First web refresh automatically bootstraps 60 days. Partial data is discarded on failure, while legacy results remain visible with an explicit label.
**Notes:** No separate operator initialization is required.

---

## 历史数据保留

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Quote retention | Accumulate; rolling 60 days; planner decides | Accumulate |
| Delisted/suspended history | Retain; delete with current list; planner decides | Retain |
| Stock statuses | Preserve all statuses; listed only; planner decides | Preserve listed/suspended/delisted |
| Automatic expiry | None; fixed retention period; planner decides | None |

**User's choice:** Start with 60 days and retain all future data without automatic deletion.
**Notes:** Screening still reads only the latest 60 valid dates and only processes currently tradable stocks.

---

## 缓存切换标准

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Stock coverage | Market-complete/stock-tolerant; every stock strict; planner decides | Market-complete/stock-tolerant |
| Missing factor | Skip stock; block all activation; use raw quote; planner decides | Skip stock and record reason |
| Date completeness | Strict 60 dates; allow missing dates; planner decides | Strict 60 dates |
| Post-activation action | Run screening immediately; wait for another refresh; planner decides | Run screening immediately |

**User's choice:** Activate when the market-level 60-day set is complete. Stocks with insufficient history or missing factors are skipped rather than blocking the whole market.
**Notes:** Unadjusted fallback is explicitly rejected.

---

## 旧缓存处理

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Old tables | Retain; delete immediately; planner decides | Retain |
| Fallback | Automatic pre-activation fallback; manual env switch; no fallback; planner decides | Automatic pre-activation fallback |
| Cleanup | Operator command; manual instructions; no cleanup in phase; planner decides | No cleanup in Phase 7 |
| UI disk notice | No notice; status notice; planner decides | No notice |

**User's choice:** Preserve old cache tables as an internal fallback until the new cache activates; after activation they remain as backup only.
**Notes:** Phase 7 does not add cleanup tooling or user-facing storage information.

---

## the agent's Discretion

- Normalized schema and index names.
- Internal cache generation/readiness representation.
- Validation report shape and skip-reason identifiers.
- Exact provider request strategy for synchronizing multiple stock statuses.

## Deferred Ideas

- Old cache cleanup and SQLite compaction.
- Provider concurrency and persistent tinyshare workers.
- Ordinary incremental refresh and interruption recovery.
- Full-history backfill.
