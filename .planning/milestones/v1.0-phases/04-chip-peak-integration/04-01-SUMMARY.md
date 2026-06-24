---
phase: 04-chip-peak-integration
plan: "04-01"
subsystem: chip-peak-parser
tags: [cyq_chips, chip-peak, parser, pure-functions]
requires:
  - phase: 01-03
    provides: "Validated cyq_chips endpoint availability"
provides:
  - "cyq_chips table mapper"
  - "Highest-percent chip peak extractor"
  - "Deterministic tie-break behavior"
affects: [04-02, 05-results-table-experience, 06-charts-and-deployment]
key-files:
  created:
    - src/lib/chip/chip-types.ts
    - src/lib/chip/chip-peak.ts
    - tests/chip/chip-peak.test.ts
  modified: []
requirements-completed: [CHIP-02]
duration: 3min
completed: 2026-06-23
---

# Phase 04-01: Chip Peak Parser Summary

**Added pure `cyq_chips` distribution parsing and highest-percent chip peak extraction.**

## Accomplishments

- 新增 `ChipDistributionRow` 和 `ChipPeakExtraction` 类型。
- 新增 `mapCyqChipsTable()`，将官方 `cyq_chips` 表格映射为 typed rows。
- 新增 `extractChipPeak()`，从最新交易日的筹码分布中取 `percent` 最大的价格档。
- 百分比并列时使用较低价格作为 deterministic tie-break。
- 空数据和 malformed row 直接失败，不生成估算筹码峰。

## Task Commits

1. **Task 1/2: Chip peak parser tests and implementation** - `5eba2b0` (`feat`)

## Verification

- `D:\NodeJS\npm.cmd run test -- --run tests\chip\chip-peak.test.ts` - PASS，4 个测试通过。
- `D:\NodeJS\npm.cmd run typecheck` - PASS。

## Next Phase Readiness

04-02 可以复用：

- `mapCyqChipsTable()` 解析 provider 返回表格。
- `extractChipPeak()` 生成 `chipPeakPrice`, `peakPercent`, `tradeDate`, `source`。

## Self-Check: PASSED

- 代码为纯函数，无 provider/database 耦合。
- 没有使用 `cyq_perf` 或自研估算替代筹码峰。
- 定向测试和类型检查通过。

---
*Phase: 04-chip-peak-integration*
*Completed: 2026-06-23*
