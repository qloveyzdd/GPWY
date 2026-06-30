---
phase: 09-incremental-refresh-workflow
plan: "09-03"
subsystem: refresh-operations
tags: [full-rebuild, cli, sqlite-generation, tsx]

requires:
  - phase: 09-incremental-refresh-workflow
    plan: "09-01"
    provides: "Shared operation lock and stage progress store"
  - phase: 07-standardized-market-data-cache
    provides: "Bootstrap market data with building-generation activation"
provides:
  - "Operation-locked full market rebuild runner"
  - "Server shell npm CLI for full rebuild"
  - "Stage snapshot output for rebuild progress"
  - "README operations guidance for long-running rebuilds"
affects: [deployment, operations, refresh-ui-lock]

tech-stack:
  added:
    - tsx
  patterns:
    - "Server-only maintenance commands run through npm scripts, not web UI affordances"
    - "Full rebuild reuses bootstrap activation and never writes refresh_jobs or starts screening/chip"

key-files:
  created:
    - src/lib/refresh/full-rebuild-runner.ts
    - scripts/rebuild-market-cache.ts
    - tests/refresh/full-rebuild-runner.test.ts
  modified:
    - src/lib/refresh/bootstrap-market-data.ts
    - package.json
    - package-lock.json
    - README.md

key-decisions:
  - "Full rebuild acquires the same operation lock with kind full_rebuild before provider work starts."
  - "CLI help and error output avoid printing token/config variable names, local paths, headers, or provider payloads."
  - "Full rebuild marks screening and chip stages as skipped because it only rebuilds the market cache."

patterns-established:
  - "Bootstrap progress is emitted through an optional callback while preserving old bootstrap behavior."
  - "Maintenance CLI prints JSON lines for stages and summary so server logs remain parseable."

requirements-completed: [REFR-10, REFR-12]

duration: 8 min
completed: 2026-06-29
---

# Phase 09 Plan 03: Full Rebuild CLI Summary

**维护者现在可以通过服务器 npm 命令执行 operation-locked 全量行情缓存重建，失败时保留旧 active cache。**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-29T17:41:18+08:00
- **Completed:** 2026-06-29T17:49:27+08:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- 新增 `runFullMarketRebuild`：获取 `full_rebuild` operation 锁，复用 bootstrap building-generation 写入和原子激活。
- 给 `bootstrapMarketData` 增加可选 progress callback，用于汇报 stock list 与 market data 阶段进度。
- 新增 `npm run rebuild:market` CLI；`--help` 不需要 token，不触发 provider 请求。
- CLI 阶段输出为脱敏 JSON lines；full rebuild 不写 `refresh_jobs`，不启动 screening/chip。
- README 增加“运维全量重建”章节，明确网页没有 full rebuild 入口，失败时旧结果可用。

## Task Commits

1. **Task 1-2: Full rebuild runner, CLI, dependency lock, README** - `1addbe6` (`feat`)

## Files Created/Modified

- `src/lib/refresh/full-rebuild-runner.ts` - Full rebuild orchestration and operation lock integration.
- `scripts/rebuild-market-cache.ts` - Server-side npm CLI entrypoint.
- `tests/refresh/full-rebuild-runner.test.ts` - Covers success, failure preservation, and lock conflict.
- `src/lib/refresh/bootstrap-market-data.ts` - Optional progress callbacks without changing activation behavior.
- `package.json` / `package-lock.json` - Adds `rebuild:market` script and local `tsx` dev dependency.
- `README.md` - Adds operations-only rebuild instructions and risk notes.

## Decisions Made

- `tsx` is installed locally so the CLI does not depend on global tools.
- Full rebuild failure throws a stable sanitized error after bootstrap cleanup finishes.
- CLI help uses “provider token” wording instead of printing sensitive env var names.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial CLI help text mentioned the exact token env var name; updated to meet the CLI output redaction requirement.
- A test mock containing the word `token` correctly triggered invalid-token classification; changed the mock to a network-type failure for the intended failure-path assertion.

## User Setup Required

None - existing server provider configuration is reused.

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/refresh/full-rebuild-runner.test.ts tests/refresh/bootstrap-market-data.test.ts`
- `D:\NodeJS\npm.cmd run rebuild:market -- --help`
- `D:\NodeJS\npm.cmd run typecheck`
- `D:\NodeJS\npm.cmd run lint -- src/lib/refresh scripts tests/refresh`

All 9 focused tests, CLI help, type checking, and focused lint passed.

## Self-Check: PASSED

- Full rebuild success activates a new generation and retires the old active generation.
- Full rebuild failure deletes the building generation and keeps the previous active generation.
- Full rebuild conflicts with an existing operation lock.
- CLI help succeeds without token and does not print sensitive config names or local paths.

## Next Phase Readiness

Ready for 09-04 status UI. The UI must show operation/stage state and must not expose full rebuild controls.

---
*Phase: 09-incremental-refresh-workflow*
*Completed: 2026-06-29*
