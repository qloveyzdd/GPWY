# 架构研究

**领域：** 单机自托管的增量行情同步和筹码分布 enrichment
**研究日期：** 2026-06-25
**置信度：** 高

## 推荐架构

```text
手动刷新 API
    │
    ▼
刷新编排器
    ├── 阶段 1：股票基础信息
    ├── 阶段 2：缺失交易日规划
    ├── 阶段 3：行情/复权增量同步 ──┐
    ├── 阶段 4：下降趋势筛选        │
    └── 阶段 5：双日筹码 enrichment │
                                      ▼
                            共享请求调度器
                            ├── REST 客户端
                            └── tinyshare 持久 worker 池
                                      │
                                      ▼
SQLite
├── 股票主数据
├── 原始日线
├── 复权因子
├── 筛选批次和结果
├── 筹码分布快照和价格档位
└── 刷新任务、阶段和项目进度
                                      │
                                      ▼
结果 API ──> 结果表格 + K 线 + 最新日/前一日筹码分布图
```

## 组件职责

| 组件 | 职责 |
|------|------|
| 增量规划器 | 从本地最大交易日、交易日历和目标窗口计算缺失日期 |
| 请求调度器 | 控制并发、最小请求间隔、退避、重试和取消 |
| tinyshare worker 池 | 维持少量 Python 进程，每个进程串行处理请求并复用 SDK 客户端 |
| 市场数据仓库 | 以股票和交易日为唯一键保存原始日线与复权因子 |
| 复权视图层 | 读取最近窗口时按最新因子计算前复权 OHLC |
| 筹码仓库 | 原子替换某股票某交易日的完整价格档位 |
| 刷新进度仓库 | 保存阶段状态、总数、完成数、失败数、重试数和起止时间 |
| 图表数据服务 | 一次返回 K 线和两个交易日的筹码分布，保留独立可用状态 |

## 数据模型

### 市场数据

```text
stocks
  ts_code PK
  name, market, list_status, updated_at

daily_quotes
  ts_code + trade_date PK
  open, high, low, close, vol, fetched_at

adjustment_factors
  ts_code + trade_date PK
  adj_factor, fetched_at
```

筛选读取窗口时：

```text
adjusted_price = raw_price × factor_at_day / factor_at_latest_day
```

这样新增复权因子后无需重写历史行情，也不会把旧快照的复权基准固化。

### 筹码分布

```text
chip_distribution_snapshots
  ts_code + trade_date PK
  status, fetched_at, error_category, error_summary

chip_distribution_levels
  ts_code + trade_date + price PK
  percent
```

同一股票的两个目标交易日可用一次 `cyq_chips(start_date, end_date)` 请求取得。写入前先验证响应，再在单个事务中替换目标日期的数据，避免残留旧价格档位。

### 任务进度

```text
refresh_jobs
  id, mode, status, started_at, finished_at

refresh_job_steps
  job_id + step PK
  status, total_count, completed_count, failed_count, retry_count
  started_at, finished_at, error_summary
```

普通增量刷新与全量重建共用编排器，只是日期规划和缓存跳过策略不同。

## 关键流程

### 普通增量刷新

1. 创建任务并锁定单个活动刷新。
2. 更新股票基础信息。
3. 通过交易日历找出本地最新交易日之后的缺失交易日。
4. 将每个缺失交易日的 `daily` 和 `adj_factor` 请求提交给受控调度器。
5. 对完整响应执行批量 UPSERT；失败日期保留为待重试状态。
6. 从标准化缓存读取最近 60 个有效交易日并运行原有筛选。
7. 立即发布筛选批次。
8. 对每只命中股票确定最新交易日和前一交易日；若缓存不完整，以一个日期区间请求补齐。
9. 增量写入每只股票的筹码状态，全部结束后完成 enrichment 阶段。

### tinyshare 进程协议

- Node 启动固定数量 Python worker。
- 每行输入一个带 `request_id` 的 JSON 请求。
- 每行输出一个带相同 `request_id` 的 JSON 响应。
- 单 worker 内串行，worker 间并行。
- worker 崩溃时只重试其在途请求，并限制重启次数。
- 应用退出时关闭输入流并等待 worker 退出，超时后再终止。

## 迁移策略

现有 `daily_bars` 已是按旧刷新日基准计算的复权数据，且没有保存复权因子，不能安全迁移为原始行情。

推荐：

1. 新建 v2 标准化表，保留旧表不动。
2. 首次 v2 刷新执行一次受控 60 交易日引导同步。
3. 新表完成完整性校验后切换筛选读取路径。
4. 旧表停止增长，但暂不自动删除。
5. 经用户确认后再单独清理旧快照并执行 SQLite 压缩。

## 阶段顺序建议

1. 数据模型、迁移和动态复权读取。
2. 请求调度器与 tinyshare 持久 worker。
3. 增量刷新、断点恢复和阶段进度。
4. 完整筹码分布存储与双日 enrichment。
5. 双图 UI、兼容摘要和端到端验证。

## 来源

- https://tushare.pro/wctapi/documents/26.md
- https://tushare.pro/wctapi/documents/27.md
- https://tushare.pro/wctapi/documents/28.md
- https://tushare.pro/wctapi/documents/294.md
- https://nodejs.org/api/child_process.html
- https://sqlite.org/lang_upsert.html

---
*研究对象：v2.0 增量刷新与筹码分布对比*
