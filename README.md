# A Stock Downtrend Screener

个人使用的 A 股下降区间筛选网页。首版先建立受密码保护的数据源状态工作台，后续阶段会接入 Tushare 验证、缓存、下降区间筛选和图表展示。

## 本地运行

1. 创建 `.env.local`：

```bash
APP_PASSWORD=your-access-password
TUSHARE_TOKEN=your-tushare-token
```

2. 安装依赖并启动：

```bash
npm install
npm run dev
```

3. 验证：

```bash
npm run verify
```

## 当前状态

- Next.js App Router 骨架已建立。
- shadcn 官方组件配置已初始化。
- Phase 1 后续任务会补齐访问保护、SQLite 验证快照和 Tushare 数据源验证。
