---
phase: 01-tushare-data-foundation
plan: "01-02"
subsystem: tushare-validation-api
tags: [tushare, stock_basic, daily, zod, sqlite, api-route, error-sanitizer]
requires:
  - phase: 01-01
    provides: "Protected validation route, server config boundary, SQLite snapshot store, status workspace"
provides:
  - "Server-only generic Tushare REST client"
  - "Central endpoint registry for stock_basic, daily, adj_factor, and chip candidates"
  - "Stable Tushare error categorization and sanitized messages"
  - "Protected stock_basic validation runner with daily price-basis probe"
  - "Latest validation snapshot writes for basic data validation"
affects: [01-03, chip-validation, price-basis-decision, screening-cache]
tech-stack:
  added: []
  patterns: [generic-tushare-query, endpoint-registry, sanitized-external-error, validation-runner]
key-files:
  created:
    - src/lib/tushare/client.ts
    - src/lib/tushare/endpoints.ts
    - src/lib/tushare/types.ts
    - src/lib/validation/run-basic-validation.ts
    - tests/validation/error-sanitizer.test.ts
    - tests/validation/basic-data.test.ts
  modified:
    - src/app/api/validation/run/route.ts
    - src/lib/config.ts
    - README.md
key-decisions:
  - "Use official Tushare generic POST body shape: api_name, token, params, fields."
  - "Treat stock_basic success plus daily availability as warning overall because chip candidate validation remains pending."
  - "Store unadjusted_daily as a machine-readable price-basis candidate; final adjusted basis remains for 01-03."
patterns-established:
  - "Tushare errors are converted to fixed categories before storage or UI exposure."
  - "Validation runners accept an injectable client so tests do not consume real Tushare quota."
  - "Status API remains read-only against SQLite; only POST /api/validation/run can call Tushare."
requirements-completed: [CONF-01, DATA-01, DATA-03, DATA-04, DEPL-02]
duration: 18min
completed: 2026-06-23
---

# Phase 01-02: Tushare Validation API Summary

**服务端 Tushare generic client、stock_basic 样本验证、daily 价格口径探针和稳定错误脱敏分类。**

## Performance

- **Duration:** 约 18 分钟
- **Started:** 2026-06-23T06:25:00+08:00
- **Completed:** 2026-06-23T06:32:00+08:00
- **Tasks:** 2
- **Files modified:** 9 个

## Accomplishments

- 新增 `TushareClient.query()`，按官方 `api_name/token/params/fields` 形状请求 Tushare。
- 新增 endpoint registry：`stock_basic`、`daily`、`adj_factor`、`cyq_chips`、`cyq_perf`。
- 新增错误分类：`missing_config`、`invalid_token`、`permission_denied`、`empty_data`、`rate_limited`、`network_or_service`、`unknown`。
- `/api/validation/run` 已接入 `runBasicValidation()`，可写入股票基础样本和 `unadjusted_daily` 价格口径候选。
- 测试覆盖错误脱敏、请求体形状、缺 token、stock_basic 成功和 daily 探针。

## Task Commits

1. **Task 1: Create server-only Tushare client and error sanitizer** - `8bdde5c` (`feat`)
2. **Task 2: Implement basic data validation route and latest-status API** - `a05b844` (`feat`)
3. **README sync** - `9cd9824` (`docs`)

## Files Created/Modified

- `src/lib/tushare/client.ts` - Tushare REST client、响应 zod 校验、错误脱敏分类。
- `src/lib/tushare/endpoints.ts` - Tushare endpoint 和字段注册表。
- `src/lib/tushare/types.ts` - client、endpoint、错误和 data table 类型。
- `src/lib/validation/run-basic-validation.ts` - stock_basic 与 daily 探针 runner，并写入 SQLite 快照。
- `src/app/api/validation/run/route.ts` - 受保护 POST 入口调用真实 validation runner。
- `src/lib/config.ts` - 空字符串 env 按未配置处理。
- `tests/validation/error-sanitizer.test.ts` - 错误分类、脱敏和请求体形状测试。
- `tests/validation/basic-data.test.ts` - 缺 token 和成功验证快照测试。
- `README.md` - 当前验证能力说明。

## Decisions Made

- 不在 GET `/api/status` 中调用 Tushare；该接口继续只读 SQLite，避免页面加载消耗额度。
- `daily` 当前只作为未复权价格可用性探针，最终前复权/未复权决策留到 01-03 记录。
- 测试使用 injectable client，不依赖真实 token；真实 token 验证保留到 01-03 的人工检查点。

## Deviations from Plan

None - plan executed within intended scope.

## Issues Encountered

- Next 16 仍提示 `middleware` 文件约定已弃用并建议 `proxy`；01-02 未改变该 01-01 决策。
- 未进行真实 Tushare token 人工验证；这是 01-03 明确的检查点，不在本计划自动执行。

## User Setup Required

真实验证需要服务器 `.env.local` 包含：

```bash
APP_PASSWORD=your-access-password
TUSHARE_TOKEN=your-tushare-token
```

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests/validation/basic-data.test.ts tests/validation/error-sanitizer.test.ts` - PASS
- `D:\NodeJS\npm.cmd run verify` - PASS，6 个测试文件、15 个测试通过。
- `rg "NEXT_PUBLIC_TUSHARE|secret-token-value|request-only-token|TUSHARE_TOKEN|readTushareTokenSecret|TushareClient" -n src tests README.md package.json` - PASS，真实 token 读取仅在服务端配置/runner 路径；假 token 只在测试中使用。

## Next Phase Readiness

01-03 可以直接复用：

- `TUSHARE_ENDPOINTS.adjFactor` 做前复权价格口径验证。
- `TUSHARE_ENDPOINTS.chipChips` / `chipPerf` 做筹码候选接口可用性验证。
- `classifyTushareError()` 统一处理权限不足、限频、空数据和网络失败。
- `runBasicValidation()` 的 snapshot 结构可扩展为完整 Phase 1 状态。

## Self-Check: PASSED

- Summary 已创建。
- 计划验证命令已通过。
- 代码与 README 已提交。
- 已知风险已记录。

---
*Phase: 01-tushare-data-foundation*
*Completed: 2026-06-23*
