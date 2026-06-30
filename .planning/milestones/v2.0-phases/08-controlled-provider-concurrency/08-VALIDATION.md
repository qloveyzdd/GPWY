---
phase: 8
slug: controlled-provider-concurrency
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-26
---

# Phase 8 — Validation Strategy

> 受控并发、退避和 worker 恢复的执行期反馈采样契约。

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `D:\NodeJS\npm.cmd run test -- --run tests/tushare/request-scheduler.test.ts` |
| **Full suite command** | `D:\NodeJS\npm.cmd run verify` |
| **Estimated runtime** | focused tests 3–10 秒；full verify 30 秒内 |

## Sampling Rate

- **After every task commit:** 运行该任务列出的 focused Vitest。
- **After every plan wave:** 运行 Phase 8 所有 provider/refresh/chip/validation 测试和 `typecheck`。
- **Before `$gsd-verify-work`:** `D:\NodeJS\npm.cmd run verify` 必须通过。
- **Max feedback latency:** focused tests 10 秒。

## Threat References

| Threat | Risk | Required secure behavior |
|--------|------|--------------------------|
| **T-08-01** | 多 runtime 导致真实并发超过配置 | scheduler 必须是服务进程级共享实例 |
| **T-08-02** | token、Python 路径或 stderr 泄露 | 协议和错误只暴露脱敏类别与接口名 |
| **T-08-03** | 超时 Promise 结束但底层请求继续 | REST abort 实际 fetch，tinyshare 终止 worker |
| **T-08-04** | worker 无限重启或请求永久悬挂 | 请求和槽位都有固定预算，所有 Promise 必须 settle |
| **T-08-05** | bootstrap 失败清理与迟到写入竞争 | 全部并行任务 settle 后才删除 building generation |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | REFR-06 | T-08-01 | 全局峰值在途数不超过配置 | unit | `D:\NodeJS\npm.cmd run test -- --run tests/tushare/request-scheduler.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | REFR-07 | T-08-03 | 超时、三次尝试、退避和错误分类稳定 | unit | `D:\NodeJS\npm.cmd run test -- --run tests/tushare/request-scheduler.test.ts tests/validation/error-sanitizer.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | REFR-06 | T-08-01 | 优先级老化避免筹码饥饿 | unit | `D:\NodeJS\npm.cmd run test -- --run tests/tushare/request-scheduler.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | REFR-08 | T-08-02 | worker 复用 SDK 且 JSON Lines 不泄露 token | integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/tinyshare-provider.test.ts` | partial | ⬜ pending |
| 08-02-02 | 02 | 2 | REFR-08 | T-08-03, T-08-04 | 超时/退出重建有界并最终 settle | integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/tinyshare-provider.test.ts` | partial | ⬜ pending |
| 08-03-01 | 03 | 3 | REFR-06, REFR-07 | T-08-01, T-08-03 | REST/tinyshare 共用 runtime 与重试契约 | integration | `D:\NodeJS\npm.cmd run test -- --run tests/tushare/provider-runtime.test.ts tests/validation/config-boundary.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-02 | 03 | 3 | REFR-06 | T-08-01 | validation 请求使用最高优先级 | integration | `D:\NodeJS\npm.cmd run test -- --run tests/validation/basic-data.test.ts tests/validation/chip-price-validation.test.ts` | ✅ | ⬜ pending |
| 08-04-01 | 04 | 4 | REFR-06 | T-08-05 | 行情/factor 并行且失败后无迟到写入 | integration | `D:\NodeJS\npm.cmd run test -- --run tests/refresh/bootstrap-market-data.test.ts tests/refresh/fetch-refresh-data.test.ts` | ✅ | ⬜ pending |
| 08-04-02 | 04 | 4 | REFR-06, REFR-07 | T-08-01 | 多股票筹码并行且行级失败语义不变 | integration | `D:\NodeJS\npm.cmd run test -- --run tests/chip/chip-runner.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `tests/tushare/request-scheduler.test.ts` — 并发峰值、退避、超时、动态并发、优先级和防饥饿。
- [ ] `tests/tushare/provider-runtime.test.ts` — global runtime、provider 共享、配置和释放。
- [ ] 扩展 `tests/validation/tinyshare-provider.test.ts` — 持久协议、worker 复用、重建预算和池失效。
- [ ] 使用现有 Vitest 假时钟和临时脚本，不新增测试框架。

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| tinyshare 真实 SDK 在多个连续请求中复用同一 Python PID | REFR-08 | tinyshare 为闭源 bytecode，测试替身不能证明真实 SDK 内部状态 | 使用 tinyshare provider 运行一次验证和小批量刷新，观察日志/诊断 PID 数稳定且请求成功 |
| 默认并发 8 是否触发真实账户限频 | REFR-06 | 依赖账户额度和部署网络 | 部署后运行刷新，确认限频时有效并发会下降且任务最终收尾 |

## Validation Sign-Off

- [x] 所有计划任务都有自动验证或 Wave 0 依赖。
- [x] 不存在连续 3 个任务无自动验证。
- [x] Wave 0 覆盖全部新增测试文件。
- [x] 所有命令均为非 watch 模式。
- [x] focused feedback latency 目标小于 10 秒。
- [x] `nyquist_compliant: true` 已设置。

**Approval:** approved 2026-06-26
