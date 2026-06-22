---
phase: 01-tushare-data-foundation
plan: "01-03"
subsystem: tushare-chip-price-validation
tags: [tushare, tinyshare, cyq_chips, cyq_perf, price-basis, validation, python-bridge]
requires:
  - phase: 01-02
    provides: "Server-only Tushare client, endpoint registry, protected validation route, sanitized error categories"
provides:
  - "Price-basis validation that prefers front-adjusted data when adj_factor is available"
  - "Chip candidate endpoint validation for cyq_chips and cyq_perf"
  - "Final sanitized validation snapshot sections for price basis and chip candidate status"
  - "tinyshare Python provider for tinyshare authorization-code compatibility"
  - "Local real-token verification path without committing secrets"
affects: [02-manual-refresh-cache, 03-downtrend-screening-engine, 04-chip-peak-integration, deployment]
tech-stack:
  added: [tinyshare, python-bridge]
  patterns: [provider-switch, python-stdin-json-bridge, sanitized-validation-snapshot, injectable-tushare-client]
key-files:
  created:
    - requirements.txt
    - scripts/tinyshare_bridge.py
    - src/lib/tushare/provider.ts
    - src/lib/tushare/tinyshare-client.ts
    - tests/validation/tinyshare-provider.test.ts
    - .planning/phases/01-tushare-data-foundation/01-03-USER-SETUP.md
  modified:
    - README.md
    - src/lib/config.ts
    - src/lib/validation/chip-and-price-validation.ts
    - src/lib/validation/result-sanitizer.ts
    - src/lib/validation/run-basic-validation.ts
    - tests/validation/basic-data.test.ts
    - tests/validation/chip-price-validation.test.ts
    - tests/validation/config-boundary.test.ts
    - tests/ui/status-workspace.test.tsx
key-decisions:
  - "Prefer front-adjusted pricing when daily plus adj_factor probes are available; otherwise record unadjusted fallback risk explicitly."
  - "Treat chip capability as measured endpoint status only; do not synthesize a chip peak before official chip data is available."
  - "Add TUSHARE_PROVIDER=tinyshare so tinyshare authorization codes can be used without exposing secrets to the browser."
patterns-established:
  - "Tushare provider selection is server-side and defaults to REST unless explicitly configured."
  - "Python bridge calls receive JSON over stdin and return sanitized JSON over stdout."
  - "Validation snapshots store only stable categories, summaries, and table-safe details."
requirements-completed: [DATA-03, DATA-04, CHIP-01, DEPL-02]
duration: 35min
completed: 2026-06-23
---

# Phase 01-03: Chip and Price Validation Summary

**真实 tinyshare 链路验证了行情、前复权候选和筹码候选接口，并把价格口径与筹码能力写入脱敏状态快照。**

## Performance

- **Duration:** 约 35 分钟
- **Started:** 2026-06-23T06:38:00+08:00
- **Completed:** 2026-06-23T07:12:00+08:00
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- 新增价格口径验证：使用 `daily` 与 `adj_factor` 判断是否可采用前复权价格口径，并在不可用时记录未复权 fallback 风险。
- 新增筹码候选接口验证：探测 `cyq_chips` 与 `cyq_perf`，只记录 available / permission / empty / blocked 等能力状态。
- 新增最终快照脱敏：过滤 token、请求头、异常栈、本地路径和 token-shaped 字符串，避免状态页泄密。
- 新增 tinyshare Python provider：`TUSHARE_PROVIDER=tinyshare` 时通过 `scripts/tinyshare_bridge.py` 调用 tinyshare 授权码。
- 完成本地真实授权验证：`daily` 返回 6 行，`cyq_chips` 返回 624 行，`cyq_perf` 返回 6 行。

## Task Commits

1. **Task 1: Implement chip candidate and price-basis decision runner** - `594439c` (`feat`)
2. **Task 2: Complete status workspace safe-copy coverage** - `6784d11` (`test`)
3. **Task 3: Verify real-token behavior and tinyshare compatibility** - `652c59e` (`feat`)

## Files Created/Modified

