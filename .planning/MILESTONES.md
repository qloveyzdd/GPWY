# Project Milestones: A Stock Downtrend Screener

## v1.0 MVP (Shipped: 2026-06-24)

**Delivered:** 可云端自托管的个人 A 股下降趋势筛选网页，支持 Tushare/tinyshare 手动刷新、可解释筛选、前三筹码峰、结果排序和行内 K 线图。

**Phases completed:** 1-6（16 个计划，36 个任务）

**Key accomplishments:**

- 建立密码保护、服务端密钥边界、SQLite 快照和脱敏错误处理。
- 打通真实 tinyshare/Tushare 数据刷新、60 个交易日复权行情缓存与并发刷新锁。
- 实现 MA20/MA60、MA20 负斜率、用户确认的区间高点回溯规则及 85% 阈值筛选。
- 从官方 `cyq_chips` 提取并持久化前三筹码峰及占比，不可用时显式阻塞而不估算。
- 交付可排序结果表和点击行展开的 ECharts K 线图，保证表格与图表数值一致。
- 完成云端自托管说明、95 项自动测试、生产构建和 Playwright 浏览器冒烟验证。

**Stats:**

- 170 个文件创建或修改
- 约 9,799 行 TypeScript/Python
- 6 个阶段、16 个计划、36 个任务
- 2 天（2026-06-23 → 2026-06-24）
- 23 个测试文件、95 项测试、1 项浏览器冒烟测试

**Git range:** `0522ef9` → `6b1caa2`

**Known technical debt:** 官方筹码 enrichment 当前按入选股票串行请求，入选数量较多时刷新耗时会增长。

**What's next:** 通过 `$gsd-new-milestone` 决定优先处理刷新性能、自动化、可配置筛选或导出能力。

---
