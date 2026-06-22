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
- 刷新状态和后续缓存默认写入 `.data/refresh.sqlite`；当前刷新 worker 仍是占位实现，真实股票基础信息和 60 日行情抓取将在下一步接入。
