# A Stock Downtrend Screener

个人使用的 A 股下降区间筛选网页。应用通过服务端读取 Tushare/tinyshare 配置，手动刷新 A 股基础信息和 60 个交易日行情，随后生成下降趋势筛选结果、筹码峰状态，并在表格下方展示单只股票 K 线图。

## 环境变量

创建 `.env.local`：

```bash
APP_PASSWORD=your-access-password
TUSHARE_TOKEN=your-tushare-or-tinyshare-token
TUSHARE_PROVIDER=rest
REFRESH_DB_PATH=.data/refresh.sqlite
```

字段说明：

- `APP_PASSWORD`：个人访问密码，用于保护页面和 API。
- `TUSHARE_TOKEN`：Tushare token；使用 tinyshare 时填写 tinyshare 授权码。
- `TUSHARE_PROVIDER`：`rest` 或 `tinyshare`。
- `REFRESH_DB_PATH`：SQLite 数据库路径，默认可用 `.data/refresh.sqlite`。

使用 tinyshare 前安装 Python bridge 依赖：

```bash
python -m pip install -r requirements.txt
```

不要把真实 token、授权码或访问密码提交到仓库。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，输入 `APP_PASSWORD` 后进入工作台。

## 使用流程

1. 点击“重新验证数据源”检查 token、行情和筹码候选接口状态。
2. 点击“手动刷新缓存”执行完整工作流：缓存刷新 -> 下降趋势筛选 -> 筹码峰 enrichment。
3. 查看“最新筛选结果”表格。
4. 点击表格行，在下方查看该股票 60 个交易日 K 线图。

筹码接口无权限、空数据或临时失败时，股票仍保留在筛选结果中，筹码峰列和图表标记会显示对应不可用状态，不会使用估算值替代。

## 验证命令

常规验证：

```bash
npm run verify
```

页面冒烟检查：

```bash
npx playwright install chromium
npm run smoke
```

`npm run smoke` 使用独立的 seeded SQLite 数据库，不调用真实 Tushare/tinyshare 接口。
如果本机 Chromium 下载失败但已安装 Chrome，可临时指定系统浏览器通道：

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"
npm run smoke
Remove-Item Env:\PLAYWRIGHT_BROWSER_CHANNEL
```

## 云端自托管

推荐使用 Node.js 22 LTS 或 24 LTS。

```bash
npm ci
python -m pip install -r requirements.txt
npm run build
npm run start
```

默认 `next start` 监听 `3000` 端口。可通过反向代理把域名转发到该端口，并在服务器环境中配置 `.env.local` 或等价环境变量。

PM2 示例：

```bash
npm install -g pm2
pm2 start "npm run start" --name gpwy
pm2 save
```

部署后建议运行：

```bash
npm run verify
npx playwright install chromium
npm run smoke
```

## 当前能力

- 密码保护的个人工作台。
- 服务端读取 token，不在前端暴露密钥。
- 手动刷新 A 股基础信息和 60 日行情缓存。
- 缓存驱动的下降趋势筛选：60 日 OHLC 按最新交易日复权因子统一价格口径，要求 `MA20 < MA60`、MA20 近 5 日斜率为负、当前价不超过区间高点 85%。
- 区间高点从最新交易日向前逐日比较：只要前一交易日最高价更高，就将候选高点向前移动；遇到前一日最高价不再更高时停止。当天创新高时，当天即为新的区间高点。
- 筹码峰读取最新交易日 `cyq_chips`，按占比降序展示前三个价格及占比；占比相同时价格较低者优先。
- 官方筹码数据峰值提取；不可用时记录行级状态，不做估算。
- 结果表格支持关键指标排序。
- 内联 K 线图展示 K 线、MA20、MA60、区间高点、85% 阈值和可用筹码峰。
