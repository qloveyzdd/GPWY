import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { StockKlineChart } from "@/components/charts/stock-kline-chart";
import type {
  ChartSnapshot,
  ReadyChartSnapshot,
} from "@/lib/results/chart-types";

const setOptionMock = vi.hoisted(() => vi.fn());
const resizeMock = vi.hoisted(() => vi.fn());
const disposeMock = vi.hoisted(() => vi.fn());
const initMock = vi.hoisted(() =>
  vi.fn(() => ({
    setOption: setOptionMock,
    resize: resizeMock,
    dispose: disposeMock,
  })),
);

vi.mock("echarts", () => ({
  init: initMock,
}));

function readySnapshot(
  overrides: Partial<ReadyChartSnapshot> = {},
): ReadyChartSnapshot {
  const snapshot: ReadyChartSnapshot = {
    status: "ready",
    unavailableReason: null,
    row: {
      tsCode: "000001.SZ",
      name: "平安银行",
      latestTradeDate: "20260623",
      currentPrice: 41,
      intervalHigh: 90,
      intervalHighTradeDate: "20260214",
      currentHighRatio: 41 / 90,
      drawdownPct: 1 - 41 / 90,
      ma20: 50.5,
      ma60: 70.5,
      ma20Slope: -1,
      chipPeakState: "available",
      chipPeakPrice: 36.2,
      chipPeakTradeDate: "20260623",
      chipPeakSource: "cyq_chips_highest_percent",
      chipPeaks: [
        { rank: 1, tradeDate: "20260623", price: 36.2, percent: 6.5 },
        { rank: 2, tradeDate: "20260623", price: 35.8, percent: 4.2 },
        { rank: 3, tradeDate: "20260623", price: 37.1, percent: 3.1 },
      ],
      chipPeakErrorCategory: null,
      chipPeakErrorSummary: null,
    },
    bars: Array.from({ length: 60 }, (_, index) => ({
      tradeDate: `2026${String(index + 1).padStart(4, "0")}`,
      open: 100 - index + 0.5,
      high: 100 - index + 1,
      low: 100 - index - 1,
      close: 100 - index,
      vol: 1000 + index,
    })),
    ma20Series: Array.from({ length: 41 }, (_, index) => ({
      tradeDate: `2026${String(index + 20).padStart(4, "0")}`,
      value: 90 - index,
    })),
    ma60Series: [
      {
        tradeDate: "20260060",
        value: 70.5,
      },
    ],
    overlays: {
      intervalHighPrice: 90,
      intervalHighTradeDate: "20260214",
      threshold85Price: 76.5,
      chipPeaks: [
        { rank: 1, tradeDate: "20260623", price: 36.2, percent: 6.5 },
        { rank: 2, tradeDate: "20260623", price: 35.8, percent: 4.2 },
        { rank: 3, tradeDate: "20260623", price: 37.1, percent: 3.1 },
      ],
      chipPeakState: "available",
    },
  };

  return { ...snapshot, ...overrides };
}

describe("StockKlineChart", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setOptionMock.mockReset();
    resizeMock.mockReset();
    disposeMock.mockReset();
    initMock.mockClear();
  });

  it("renders a loading state while chart data is requested", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(new Promise(() => {}));

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(screen.getByText("正在加载图表")).toBeTruthy();
  });

  it("renders unavailable state when the API has no chart data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "unavailable",
          unavailableReason: "no_screening_run",
          row: null,
          bars: [],
          ma20Series: [],
          ma60Series: [],
          overlays: null,
        } satisfies ChartSnapshot),
        { status: 200 },
      ),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("图表数据不可用")).toBeTruthy();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("renders a candlestick chart with MA and overlay lines", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(readySnapshot()), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("000001.SZ 平安银行")).toBeTruthy();
    expect(screen.getByText("最近 60 个交易日")).toBeTruthy();
    expect(screen.getByText("区间高点 90.00")).toBeTruthy();
    expect(screen.getByText("85%阈值 76.50")).toBeTruthy();
    expect(screen.getByText("筹码峰1：36.20 / 6.50%")).toBeTruthy();
    expect(screen.getByText("筹码峰2：35.80 / 4.20%")).toBeTruthy();
    expect(screen.getByText("筹码峰3：37.10 / 3.10%")).toBeTruthy();

    await waitFor(() => {
      expect(setOptionMock).toHaveBeenCalled();
    });

    const options = setOptionMock.mock.calls[0][0];

    expect(options.series[0].type).toBe("candlestick");
    expect(options.series[1]).toMatchObject({
      name: "MA20",
      type: "line",
    });
    expect(options.series[2]).toMatchObject({
      name: "MA60",
      type: "line",
    });
    expect(
      options.series[0].markLine.data.map((line: { name: string }) => line.name),
    ).toEqual(["区间高点", "85%阈值", "筹码峰1", "筹码峰2", "筹码峰3"]);
  });

  it("does not draw a chip peak line when chip peak is unavailable", async () => {
    const snapshot = readySnapshot({
      row: {
        ...readySnapshot().row,
        chipPeakState: "missing",
        chipPeakPrice: null,
        chipPeakTradeDate: null,
        chipPeaks: [],
      },
      overlays: {
        ...readySnapshot().overlays,
        chipPeakState: "missing",
        chipPeaks: [],
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(snapshot), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("筹码峰：无数据")).toBeTruthy();

    await waitFor(() => {
      expect(setOptionMock).toHaveBeenCalled();
    });

    const options = setOptionMock.mock.calls[0][0];

    expect(
      options.series[0].markLine.data.map((line: { name: string }) => line.name),
    ).toEqual(["区间高点", "85%阈值"]);
  });
});
