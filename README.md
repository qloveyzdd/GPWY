# A Stock Downtrend Screener

个人使用的 A 股下降区间筛选网页。首版先建立受密码保护的数据源状态工作台，后续阶段会接入 Tushare 验证、缓存、下降区间筛选和图表展示。

## 本地运行

1. 创建 `.env.local`：

```bash
APP_PASSWORD=your-access-password
TUSHARE_TOKEN=your-tushare-token
TUSHARE_PROVIDER=rest
REFRESH_DB_PATH=.data/refresh.sqlite
```

2. 安装依赖并启动：

```bash
npm install
npm run dev
```

如果使用 tinyshare 授权码，把 `TUSHARE_TOKEN` 设置为 tinyshare 授权码，并启用 Python provider：

```bash
TUSHARE_PROVIDER=tinyshare
```

首次使用 tinyshare 前安装 Python 依赖：

```bash
python -m pip install -r requirements.txt
```

3. 验证：

```bash
npm run verify
```

## 当前状态

- Next.js App Router 骨架已建立。
- shadcn 官方组件配置已初始化。
- 页面和验证 API 已接入个人访问密码保护。
- 数据源状态页会读取 SQLite 中的最近一次脱敏验证快照。
- 当前验证按钮会在服务端调用 Tushare `stock_basic` 和 `daily` 探针，并写入脱敏后的股票样本与未复权行情可用性。
- 可通过 `TUSHARE_PROVIDER=tinyshare` 使用 tinyshare Python bridge 调用 tinyshare 授权码。
- 当前验证按钮会记录价格口径和筹码候选接口状态；不会生成未经验证的筹码峰估算。
- 状态页已有“手动刷新缓存”按钮，并通过受保护的 `/api/refresh/run` 和 `/api/refresh/status` 管理刷新任务。
- 手动刷新会拉取上市 A 股 `stock_basic` 和最近 60 个有数据交易日的 `daily` OHLCV 行情，并默认写入 `.data/refresh.sqlite`。
- 已实现缓存驱动的下降趋势筛选引擎，可计算 MA20/MA60、MA20 斜率、60 日区间高点和 85% 阈值，并持久化入选结果。
- 已实现基于官方 `cyq_chips` 的筹码峰提取与持久化；接口不可用或权限不足时会记录脱敏 blocked 状态，不使用估算替代。
