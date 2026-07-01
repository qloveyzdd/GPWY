# A Stock Downtrend Screener

个人使用的 A 股下降区间筛选网页。应用通过服务端读取 Tushare/tinyshare 配置，手动增量刷新 A 股基础信息、60 个交易日行情和筹码分布，随后生成下降趋势筛选结果，并在表格下方展示单只股票 K 线与最新/前一有效交易日的完整筹码分布图。

**当前版本：v2.0 已收尾归档（2026-06-30）；v2.1 Phase 12 已验证（2026-07-01），待里程碑归档**

v1.0 已完成 37 项需求和浏览器冒烟验证。v2.0 已完成 27 项需求：标准化行情缓存、统一 provider 调度、持久 tinyshare worker、可恢复增量刷新、双日完整筹码分布缓存和双图对比体验。v2.1 Phase 12 已完成 13 项需求：以 60 个交易日前的官方筹码分布为种子，按后续交易、换手率和复权因子推演目标日计算筹码分布，并支持固定衰减系数切换。里程碑规划记录位于 `.planning/`。

## 环境变量

创建 `.env.local`：

```bash
APP_PASSWORD=your-access-password
TUSHARE_TOKEN=your-tushare-or-tinyshare-token
TUSHARE_PROVIDER=rest
TUSHARE_MAX_CONCURRENCY=8
TUSHARE_REQUEST_TIMEOUT_MS=60000
TINYSHARE_WORKER_COUNT=2
REFRESH_DB_PATH=.data/refresh.sqlite
```

字段说明：

- `APP_PASSWORD`：个人访问密码，用于保护页面和 API。
- `TUSHARE_TOKEN`：Tushare token；使用 tinyshare 时填写 tinyshare 授权码。
- `TUSHARE_PROVIDER`：`rest` 或 `tinyshare`。
- `TUSHARE_MAX_CONCURRENCY`：provider 请求硬并发上限，默认 `8`，允许 `1–32`。
- `TUSHARE_REQUEST_TIMEOUT_MS`：单次 provider 请求超时，默认 `60000` 毫秒。
- `TINYSHARE_WORKER_COUNT`：tinyshare 常驻 Python worker 数，默认 `2`，允许 `1–8`，且不会突破 provider 硬并发上限。
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
2. 点击“开始增量刷新”执行刷新工作流；升级后的首次刷新会重新获取最近 60 个交易日并初始化标准化缓存，后续普通刷新只补齐缺失交易日。
3. 查看“最新筛选结果”表格。
4. 点击表格行，在下方查看该股票 60 个交易日 K 线图、最新有效交易日和前一有效交易日的官方完整筹码分布图。
5. 在“计算分布”区域切换衰减系数 `0.3 / 0.5 / 0.8 / 1 / 1.2 / 1.5 / 2`，按当前参数即时计算并对比模型输出的 latest/previous 计算筹码分布。

筹码接口无权限、空数据或临时失败时，股票仍保留在筛选结果中；对应交易日的筹码分布卡片会显示不可用状态和脱敏原因，另一交易日可用时仍正常展示。计算分布独立标注为“模型输出，不等同官方 cyq_chips”，按需生成，不会覆盖官方数据。

首次标准化缓存初始化期间，最后一份可用筛选结果会继续显示并标记为“旧缓存结果”；初始化成功后自动切换到新缓存结果。

## 运维全量重建

全量重建只提供服务器 shell 命令，不提供网页按钮、链接、菜单或 API 入口。该操作会重新创建 building generation，完整校验通过后才激活；如果失败，旧 active cache 和旧筛选结果继续可用。

```bash
npm run rebuild:market
```

注意事项：

- 只在服务器环境执行，依赖服务器上的 `TUSHARE_TOKEN`、provider 并发和 tinyshare 配置。
- 不要在命令行参数里传 token；命令只从环境变量读取。
- 全量重建可能按小时运行，适合作为维护操作，不适合作为网页交互。
- 查看帮助不需要 token，也不会触发 provider 请求：

```bash
npm run rebuild:market -- --help
```

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
- 手动增量刷新 A 股基础信息和 60 日行情缓存；首次升级自动执行 60 个交易日的安全初始化，后续只补齐缺失交易日。
- REST/tinyshare 共用进程级并发上限、三次有界尝试、指数退避、限频降并发和优先级老化。
- tinyshare 使用固定数量常驻 Python worker，单 worker 串行、worker 之间并行，超时或退出后有限重建。
- 首次 60 日行情与复权因子按共享上限并行获取；普通刷新可恢复续跑，跳过已完成数据项。
- 原始日线和复权因子独立保存，筛选读取时按每只股票最新因子动态计算前复权价格。
- 缓存驱动的下降趋势筛选：最近 60 日 OHLC 使用统一前复权口径，要求 `MA20 < MA60`、MA20 近 5 日斜率为负、当前价不超过区间高点 85%。
- 区间高点从最新交易日向前逐日比较：只要前一交易日最高价更高，就将候选高点向前移动；遇到前一日最高价不再更高时停止。当天创新高时，当天即为新的区间高点。
- 筛选结果发布不等待筹码分布全部完成；筹码阶段可在后台继续处理。
- 官方筹码分布优先覆盖最新有效交易日和前一有效交易日，保存完整价格档位和占比；接口返回 `empty_data` 时后续刷新会重试，并可临时回退到该股票最近已缓存的官方筹码日期，卡片始终展示实际使用的交易日。
- 计算筹码分布以 60 个交易日前的官方筹码分布为种子，结合后续交易数据、换手率和复权因子逐日推演；系统只持久保存官方原始分布和种子快照，目标日计算分布在详情页按需生成，不再全量预计算入库。
- 股票详情页可在固定衰减系数 `0.3 / 0.5 / 0.8 / 1 / 1.2 / 1.5 / 2` 中切换，默认展示 `0.5`，切换使用当前详情页 DTO 中的按需计算结果，不依赖 `chip_model_levels` 预计算缓存。
- 结果表格支持关键趋势指标排序，不再展示筹码峰字段或筹码峰排序。
- 内联详情展示 K 线、MA20、MA60、区间高点、85% 阈值、最新/前一有效交易日官方筹码分布图，以及标注清晰的计算分布图。
