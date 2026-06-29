# Phase 11: Distribution Comparison Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30T05:50:22+08:00
**Phase:** 11-Distribution Comparison Experience
**Areas discussed:** 详情区布局, 筹码分布图形态, 部分失败状态, 表格简化后的信息重点

---

## 详情区布局

| Option | Description | Selected |
|--------|-------------|----------|
| K 线在上，两个分布图在下 | 保留当前展开行模式，桌面并排、窄屏上下排列 | ✅ |
| 三块并列 | K 线、latest、previous 三块并列，桌面密度高但更挤 | |
| Tab/折叠区 | 页面更轻，但隐藏直接对比信息 | |

**User's choice:** K 线在上，两个分布图在下。
**Notes:** 用户进一步选择 previous 在左、latest 在右；两张图等宽等高；不做 hover/click 联动。

---

## 筹码分布图形态

| Option | Description | Selected |
|--------|-------------|----------|
| 横向条形图 | 纵轴价格档位，横轴占比，适合完整价格档位分布 | ✅ |
| 纵向柱状图 | 更常见，但价格档位多时横轴拥挤 | |
| 平滑面积/曲线图 | 视觉柔和，但容易暗示连续估算 | |

**User's choice:** 横向条形图。
**Notes:** 两张图共享相同价格范围和占比范围；只在图内标出最大占比档位；默认显示所有价格档位，必要时图内滚动或压缩。

---

## 部分失败状态

| Option | Description | Selected |
|--------|-------------|----------|
| 失败那张图显示不可用卡片 | 整体详情可用，成功那一天仍正常展示 | ✅ |
| 总提示 + 成功图 | 更醒目，但占用额外空间 | |
| 任一天失败就隐藏双图区域 | 最简单，但不符合单日独立状态要求 | |

**User's choice:** 只让失败那张图显示不可用卡片。
**Notes:** 卡片显示状态、脱敏错误类别和简短说明；`missing` 是正常空状态；标题区不加总体徽标。

---

## 表格简化后的信息重点

| Option | Description | Selected |
|--------|-------------|----------|
| 保留当前/高点、下跌幅度排序 | 表格回到筛选核心指标 | ✅ |
| 只保留当前/高点排序 | 更极简，但损失下跌幅度研判入口 | |
| 增加筹码分布状态排序 | 能筛可用性，但会把筹码状态带回表格 | |

**User's choice:** 只保留当前/高点、下跌幅度两个排序入口。
**Notes:** 表格不显示筹码分布状态，不加“查看分布”按钮或 hover 提示，继续使用当前行下方 inline 展开详情模式。

---

## the agent's Discretion

- 分布图组件拆分方式、内部 DTO 命名、ECharts 配置细节和测试 fixture 命名。
- 图内滚动或压缩策略、最大占比档位标记样式。
- 不可用卡片的具体视觉样式，但必须保持脱敏和状态区分。

## Deferred Ideas

- K 线和分布图联动。
- 表格筹码状态徽标、筹码状态排序、查看分布按钮。
- 网页手动重试筹码、状态清理、全历史回填、性能目标。
