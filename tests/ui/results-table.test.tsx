import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { ResultsTable } from "@/components/results/results-table";
import { StatusWorkspace } from "@/components/status/status-workspace";
import { EMPTY_REFRESH_STATUS } from "@/lib/refresh/refresh-types";
import type { ResultsSnapshot } from "@/lib/results/results-types";
import { EMPTY_VALIDATION_SNAPSHOT } from "@/lib/validation-types";

const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

vi.mock("@/components/charts/stock-kline-chart", () => ({
  StockKlineChart: ({ tsCode }: { tsCode: string | null }) => (
    <div data-testid="stock-chart">chart {tsCode ?? "none"}</div>
  ),
}));

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

const sortableSnapshot: ResultsSnapshot = {
  ...readySnapshot,
  rows: [
    {
      ...readySnapshot.rows[0],
      tsCode: "000002.SZ",
      name: "万科A",
      currentHighRatio: 0.4,
      drawdownPct: 0.1,
      chipPeakState: "available",
      chipPeakPrice: 38.5,
    },
    {
      ...readySnapshot.rows[1],
      tsCode: "000001.SZ",
      name: "平安银行",
      currentHighRatio: 0.8,
      drawdownPct: 0.6,
      chipPeakState: "blocked",
      chipPeakPrice: null,
    },
    {
      ...readySnapshot.rows[0],
      tsCode: "000004.SZ",
      name: "国华网安",
      currentHighRatio: 0.6,
      drawdownPct: 0.3,
      chipPeakState: "available",
      chipPeakPrice: 20,
    },
  ],
};

const emptySnapshot: ResultsSnapshot = {
  status: "empty",
  summary: "最新筛选没有符合条件的股票。",
  sourceScreeningRunId: 8,
  screeningCreatedAt: "2026-06-23T00:00:00.000Z",
  chipPeakRunId: null,
  unavailableReason: null,
  rows: [],
};

const unavailableSnapshot: ResultsSnapshot = {
  status: "unavailable",
  summary: "尚未生成下降趋势筛选结果。",
  sourceScreeningRunId: null,
  screeningCreatedAt: null,
  chipPeakRunId: null,
  unavailableReason: "no_screening_run",
  rows: [],
};

function renderedCodes() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

describe("ResultsTable", () => {
  afterEach(() => {
    cleanup();
    routerRefreshMock.mockReset();
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

  it("defaults to current/high ratio ascending with visible active sort state", () => {
    render(<ResultsTable snapshot={sortableSnapshot} />);

    expect(renderedCodes()).toEqual(["000002.SZ", "000004.SZ", "000001.SZ"]);
    expect(screen.queryByTestId("stock-chart")).toBeNull();
    expect(
      screen
        .getByRole("columnheader", { name: /当前\/高点/ })
        .getAttribute("aria-sort"),
    ).toBe("ascending");
  });

  it("sorts by drawdown descending", () => {
    render(<ResultsTable snapshot={sortableSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "按下跌幅度排序" }));

    expect(renderedCodes()).toEqual(["000001.SZ", "000004.SZ", "000002.SZ"]);
    expect(
      screen
        .getByRole("columnheader", { name: /下跌幅度/ })
        .getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("sorts by chip peak price and places unavailable chip rows last", () => {
    render(<ResultsTable snapshot={sortableSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "按筹码峰价格排序" }));

    expect(renderedCodes()).toEqual(["000004.SZ", "000002.SZ", "000001.SZ"]);
    expect(
      screen
        .getByRole("columnheader", { name: /筹码峰价格/ })
        .getAttribute("aria-sort"),
    ).toBe("ascending");
  });

  it("distinguishes empty results from unavailable result data", () => {
    const { rerender } = render(<ResultsTable snapshot={emptySnapshot} />);

    expect(screen.getByText("最新筛选没有符合条件的股票。")).toBeTruthy();
    expect(
      screen.getByText("最新一次下降趋势筛选已完成，但没有符合条件的股票。"),
    ).toBeTruthy();

    rerender(<ResultsTable snapshot={unavailableSnapshot} />);

    expect(screen.getByText("结果数据不可用")).toBeTruthy();
    expect(
      screen.getByText("还没有可展示的下降趋势筛选结果，请先完成缓存刷新和筛选。"),
    ).toBeTruthy();
    expect(screen.queryByText("TUSHARE_TOKEN=")).toBeNull();
  });

  it("keeps row-level chip states distinct from page-level unavailable state", () => {
    render(
      <ResultsTable
        snapshot={{
          ...readySnapshot,
          rows: [
            {
              ...readySnapshot.rows[0],
              tsCode: "000001.SZ",
              chipPeakState: "blocked",
              chipPeakPrice: null,
            },
            {
              ...readySnapshot.rows[0],
              tsCode: "000002.SZ",
              chipPeakState: "failed",
              chipPeakPrice: null,
            },
            {
              ...readySnapshot.rows[0],
              tsCode: "000003.SZ",
              chipPeakState: "missing",
              chipPeakPrice: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("阻塞")).toBeTruthy();
    expect(screen.getByText("失败")).toBeTruthy();
    expect(screen.getByText("无数据")).toBeTruthy();
    expect(screen.queryByText("结果数据不可用")).toBeNull();
  });

  it("opens the chart directly below the clicked result row", () => {
    render(<ResultsTable snapshot={sortableSnapshot} />);

    const targetRow = screen.getByText("000001.SZ").closest("tr");

    expect(targetRow).toBeTruthy();
    fireEvent.click(targetRow as HTMLTableRowElement);

    expect(screen.getByTestId("stock-chart").textContent).toBe(
      "chart 000001.SZ",
    );
    expect(targetRow?.getAttribute("aria-selected")).toBe("true");
    expect(targetRow?.getAttribute("aria-expanded")).toBe("true");
    expect(targetRow?.nextElementSibling).toBe(
      screen.getByTestId("stock-chart-row-000001.SZ"),
    );
  });

  it("closes the inline chart when the selected row is clicked again", () => {
    render(<ResultsTable snapshot={sortableSnapshot} />);

    const targetRow = screen.getByText("000001.SZ").closest("tr");

    expect(targetRow).toBeTruthy();
    fireEvent.click(targetRow as HTMLTableRowElement);
    fireEvent.click(targetRow as HTMLTableRowElement);

    expect(screen.queryByTestId("stock-chart")).toBeNull();
    expect(targetRow?.getAttribute("aria-selected")).toBe("false");
    expect(targetRow?.getAttribute("aria-expanded")).toBe("false");
  });
});
