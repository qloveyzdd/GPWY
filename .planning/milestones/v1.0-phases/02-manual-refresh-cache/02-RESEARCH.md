# Phase 02 Research: Manual Refresh Cache

**Generated:** 2026-06-23
**Status:** Complete

## Findings

### SQLite Pattern

The project already uses `better-sqlite3` synchronously from server-only modules. Phase 2 should follow this pattern for refresh metadata and cached market data.

Recommended tables:
- `refresh_jobs`: one row per manual refresh.
- `stock_basics`: latest stock metadata keyed by `ts_code`.
- `daily_bars`: daily OHLCV rows keyed by `ts_code + trade_date`, associated with the refresh job that wrote them.

### Refresh Locking

Use SQLite as the source of truth for refresh state:
- A job is active when status is `running`.
- `startRefreshJob()` must be transactional: check active job, insert new running job, return job id.
- Duplicate requests return the active job instead of starting another run.

This is sufficient for the current single-process self-hosted deployment. Multi-process distributed locking remains out of scope.

### Tushare Fetch Strategy

Efficient path:
- Fetch `stock_basic` once for listed stocks.
- Fetch `daily` by `trade_date` for recent dates until 60 trading dates with data have been collected.
- Store daily bars for all returned A-share rows.

This avoids one API call per stock. The daily endpoint registry must include `open`, `high`, `low`, `close`, and `vol`.

### UI Strategy

Extend the existing status workspace:
- Add a manual refresh button separate from data-source validation.
- Add latest refresh status band.
- Poll `/api/refresh/status` while a refresh is running.
- Keep page-level access protection unchanged.

## Risks

- Fetching 60 trading dates can still consume significant API quota.
- Long-running in-process jobs can be interrupted if the server restarts.
- Tushare/tinyshare may return empty daily data on holidays; the collector must skip empty dates.

## Recommendations

- Keep Phase 2 implementation minimal and measurable.
- Do not introduce a separate queue or scheduler.
- Add tests for locking, status transitions, cache reads, and sanitized failure handling before touching real provider calls.

---

*Research completed: 2026-06-23*
