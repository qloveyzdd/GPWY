# Phase 06: Charts and Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-06-23
**Phase:** 06-charts-and-deployment
**Areas discussed:** Result generation workflow, Chart entry, Chart presentation

---

## Result Generation Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Refresh runs full workflow | Manual refresh runs cache refresh, downtrend screening, then chip peak enrichment. | Yes |
| Separate generate-results button | User refreshes cache, then manually triggers screening/results generation. | |
| Refresh auto-screens only | Refresh runs screening, while chip peak update stays separate. | |

**User's choice:** Refresh runs full workflow.
**Notes:** This closes the current "结果数据不可用" gap where cached data exists but `screening_runs` and `screening_results` are empty.

### Chip Peak Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Partial success | Screening results still display; chip peak shows blocked/failed/missing row state. | Yes |
| Whole workflow failure | Any chip peak failure prevents latest results from updating. | |
| Separate retry | Show screening first and update chip peak in a later flow. | |

**User's choice:** Partial success.
**Notes:** This preserves prior Phase 4/5 decisions: no estimated chip peak and no hiding matched stocks.

---

## Chart Entry

| Option | Description | Selected |
|--------|-------------|----------|
| Inline below table | Clicking a table row shows the chart below the table. | Yes |
| Details panel with action button | Add a button/action column to open a chart panel. | |
| Independent detail page | Navigate to a stock detail route. | |

**User's choice:** Inline below table.
**Notes:** v1 should keep the workflow on one page and avoid an extra route.

### Default Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Default first row | Select the first currently sorted result row and show its chart. | Yes |
| No default selection | Wait for the user to click a row. | |
| Remember last selection | Persist last selected stock locally. | |

**User's choice:** Default first row.
**Notes:** This makes chart behavior visible immediately once results exist.

---

## Chart Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| K-line/candlestick | Show OHLC candles with MA and key price overlays. | Yes |
| Close-price line | Simpler close-price trend line. | |
| K-line plus volume subplot | Add volume bars under the price chart. | |

**User's choice:** K-line/candlestick.
**Notes:** The chart should overlay MA20, MA60, interval high, 85% threshold, and chip peak price. Volume subplot is excluded from v1.

### Interaction Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Basic interaction | Tooltip, legend toggles, and automatic 60-day focus. | Yes |
| Enhanced interaction | Add dataZoom, crosshair enhancements, and click-to-locate markers. | |
| Static chart | Render chart without meaningful interaction. | |

**User's choice:** Basic interaction.
**Notes:** Keep v1 useful and bounded.

---

## the agent's Discretion

- Deployment and verification boundary was offered but not selected for discussion.
- The planner should follow the existing roadmap requirements and simplest maintainable self-hosting path.
- The planner should choose chart implementation details consistent with prior stack research and existing UI style.

## Deferred Ideas

- Independent stock detail pages and shareable stock URLs.
- Volume subplot, dataZoom, crosshair enhancements, and click-to-locate swing-high behavior.
- CSV export, search/filter controls, watchlists, configurable screening parameters, and scheduled refresh.
