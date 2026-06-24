# Phase 01-03: User Setup Required

**Generated:** 2026-06-23
**Phase:** 01-tushare-data-foundation
**Status:** Complete for local verification

本阶段需要真实 Tushare/tinyshare 授权码才能验证行情和筹码候选接口。当前本地 `.env.local` 已配置完成；云端部署时需要在服务器环境重复配置同名变量。

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [x] | `APP_PASSWORD` | 本地自定义访问密码 | `.env.local` / server env |
| [x] | `TUSHARE_PROVIDER` | 使用 tinyshare 授权码时设为 `tinyshare` | `.env.local` / server env |
| [x] | `TUSHARE_TOKEN` | tinyshare 授权码或 Tushare token | `.env.local` / server env |
| [x] | `PYTHON_BIN` | tinyshare 运行所用 Python 路径，可选 | `.env.local` / server env |

## Local Development

```bash
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
D:\NodeJS\npm.cmd run dev
```

## Verification

```bash
D:\NodeJS\npm.cmd run verify
```

预期结果：
- 登录页可以打开。
- 点击数据源验证后，`daily`、`cyq_chips`、`cyq_perf` 能返回成功、警告或脱敏错误状态。
- 页面和 API 响应不显示 token、请求头、原始异常栈或本地路径。

---

**Secret handling:** 不在本文档或仓库文件中记录真实授权码。
