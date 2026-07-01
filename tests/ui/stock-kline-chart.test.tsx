import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { StockKlineChart } from "@/components/charts/stock-kline-chart";
import type {
  ChartSnapshot,
  ReadyChartSnapshot,
} from "@/lib/results/chart-types";

type RecordedChartOption = {
  xAxis?: { max?: number };
  yAxis?: { data?: string[] };
  series?: Array<{
    type?: string;
    name?: string;
    data?: unknown;
    markLine?: { data?: Array<{ name: string }> };
    markPoint?: {
      data?: Array<{
        name: string;
        coord: [number, string];
        value: number;
      }>;
    };
  }>;
};

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

function chartOptions() {
  return setOptionMock.mock.calls.map(
    ([option]) => option as RecordedChartOption,
  );
}

function klineOption() {
  return chartOptions().find(
    (option) => option.series?.[0]?.type === "candlestick",
  );
}

function barOptions() {
  return chartOptions().filter(
    (option) => option.series?.[0]?.type === "bar",
  );
}

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
    },
    chipDistributions: {
      previous: {
        targetKind: "previous",
        label: "前一有效交易日",
        tradeDate: "20260622",
        status: "succeeded",
        levels: [
          { price: 35.9, percent: 5.5 },
          { price: 36.4, percent: 4.4 },
        ],
        maxLevel: { price: 35.9, percent: 5.5 },
        errorCategory: null,
        errorSummary: null,
      },
      latest: {
        targetKind: "latest",
        label: "最新有效交易日",
        tradeDate: "20260623",
        status: "succeeded",
        levels: [
          { price: 35.8, percent: 4.2 },
          { price: 36.2, percent: 6.5 },
          { price: 37.1, percent: 3.1 },
        ],
        maxLevel: { price: 36.2, percent: 6.5 },
        errorCategory: null,
        errorSummary: null,
      },
      scale: {
        priceLevels: [35.8, 35.9, 36.2, 36.4, 37.1],
        maxPercent: 6.5,
      },
    },
    calculatedChipDistributions: {
      defaultDecayCoefficient: 0.5,
      coefficients: [0.3, 0.5, 0.8, 1, 1.2, 1.5, 2],
      byCoefficient: {
        "0.5": {
          decayCoefficient: 0.5,
          previous: {
            targetKind: "previous",
            label: "前一有效交易日",
            targetTradeDate: "20260622",
            seedTradeDate: "20260401",
            status: "succeeded",
            decayCoefficient: 0.5,
            modelVersion: "decay-triangle-v1",
            levels: [
              { price: 30, percent: 7 },
              { price: 31, percent: 3 },
            ],
            maxLevel: { price: 30, percent: 7 },
            unavailableReason: null,
            errorCategory: null,
            errorSummary: null,
          },
          latest: {
            targetKind: "latest",
            label: "最新有效交易日",
            targetTradeDate: "20260623",
            seedTradeDate: "20260402",
            status: "succeeded",
            decayCoefficient: 0.5,
            modelVersion: "decay-triangle-v1",
            levels: [
              { price: 31, percent: 8 },
              { price: 32, percent: 4 },
            ],
            maxLevel: { price: 31, percent: 8 },
            unavailableReason: null,
            errorCategory: null,
            errorSummary: null,
          },
          scale: {
            priceLevels: [30, 31, 32],
            maxPercent: 8,
          },
        },
        "1": {
          decayCoefficient: 1,
          previous: {
            targetKind: "previous",
            label: "前一有效交易日",
            targetTradeDate: "20260622",
            seedTradeDate: "20260401",
            status: "succeeded",
            decayCoefficient: 1,
            modelVersion: "decay-triangle-v1",
            levels: [{ price: 29, percent: 6 }],
            maxLevel: { price: 29, percent: 6 },
            unavailableReason: null,
            errorCategory: null,
            errorSummary: null,
          },
          latest: {
            targetKind: "latest",
            label: "最新有效交易日",
            targetTradeDate: "20260623",
            seedTradeDate: "20260402",
            status: "succeeded",
            decayCoefficient: 1,
            modelVersion: "decay-triangle-v1",
            levels: [{ price: 28, percent: 10 }],
            maxLevel: { price: 28, percent: 10 },
            unavailableReason: null,
            errorCategory: null,
            errorSummary: null,
          },
          scale: {
            priceLevels: [28, 29],
            maxPercent: 10,
          },
        },
      },
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

  it("renders a candlestick chart with MA and only interval overlay lines", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(readySnapshot()), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("000001.SZ 平安银行")).toBeTruthy();
    expect(screen.getByText("最近 60 个交易日")).toBeTruthy();
    expect(screen.getByText("区间高点 90.00")).toBeTruthy();
    expect(screen.getByText("85%阈值 76.50")).toBeTruthy();
    expect(screen.queryByText(/筹码峰/)).toBeNull();
    expect(screen.queryByText("部分可用")).toBeNull();

    await waitFor(() => {
      expect(klineOption()).toBeTruthy();
    });

    const options = klineOption();

    expect(options?.series?.[0]?.type).toBe("candlestick");
    expect(options?.series?.[1]).toMatchObject({
      name: "MA20",
      type: "line",
    });
    expect(options?.series?.[2]).toMatchObject({
      name: "MA60",
      type: "line",
    });
    expect(
      options?.series?.[0]?.markLine?.data?.map((line) => line.name),
    ).toEqual(["区间高点", "85%阈值"]);
  });

  it("renders previous and latest distribution charts with shared scale", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(readySnapshot()), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("前一有效交易日 20260622")).toBeTruthy();
    expect(screen.getByText("最新有效交易日 20260623")).toBeTruthy();
    expect(screen.getByText("最大占比 35.90 / 5.50%")).toBeTruthy();
    expect(screen.getByText("最大占比 36.20 / 6.50%")).toBeTruthy();

    await waitFor(() => {
      expect(barOptions()).toHaveLength(2);
    });

    const [previousOption, latestOption] = barOptions();

    expect(previousOption?.xAxis?.max).toBe(6.5);
    expect(latestOption?.xAxis?.max).toBe(6.5);
    expect(previousOption?.yAxis?.data).toEqual([
      "35.80",
      "35.90",
      "36.20",
      "36.40",
      "37.10",
    ]);
    expect(latestOption?.yAxis?.data).toEqual(previousOption?.yAxis?.data);
    expect(previousOption?.series?.[0]?.data).toEqual([0, 5.5, 0, 4.4, 0]);
    expect(latestOption?.series?.[0]?.data).toEqual([4.2, 0, 6.5, 0, 3.1]);
    expect(previousOption?.series?.[0]?.markPoint?.data?.[0]).toMatchObject({
      name: "最大占比",
      coord: [5.5, "35.90"],
      value: 5.5,
    });
    expect(latestOption?.series?.[0]?.markPoint?.data?.[0]).toMatchObject({
      name: "最大占比",
      coord: [6.5, "36.20"],
      value: 6.5,
    });
    expect(initMock).toHaveBeenCalledTimes(3);
  });

  it("renders calculated distribution with fixed coefficient selector and switches local chart data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(readySnapshot()), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("计算分布")).toBeTruthy();
    expect(screen.getByText("模型输出，不等同官方 cyq_chips")).toBeTruthy();
    expect(screen.getByText("目标日 20260623")).toBeTruthy();
    expect(screen.getByText("种子日 20260402")).toBeTruthy();
    expect(screen.getByText("模型 decay-triangle-v1")).toBeTruthy();

    const selector = screen.getByLabelText("衰减系数");
    expect(selector).toHaveValue("0.5");
    expect(
      Array.from((selector as HTMLSelectElement).options).map(
        (option) => option.value,
      ),
    ).toEqual(["0.3", "0.5", "0.8", "1", "1.2", "1.5", "2"]);

    await waitFor(() => {
      expect(barOptions().at(-1)?.series?.[0]?.data).toEqual([0, 8, 4]);
    });

    fireEvent.change(selector, { target: { value: "1" } });

    await waitFor(() => {
      expect(screen.getByText("衰减系数 1")).toBeTruthy();
      expect(barOptions().at(-1)?.series?.[0]?.data).toEqual([10, 0]);
    });
  });

  it("keeps previous distribution chart available when latest distribution is blocked", async () => {
    const base = readySnapshot();
    const snapshot = readySnapshot({
      chipDistributions: {
        ...base.chipDistributions,
        latest: {
          targetKind: "latest",
          label: "最新有效交易日",
          tradeDate: "20260623",
          status: "blocked",
          levels: [],
          maxLevel: null,
          errorCategory: "permission_denied",
          errorSummary:
            "Authorization failed: TUSHARE_TOKEN from C:\\secret REFRESH_DB_PATH",
        },
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(snapshot), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("前一有效交易日 20260622")).toBeTruthy();
    expect(screen.getByText("最新有效交易日 20260623")).toBeTruthy();
    expect(screen.getByText("阻塞")).toBeTruthy();
    expect(screen.getByText("permission_denied")).toBeTruthy();
    expect(screen.queryByText(/TUSHARE_TOKEN/)).toBeNull();
    expect(screen.queryByText(/Authorization/)).toBeNull();
    expect(screen.queryByText(/REFRESH_DB_PATH/)).toBeNull();
    expect(screen.queryByText(/C:\\secret/)).toBeNull();

    await waitFor(() => {
      expect(barOptions()).toHaveLength(1);
    });

    expect(initMock).toHaveBeenCalledTimes(2);
    expect(barOptions()[0]?.series?.[0]?.data).toEqual([0, 5.5, 0, 4.4, 0]);
  });

  it("falls back to an unavailable latest card when the chart DTO omits that panel", async () => {
    const snapshot = readySnapshot({
      chipDistributions: {
        previous: {
          targetKind: "previous",
          label: "前一有效交易日",
          tradeDate: "20260059",
          status: "blocked",
          levels: [],
          maxLevel: null,
          errorCategory: "empty_data",
          errorSummary:
            "cyq_chips returned no distribution rows for previous trade date",
        },
        scale: {
          priceLevels: [],
          maxPercent: 0,
        },
      } as unknown as ReadyChartSnapshot["chipDistributions"],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(snapshot), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("000001.SZ 平安银行")).toBeTruthy();
    expect(screen.getByText("前一有效交易日 20260059")).toBeTruthy();
    expect(screen.getByText("最新有效交易日 20260623")).toBeTruthy();
    expect(screen.getByText("缺少数据")).toBeTruthy();
    expect(screen.getAllByText("阻塞")).toHaveLength(1);

    await waitFor(() => {
      expect(klineOption()).toBeTruthy();
    });

    expect(barOptions()).toHaveLength(0);
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("renders missing previous distribution as a neutral empty state", async () => {
    const base = readySnapshot();
    const snapshot = readySnapshot({
      chipDistributions: {
        ...base.chipDistributions,
        previous: {
          targetKind: "previous",
          label: "前一有效交易日",
          tradeDate: null,
          status: "missing",
          levels: [],
          maxLevel: null,
          errorCategory: null,
          errorSummary: "previous_trade_date_missing",
        },
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(snapshot), { status: 200 }),
    );

    render(<StockKlineChart tsCode="000001.SZ" />);

    expect(await screen.findByText("前一有效交易日 未确定交易日")).toBeTruthy();
    expect(screen.getByText("缺少数据")).toBeTruthy();
    expect(screen.getByText("正常空状态")).toBeTruthy();
    expect(screen.getByText("previous_trade_date_missing")).toBeTruthy();
    expect(screen.getByText("最新有效交易日 20260623")).toBeTruthy();

    await waitFor(() => {
      expect(barOptions()).toHaveLength(1);
    });

    expect(initMock).toHaveBeenCalledTimes(2);
    expect(barOptions()[0]?.series?.[0]?.data).toEqual([4.2, 0, 6.5, 0, 3.1]);
  });
});
