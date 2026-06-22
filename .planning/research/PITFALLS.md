# Pitfalls Research

**Domain:** A 股数据筛选与可视化网页
**Researched:** 2026-06-23
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: 筹码峰接口假设错误

**What goes wrong:**
实现时假设 Tushare 一定直接提供“筹码峰价格”字段，结果实际只有分布数据、权限不足或字段口径不同。

**Why it happens:**
Tushare 文档和账号权限强相关，公开抓取不一定能看到完整接口细节。

**How to avoid:**
第一阶段必须用真实 token 验证 `cyq_chips`、`cyq_perf` 或等价接口，记录字段、样例响应和权限结果。如果只有分布数据，则把筹码峰定义为分布中 `percent` 最大的价格档，并写测试。

**Warning signs:**
接口返回空数据、权限错误、字段缺失，或同一股票不同日期数据不连续。

**Phase to address:**
Phase 1: Tushare data foundation.

---

### Pitfall 2: 复权口径不明确导致 MA 和波段高点失真

**What goes wrong:**
用未复权价格计算 MA20/MA60 和波段高点，遇到除权除息后出现虚假跳空，筛选结果被污染。

**Why it happens:**
技术分析通常需要统一复权口径，但首版容易直接取 `daily` 原始价。

**How to avoid:**
实现阶段必须明确使用未复权、前复权或后复权。若能稳定获得复权数据，优先使用前复权；否则在 UI 和文档中标明口径。

**Warning signs:**
某些股票在分红送转日期附近被异常筛入，MA 曲线出现非市场原因断崖。

**Phase to address:**
Phase 1: Tushare data foundation.

---

### Pitfall 3: Tushare API 额度和耗时被低估

**What goes wrong:**
一次刷新对所有 A 股逐只请求 60 日行情和筹码数据，触发限频、超时或额度耗尽。

**Why it happens:**
个人工具容易忽视全市场股票数量和接口调用成本。

**How to avoid:**
先批量或按交易日拉取行情数据，只对筛选候选股请求筹码接口。所有刷新结果落库缓存，刷新按钮加锁。

**Warning signs:**
刷新时间越来越长、接口返回频率限制、部分股票缺数据但没有错误记录。

**Phase to address:**
Phase 2: Screening pipeline.

---

### Pitfall 4: 波段高点算法边界没测

**What goes wrong:**
局部高点在窗口边缘、停牌缺数据、连续相同高点时行为不一致，导致筛选结果不可解释。

**Why it happens:**
“最近一个波段高点”是业务定义，不是库函数。

**How to avoid:**
写单元测试覆盖：正常局部高点、无局部高点退化为 60 日最高、窗口边缘、相同 high、数据不足 60 日。

**Warning signs:**
同一股票刷新后高点突然变化，但原始行情没有明显变化。

**Phase to address:**
Phase 2: Screening pipeline.

---

### Pitfall 5: 图表看起来完成但不能解释筛选

**What goes wrong:**
图表只画价格和均线，没有标出波段高点、85% 阈值或筹码峰，用户无法判断为什么入选。

**Why it happens:**
图表实现容易先追求视觉效果，忽略解释性。

**How to avoid:**
图表必须至少包含价格、MA20、MA60、波段高点、85% 阈值线和筹码峰标记。

**Warning signs:**
表格有数值但图表无法定位这些数值。

**Phase to address:**
Phase 3: Results UI and charts.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 不保存原始 API 响应 | 快速展示结果 | 无法排查错误或复现结果 | 只在一次性 spike 中可接受 |
| 把筛选逻辑写在 API route 里 | 初期代码少 | 难测试，难复用 | 不建议 |
| 忽略刷新锁 | 实现简单 | 重复刷新导致额度浪费和数据竞争 | 不可接受 |
| 不记录失败股票 | 页面更干净 | 用户不知道结果是否完整 | 不可接受 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tushare token | 放到浏览器环境变量或客户端代码 | 只在服务端读取 |
| Tushare fields | 不指定字段，响应结构随接口变化 | 明确 fields，响应校验 |
| SQLite | 在多实例/serverless 下写本地文件 | 首版自托管单实例；多实例再换数据库 |
| ECharts | 服务端渲染图表组件 | 图表组件标记为 client component |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 逐只股票逐接口请求 | 刷新非常慢 | 批量行情、候选后再取筹码 | 全市场刷新 |
| 不缓存行情 | 每次打开页面都调 Tushare | 页面读本地 latest run | 多次查看结果 |
| 一次返回所有图表序列 | 首屏慢 | 表格先加载，图表按选中股票加载 | 候选股较多 |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| 暴露 Tushare token | 额度被盗用 | 服务端调用，token 不进前端 bundle |
| 公开刷新接口 | 外部用户刷爆额度 | 个人入口加最小访问控制或内网限制 |
| 错误信息直接显示 token/请求体 | 泄露敏感信息 | 错误脱敏后展示 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 只显示“刷新失败” | 不知道是 token、额度还是数据问题 | 展示脱敏错误类别和失败股票数 |
| 无刷新时间 | 不知道数据是否最新 | 显示最新成功刷新时间和交易日 |
| 表格无法排序 | 难以快速研判 | 按跌幅、当前/高点比例、筹码峰距离排序 |
| 图表没有标记 | 看不出入选原因 | 明确标注高点、阈值和筹码峰 |

## "Looks Done But Isn't" Checklist

- [ ] **筹码峰:** 验证接口字段和权限，不只写假数据。
- [ ] **下降趋势:** 测试 `MA20 < MA60` 和 MA20 近 5 日斜率。
- [ ] **波段高点:** 测试局部高点和退化逻辑。
- [ ] **刷新:** 防重复刷新并记录失败原因。
- [ ] **图表:** 标出筛选依据，而不是只画价格线。
- [ ] **安全:** token 不出现在客户端 bundle 和日志。

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 筹码接口不可用 | MEDIUM | 记录阻塞，确认 Tushare 权限或改需求 |
| 复权口径错误 | MEDIUM | 重新拉取行情、重算缓存结果 |
| 刷新过慢 | MEDIUM | 增加缓存、批量策略、候选后再拉筹码 |
| 算法边界错误 | LOW | 补测试，重算结果 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 筹码峰接口假设错误 | Phase 1 | 真实 token 调用样例通过 |
| 复权口径不明确 | Phase 1 | 明确行情价格口径并测试 |
| API 额度和耗时低估 | Phase 2 | 刷新流程记录耗时和调用量 |
| 波段高点边界没测 | Phase 2 | 单元测试覆盖边界 |
| 图表不能解释筛选 | Phase 3 | 页面截图验证标记存在 |

## Sources

- https://tushare.pro/ - official Tushare Pro source
- https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/client.py - official generic API invocation pattern
- `.planning/PROJECT.md` - confirmed product and algorithm constraints

---
*Pitfalls research for: A 股数据筛选与可视化网页*
*Researched: 2026-06-23*
