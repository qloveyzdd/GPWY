import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { ResultsTable } from "@/components/results/results-table";
import { StatusWorkspace } from "@/components/status/status-workspace";
import { EMPTY_REFRESH_STATUS } from "@/lib/refresh/refresh-types";
import type { ResultsSnapshot } from "@/lib/results/results-types";
import { EMPTY_VALIDATION_SNAPSHOT } from "@/lib/validation-types";

const readySnapshot: ResultsSnapshot = {
  status: "ready",
  summary: "最新筛选命中 2 只股票。",
  sourceScreeningRunId: 7,
  screeningCreatedAt: "2026-06-23T00:00:00.000Z",
  chipPeakRunId: 3,
  unavailableReason: null,
  rows: [
    {
      tsCode: "000002.SZ",
      name: "万科A",
      latestTradeDate: "20260623",
      currentPrice: 40,
      intervalHigh: 100,
      intervalHighTradeDate: "20260614",
      currentHighRatio: 0.4,
      drawdownPct: 0.6,
      ma20: 45,
      ma60: 60,
      ma20Slope: -0.4,
      chipPeakState: "available",
      chipPeakPrice: 38.5,
      chipPeakTradeDate: "20260623",
      chipPeakSource: "cyq_chips_highest_percent",
      chipPeakErrorCategory: null,
      chipPeakErrorSummary: null,
    },
    {
      tsCode: "000001.SZ",
      name: "平安银行",
      latestTradeDate: "20260623",
      currentPrice: 72,
      intervalHigh: 90,
      intervalHighTradeDate: "20260614",
      currentHighRatio: 0.8,
      drawdownPct: 0.2,
      ma20: 75,
      ma60: 85,
      ma20Slope: -0.2,
      chipPeakState: "blocked",
      chipPeakPrice: null,
      chipPeakTradeDate: null,
      chipPeakSource: null,
      chipPeakErrorCategory: "permission_denied",
      chipPeakErrorSummary: "筹码接口权限不足。",
    },
  ],
};

describe("ResultsTable", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders required stock result columns with formatted values", () => {
    render(<ResultsTable snapshot={readySnapshot} />);

    expect(screen.getByText("股票代码")).toBeTruthy();
    expect(screen.getByText("名称")).toBeTruthy();
    expect(screen.getByText("当前价")).toBeTruthy();
    expect(screen.getByText("区间高点")).toBeTruthy();
    expect(screen.getByText("当前/高点")).toBeTruthy();
    expect(screen.getByText("下跌幅度")).toBeTruthy();
    expect(screen.getByText("筹码峰价格")).toBeTruthy();

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("000002.SZ")).toBeTruthy();
    expect(within(rows[1]).getByText("万科A")).toBeTruthy();
    expect(within(rows[1]).getByText("40.00")).toBeTruthy();
    expect(within(rows[1]).getByText("100.00")).toBeTruthy();
    expect(within(rows[1]).getByText("40.0%")).toBeTruthy();
    expect(within(rows[1]).getByText("60.0%")).toBeTruthy();
    expect(within(rows[1]).getByText("38.50")).toBeTruthy();
  });

  it("renders an explicit marker when chip peak is unavailable", () => {
    render(<ResultsTable snapshot={readySnapshot} />);

    const row = screen.getByText("000001.SZ").closest("tr");

    expect(row).toBeTruthy();
    expect(within(row as HTMLTableRowElement).getByText("阻塞")).toBeTruthy();
    expect(
      within(row as HTMLTableRowElement).queryByText("0.00"),
    ).toBeNull();
  });

  it("is wired into the protected workspace", () => {
    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={EMPTY_REFRESH_STATUS}
        initialResultsSnapshot={readySnapshot}
        logoutAction={vi.fn()}
      />,
    );

    expect(screen.getByText("最新筛选结果")).toBeTruthy();
    expect(screen.getByText("000002.SZ")).toBeTruthy();
  });
});
