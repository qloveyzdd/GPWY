# Feature Research

**Domain:** A 股下降趋势筛选与筹码峰可视化
**Researched:** 2026-06-23
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tushare token server-side config | 数据源必须可用且 token 不能暴露 | LOW | 使用环境变量 `TUSHARE_TOKEN` |
| 手动刷新 | 用户已确认首版刷新方式 | MEDIUM | 需要刷新状态、错误提示和避免重复刷新 |
| 股票基础信息 | 结果必须显示代码和名称 | LOW | 候选接口：`stock_basic` |
| 最近 60 交易日行情 | 计算 MA 和波段高点的基础 | MEDIUM | 候选接口：`daily` 或可复权数据方案 |
| MA20/MA60 计算 | 下降趋势定义的一部分 | LOW | 必须有单元测试 |
| 最近波段高点识别 | 85% 阈值依赖该值 | MEDIUM | 前后各 3 个交易日局部高点，找不到退化为 60 日最高 |
| 下降区间筛选 | 核心筛选能力 | MEDIUM | `MA20 < MA60`、MA20 近 5 日斜率为负、当前价 <= 高点 * 0.85 |
| 筹码峰价格 | 用户明确要求 | HIGH | 候选接口：`cyq_chips`/`cyq_perf`，必须用真实 token 实测 |
| 表格展示 | 批量扫描结果 | LOW | 代码、名称、当前价、高点、比例、跌幅、筹码峰 |
| 图表展示 | 逐只股票研判 | MEDIUM | 价格、MA20、MA60、波段高点、筹码峰 |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 筛选规则解释 | 用户知道为什么入选 | LOW | 展示每只股票触发条件和关键数值 |
| API 调用缓存 | 降低 Tushare 额度消耗 | MEDIUM | 缓存最新刷新结果、交易日行情和筹码数据 |
| 失败股票明细 | 便于排查接口额度、停牌、缺数据 | MEDIUM | 记录跳过原因 |
| 一键导出 CSV | 后续离线分析方便 | LOW | 可放 v1.x |
| 参数可配置 | 允许调整窗口、阈值、斜率天数 | MEDIUM | v1 固定口径，验证后再开放 |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| 自动每日刷新 | 看起来更省事 | 增加任务调度、额度消耗和失败恢复复杂度 | 首版手动刷新 |
| 交易信号/买卖建议 | 容易被认为更有价值 | 风险高，且当前产品目标是筛选工具 | 只展示筛选依据和数据 |
| 多数据源混合 | 想补齐 Tushare 缺口 | 口径不一致，会影响 MA、价格和筹码数据可信度 | 首版坚持 Tushare |
| 自研筹码峰估算 | 可以绕过接口限制 | 用户要求优先 Tushare，未验证估算会误导 | 缺接口时标记阻塞 |

## Feature Dependencies

```text
Tushare token config
  -> stock_basic
  -> daily bars
    -> MA20/MA60
    -> swing high
    -> downtrend filter
      -> result table
      -> chart detail

Tushare token config
  -> chip candidate endpoint validation
    -> chip peak extraction
      -> result table
      -> chart detail
```

### Dependency Notes

- **筹码峰依赖接口验证:** 需要先确认当前 Tushare 账号是否能访问 `cyq_chips`、`cyq_perf` 或等价接口。
- **图表依赖行情缓存:** 图表不能只用筛选结果，需要保留最近 60 日行情序列。
- **刷新依赖状态表:** 刷新可能失败或部分完成，必须记录状态和错误。

## MVP Definition

### Launch With (v1)

- [ ] 环境变量配置 Tushare token - 数据源可用的前提。
- [ ] 手动刷新按钮 - 用户确认的首版刷新方式。
- [ ] 获取 A 股基础信息和最近 60 交易日行情 - 筛选算法输入。
- [ ] 计算 MA20/MA60 和波段高点 - 核心算法输入。
- [ ] 筛选符合下降区间 85% 条件的股票 - 核心价值。
- [ ] 验证并获取筹码峰价格 - 用户明确要求。
- [ ] 表格展示筛选结果 - 批量查看。
- [ ] 图表展示单只股票细节 - 研判价格结构和筹码峰。

### Add After Validation (v1.x)

- [ ] CSV 导出 - 当用户开始稳定使用结果后添加。
- [ ] 筛选参数可配置 - 当固定口径验证后添加。
- [ ] 刷新历史记录 - 当需要比较多次刷新结果后添加。

### Future Consideration (v2+)

- [ ] 每日定时刷新 - 首版验证后再考虑。
- [ ] 多人登录和权限 - 如果从个人使用扩展到小团队。
- [ ] PostgreSQL 远程数据库 - 如果数据量或部署形态超过 SQLite。
- [ ] 更多技术指标 - 避免首版稀释核心目标。

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tushare token config | HIGH | LOW | P1 |
| 手动刷新 | HIGH | MEDIUM | P1 |
| 行情获取与缓存 | HIGH | MEDIUM | P1 |
| MA/波段高点/85% 筛选 | HIGH | MEDIUM | P1 |
| 筹码峰获取 | HIGH | HIGH | P1 |
| 表格展示 | HIGH | LOW | P1 |
| 图表展示 | HIGH | MEDIUM | P1 |
| CSV 导出 | MEDIUM | LOW | P2 |
| 参数可配置 | MEDIUM | MEDIUM | P2 |
| 自动刷新 | LOW | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | 通用行情软件 | 本项目 |
|---------|--------------|--------|
| 行情展示 | 功能完整但筛选口径不可控 | 只展示本筛选所需字段 |
| 技术指标 | 指标丰富 | 首版只做 MA20/MA60 和波段高点 |
| 筹码分布 | 通常有可视化 | 依赖 Tushare 数据可用性，先做峰值展示 |
| 筛选逻辑 | 可能支持条件选股但不可复现 | 规则固定、可测试、可解释 |

## Sources

- https://tushare.pro/ - Tushare Pro 官方入口
- https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/client.py - 官方客户端通用 API 调用方式
- `.planning/PROJECT.md` - 用户确认的产品范围和算法口径

---
*Feature research for: A 股下降趋势筛选与筹码峰可视化*
*Researched: 2026-06-23*