- `src/lib/validation/chip-and-price-validation.ts` - 价格口径与筹码候选接口验证。
- `src/lib/validation/result-sanitizer.ts` - 最终快照脱敏。
- `src/lib/validation/run-basic-validation.ts` - 汇总 stock/basic、价格口径和筹码候选状态。
- `src/lib/tushare/provider.ts` - REST/tinyshare provider 选择。
- `src/lib/tushare/tinyshare-client.ts` - Node 到 Python bridge 的 TushareClientLike 实现。
- `scripts/tinyshare_bridge.py` - tinyshare 调用桥接脚本。
- `requirements.txt` - tinyshare Python 依赖。
- `README.md` - tinyshare 本地配置说明。
- `tests/validation/*.test.ts` 与 `tests/ui/status-workspace.test.tsx` - 覆盖脱敏、provider、配置边界和状态页行为。

## Decisions Made

- REST Tushare 仍保留为默认 provider；只有显式设置 `TUSHARE_PROVIDER=tinyshare` 才启用 tinyshare。
- tinyshare 授权码只通过 `.env.local`/环境变量进入服务端，不写入仓库。
- 筹码峰仍不在 Phase 1 计算；Phase 4 再从 `cyq_chips` 的最高占比价格档提取真实筹码峰。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 直接 Tushare REST 不接受用户提供的授权码**
- **Found during:** Task 3 real-token verification
- **Issue:** 用户提供的是 tinyshare 授权码；直接 REST 调用返回 invalid token，无法完成真实接口验证。
- **Fix:** 新增 tinyshare Python provider，并保持 REST provider 为默认值。
- **Files modified:** `requirements.txt`, `scripts/tinyshare_bridge.py`, `src/lib/tushare/provider.ts`, `src/lib/tushare/tinyshare-client.ts`, `src/lib/config.ts`, `README.md`, provider tests。
- **Verification:** `daily`、`cyq_chips`、`cyq_perf` 真实桥接探测成功；`D:\NodeJS\npm.cmd run verify` 通过。
- **Committed in:** `652c59e`

**Total deviations:** 1 auto-fixed blocking issue.
**Impact on plan:** 保持数据来源口径不变，扩大了 token 兼容路径；没有引入前端 token 暴露。

## Issues Encountered

- Next 16 仍提示 `middleware` 文件约定已弃用，建议迁移到 `proxy`。这是 Phase 1 既有警告，构建通过，本阶段未扩大范围处理。

## User Setup Required

已记录在 `01-03-USER-SETUP.md`。本地 `.env.local` 已配置完成；云端部署时需要重复配置环境变量，不能提交真实授权码。

## Verification

- `python -m py_compile scripts\tinyshare_bridge.py` - PASS
- `D:\NodeJS\npm.cmd run test -- --run tests\validation\tinyshare-provider.test.ts tests\validation\config-boundary.test.ts tests\validation\basic-data.test.ts tests\validation\chip-price-validation.test.ts` - PASS
- `D:\NodeJS\npm.cmd run verify` - PASS，8 个测试文件、23 个测试通过，生产构建通过。
- 真实 tinyshare bridge probe - PASS：`daily` 6 行，`cyq_chips` 624 行，`cyq_perf` 6 行。
- 用户页面验证 - approved，当前本地服务可打开且无明显问题。

## Next Phase Readiness

Phase 2 可以直接复用：
- `TushareClientLike` 抽象与 provider 选择。
- `TUSHARE_ENDPOINTS.stockBasic`、`daily`、`adjFactor`、`chipChips`、`chipPerf`。
- SQLite 目录创建和服务端写入模式。
- 脱敏错误分类和 validation snapshot 展示经验。

Phase 2 应先实现手动刷新、刷新锁和 60 日行情缓存；Phase 3 再基于缓存实现 MA20/MA60 与下降趋势筛选。

## Self-Check: PASSED

- Summary 已创建。
- User setup 已记录。
- 01-03 相关代码提交存在。
- 自动验证和真实 tinyshare 探测通过。
- 用户已确认页面当前没有问题。

---
*Phase: 01-tushare-data-foundation*
*Completed: 2026-06-23*
