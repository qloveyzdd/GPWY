# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-24
**Phases:** 6 | **Plans:** 16 | **Tasks:** 36

### What Was Built

- 受密码保护的 Next.js 工作台和服务端 Tushare/tinyshare 数据边界。
- 手动刷新、SQLite 缓存、下降趋势筛选和官方前三筹码峰完整流程。
- 可排序结果表、行内 K 线图、云端部署说明和浏览器冒烟验证。

### What Worked

- 先验证真实数据接口和权限，再扩展筛选与 UI，避免在错误数据口径上继续开发。
- 将 MA、区间高点和筹码提取写成纯函数，使规则调整能用回归测试快速确认。
- 任务级 SQLite 快照让失败刷新不会污染最新成功结果，也让表格与图表复用同一数据。

### What Was Inefficient

- 区间高点规则在实现后经历多次口径澄清，导致规划文档和阶段验证需要补齐。
- Phase 2 和多个阶段的 Nyquist 文档未在阶段结束时同步生成，里程碑关闭前产生额外审计工作。
- Playwright 浏览器安装在本机不可用，最终依赖系统 Chrome fallback。

### Patterns Established

- 前端只读取持久化快照，provider 调用和密钥始终留在服务端。
- 官方数据不可用时显式展示 blocked/failed，不使用未经验证的近似值。
- 表格与图表从同一 screening run 和 refresh job 读取关键数值。
- 每阶段保留 `VERIFICATION.md` 和 `VALIDATION.md`，需求编号必须显式映射。

### Key Lessons

1. 业务算法规则必须先用具体股票样例和边界条件写成测试，再锁定需求文字。
2. 外部数据能力必须把“可用性、权限、价格口径、失败状态”作为产品行为，而不只是接入细节。
3. 阶段完成时同步维护验证文档，避免里程碑收尾阶段集中补证据。

### Cost Observations

- Model mix: 未记录。
- Sessions: 多轮交互完成 6 个阶段。
- Notable: 主要返工来自需求口径和验证文档漂移，而不是代码架构。

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 多轮 | 6 | 建立真实数据优先、纯函数算法和阶段级验证证据链 |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 95 + 1 smoke | 未统计行覆盖率 | 多数业务逻辑使用现有 Vitest/SQLite 工具链 |

### Top Lessons (Verified Across Milestones)

1. 待后续里程碑交叉验证。
