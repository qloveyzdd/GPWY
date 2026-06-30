# Project Milestones: A Stock Downtrend Screener

## v2.0 增量刷新与筹码分布对比 (Shipped: 2026-06-30)

**Phases completed:** 5 phases, 20 plans, 52 tasks

**Key accomplishments:**

- SQLite generation storage now preserves raw quotes, independent factors, and L/P/D stock status behind a strict atomic activation boundary.
- Screening and charts now derive front-adjusted prices from raw generation data and remain bound to the exact generation that produced each result.
- The first manual refresh now rebuilds 60 official market dates from Tushare raw data, atomically activates the generation, and immediately publishes normalized screening results.
- Bootstrap now has explicit user-facing state, legacy results remain usable and labeled, and result/chart provenance stays consistent during concurrent refresh completion.
- 所有 provider 请求具备统一硬并发上限、有界重试、动态降并发、优先级老化和真实 REST 取消能力
- tinyshare 查询复用固定 Python 进程，并在超时、退出、畸形协议和重建预算耗尽时确定结束
- REST 与 tinyshare 生产客户端共享进程级 scheduler，tinyshare 复用池，数据源验证使用最高优先级
- 60 日行情/复权和多股票筹码任务通过共享 scheduler 并行执行，并保留原子激活与行级失败语义
- 刷新工作流现在有统一的 operation 运行锁、四阶段进度快照，以及 active generation 的 daily/factor 增量差集规划。
- 普通刷新现在只补 active generation 缺失/失败的 daily 或 factor 项，筛选发布后立即成功，筹码处理转入后台 operation。
- 维护者现在可以通过服务器 npm 命令执行 operation-locked 全量行情缓存重建，失败时保留旧 active cache。
- 状态页现在展示四阶段刷新进度，按 result/chip marker 刷新服务端结果，并且不暴露全量重建入口。
- 按股票和交易日缓存完整筹码分布，并用日期级状态驱动后续增量刷新 work planning。
- 后台 runner 已从单日前三峰升级为双目标交易日完整筹码分布请求、缓存复用和日期级状态落库。
- 结果快照和 K 线 overlay 继续暴露旧筹码峰字段，但数据源已切换到 latest 目标日完整筹码分布。
- ChartSnapshot now returns previous/latest full chip distribution panels with shared comparison scale instead of legacy chip peak overlays.
- Results table now removes chip peak fields and keeps only trend-oriented sorting plus inline detail expansion.
- Stock detail now shows K-line context above comparable previous/latest chip distribution charts with isolated per-day unavailable states.
- Protected workspace smoke now proves the simplified table and inline K-line plus previous/latest distribution experience from seeded distribution data.

---

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
