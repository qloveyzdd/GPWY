"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { AlertTriangle, CandlestickChart, CircleSlash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  ChartMovingAveragePoint,
  ChartSnapshot,
} from "@/lib/results/chart-types";

type StockKlineChartProps = {
  tsCode: string | null;
};

type ChartLoadState = {
  tsCode: string | null;
  snapshot: ChartSnapshot | null;
  failed: boolean;
};

type MarkLineDataItem = {
  name: string;
  yAxis: number;
  lineStyle: {
    color: string;
    type: "dashed" | "solid";
  };
  label: {
    formatter: string;
  };
};

const initialLoadState: ChartLoadState = {
  tsCode: null,
  snapshot: null,
  failed: false,
};

function formatPrice(value: number) {
  return value.toFixed(2);
}

function alignMovingAverageSeries(
  tradeDates: string[],
  series: ChartMovingAveragePoint[],
) {
  const valueByDate = new Map(
    series.map((point) => [point.tradeDate, Number(point.value.toFixed(4))]),
  );

  return tradeDates.map((tradeDate) => valueByDate.get(tradeDate) ?? null);
}

function buildChartOptions(snapshot: ChartSnapshot): EChartsOption {
  if (snapshot.status !== "ready") {
    return {};
  }

  const tradeDates = snapshot.bars.map((bar) => bar.tradeDate);
  const markLineData: MarkLineDataItem[] = [
    {
      name: "区间高点",
      yAxis: snapshot.overlays.intervalHighPrice,
      lineStyle: { color: "#B45309", type: "dashed" as const },
      label: { formatter: "区间高点" },
    },
    {
      name: "85%阈值",
      yAxis: snapshot.overlays.threshold85Price,
      lineStyle: { color: "#B91C1C", type: "dashed" as const },
      label: { formatter: "85%阈值" },
    },
  ];

  return {
    animation: false,
    color: ["#0F766E", "#2563EB", "#7C3AED"],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
    },
    legend: {
      top: 0,
      left: 0,
      data: ["K线", "MA20", "MA60"],
    },
    grid: {
      top: 44,
      left: 56,
      right: 24,
      bottom: 36,
    },
    xAxis: {
      type: "category",
      data: tradeDates,
      boundaryGap: true,
      axisLabel: {
        hideOverlap: true,
      },
    },
    yAxis: {
      scale: true,
      splitLine: {
        lineStyle: { color: "#E5E7EB" },
      },
    },
    series: [
      {
        name: "K线",
        type: "candlestick",
        data: snapshot.bars.map((bar) => [
          bar.open,
          bar.close,
          bar.low,
          bar.high,
        ]),
        itemStyle: {
          color: "#DC2626",
          color0: "#16A34A",
          borderColor: "#DC2626",
          borderColor0: "#16A34A",
        },
        markLine: {
          symbol: "none",
          silent: true,
          data: markLineData,
        },
      },
      {
        name: "MA20",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: alignMovingAverageSeries(tradeDates, snapshot.ma20Series),
      },
      {
        name: "MA60",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: alignMovingAverageSeries(tradeDates, snapshot.ma60Series),
      },
    ],
  };
}

export function StockKlineChart({ tsCode }: StockKlineChartProps) {
  const chartElementRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [loadState, setLoadState] = useState<ChartLoadState>(initialLoadState);
  const isLoading = Boolean(tsCode && loadState.tsCode !== tsCode);
  const snapshot = tsCode === loadState.tsCode ? loadState.snapshot : null;
  const chartOptions = useMemo(
    () => (snapshot ? buildChartOptions(snapshot) : {}),
    [snapshot],
  );

  useEffect(() => {
    if (!tsCode) {
      return;
    }

    const selectedTsCode = tsCode;
    const controller = new AbortController();

    async function loadChartData() {
      try {
        const response = await fetch(
          `/api/results/chart/${encodeURIComponent(selectedTsCode)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("chart_api_failed");
        }

        const nextSnapshot = (await response.json()) as ChartSnapshot;
        setLoadState({
          tsCode: selectedTsCode,
          snapshot: nextSnapshot,
          failed: false,
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          tsCode: selectedTsCode,
          snapshot: null,
          failed: true,
        });
      }
    }

    void loadChartData();

    return () => controller.abort();
  }, [tsCode]);

  useEffect(() => {
    if (!chartElementRef.current || !snapshot || snapshot.status !== "ready") {
      return;
    }

    const chart =
      chartInstanceRef.current ?? echarts.init(chartElementRef.current);
    chartInstanceRef.current = chart;
    chart.setOption(chartOptions, true);

    function handleResize() {
      chart.resize();
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [chartOptions, snapshot]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  if (!tsCode) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-4">
        <p className="text-[15px] font-medium leading-[1.4] text-foreground">
          尚未选择股票
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
          <CandlestickChart className="size-4 animate-pulse" />
          正在加载图表
        </div>
      </div>
    );
  }

  if (loadState.failed) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-4">
        <p className="flex items-center gap-2 text-[15px] font-medium leading-[1.4] text-foreground">
          <AlertTriangle className="size-4 text-[#B45309]" />
          图表加载失败
        </p>
      </div>
    );
  }

  if (!snapshot || snapshot.status !== "ready") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-4">
        <p className="flex items-center gap-2 text-[15px] font-medium leading-[1.4] text-foreground">
          <CircleSlash className="size-4 text-muted-foreground" />
          图表数据不可用
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[18px] font-semibold leading-[1.3]">
            {snapshot.row.tsCode} {snapshot.row.name}
          </h3>
          <p className="mt-1 text-[13px] leading-[1.4] text-muted-foreground">
            最近 {snapshot.bars.length} 个交易日
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            区间高点 {formatPrice(snapshot.overlays.intervalHighPrice)}
          </Badge>
          <Badge variant="outline">
            85%阈值 {formatPrice(snapshot.overlays.threshold85Price)}
          </Badge>
        </div>
      </div>
      <div
        ref={chartElementRef}
        role="img"
        aria-label={`${snapshot.row.tsCode} K线图`}
        className="h-[360px] min-h-[320px] w-full"
      />
    </div>
  );
}
