"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { AlertTriangle, CandlestickChart, CircleSlash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  ChartCalculatedChipDistributionPanel,
  ChartCalculatedChipDistributionSet,
  ChartChipDistributions,
  ChartChipDistributionPanel,
  ChartChipDistributionScale,
  ChartChipDistributionTargetKind,
  ChartMovingAveragePoint,
  ReadyChartSnapshot,
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

type ChipDistributionCardProps = {
  panel: ChartChipDistributionPanel;
  scale: ChartChipDistributionScale;
};

type CalculatedChipDistributionCardProps = {
  panel: ChartCalculatedChipDistributionPanel;
  scale: ChartChipDistributionScale;
};

const initialLoadState: ChartLoadState = {
  tsCode: null,
  snapshot: null,
  failed: false,
};

const distributionStatusLabels: Record<
  ChartChipDistributionPanel["status"],
  string
> = {
  succeeded: "可用",
  blocked: "阻塞",
  failed: "失败",
  missing: "缺少数据",
};

function distributionTargetLabel(targetKind: ChartChipDistributionTargetKind) {
  return targetKind === "previous" ? "前一有效交易日" : "最新有效交易日";
}

function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatDistributionPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatAxisPercent(value: string | number) {
  return formatDistributionPercent(Number(value));
}

function sanitizeUnavailableSummary(summary: string | null) {
  if (!summary) {
    return null;
  }

  return summary
    .replace(/TUSHARE_TOKEN/gi, "[已隐藏]")
    .replace(/Authorization/gi, "[已隐藏]")
    .replace(/REFRESH_DB_PATH/gi, "[已隐藏]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[已隐藏路径]");
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

function findPreviousTradeDate(snapshot: ReadyChartSnapshot) {
  const latestIndex = snapshot.bars.findIndex(
    (bar) => bar.tradeDate === snapshot.row.latestTradeDate,
  );

  if (latestIndex <= 0) {
    return null;
  }

  return snapshot.bars[latestIndex - 1]?.tradeDate ?? null;
}

function fallbackDistributionPanel(
  snapshot: ReadyChartSnapshot,
  targetKind: ChartChipDistributionTargetKind,
): ChartChipDistributionPanel {
  return {
    targetKind,
    label: distributionTargetLabel(targetKind),
    tradeDate:
      targetKind === "latest"
        ? snapshot.row.latestTradeDate
        : findPreviousTradeDate(snapshot),
    status: "missing",
    levels: [],
    maxLevel: null,
    errorCategory: null,
    errorSummary:
      targetKind === "previous" ? "previous_trade_date_missing" : null,
  };
}

function resolveChipDistributions(
  snapshot: ReadyChartSnapshot,
): ChartChipDistributions {
  const distributions = snapshot.chipDistributions as Partial<ChartChipDistributions>;

  return {
    previous:
      distributions.previous ??
      fallbackDistributionPanel(snapshot, "previous"),
    latest:
      distributions.latest ?? fallbackDistributionPanel(snapshot, "latest"),
    scale:
      distributions.scale ?? {
        priceLevels: [],
        maxPercent: 0,
      },
  };
}

function resolveCalculatedChipDistributionSet(
  snapshot: ReadyChartSnapshot,
  selectedCoefficient: string,
): ChartCalculatedChipDistributionSet | null {
  const calculated = snapshot.calculatedChipDistributions;

  return (
    calculated.byCoefficient[selectedCoefficient] ??
    calculated.byCoefficient[String(calculated.defaultDecayCoefficient)] ??
    null
  );
}

function mapDistributionSeries(
  panel: ChartChipDistributionPanel,
  scale: ChartChipDistributionScale,
) {
  const percentByPrice = new Map(
    panel.levels.map((level) => [
      formatPrice(level.price),
      Number(level.percent.toFixed(4)),
    ]),
  );

  return scale.priceLevels.map(
    (priceLevel) => percentByPrice.get(formatPrice(priceLevel)) ?? 0,
  );
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

function buildDistributionOptions(
  panel: ChartChipDistributionPanel,
  scale: ChartChipDistributionScale,
): EChartsOption {
  const yAxisData = scale.priceLevels.map(formatPrice);
  const seriesData = mapDistributionSeries(panel, scale);
  const maxPercent = scale.maxPercent > 0 ? scale.maxPercent : undefined;
  const maxLevel = panel.maxLevel;

  return {
    animation: false,
    color: [panel.targetKind === "latest" ? "#2563EB" : "#0F766E"],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) =>
        formatDistributionPercent(Number(value ?? 0)),
    },
    grid: {
      top: 20,
      left: 56,
      right: 32,
      bottom: 32,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      max: maxPercent,
      axisLabel: {
        formatter: formatAxisPercent,
      },
      splitLine: {
        lineStyle: { color: "#E5E7EB" },
      },
    },
    yAxis: {
      type: "category",
      data: yAxisData,
      axisLabel: {
        hideOverlap: true,
      },
    },
    series: [
      {
        name: `${panel.label}占比`,
        type: "bar",
        barMaxWidth: 18,
        data: seriesData,
        markPoint: maxLevel
          ? {
              symbolSize: 48,
              label: {
                formatter: `最大占比\n${formatPrice(maxLevel.price)} / ${formatDistributionPercent(maxLevel.percent)}`,
              },
              data: [
                {
                  name: "最大占比",
                  coord: [maxLevel.percent, formatPrice(maxLevel.price)],
                  value: maxLevel.percent,
                },
              ],
            }
          : undefined,
      },
    ],
  };
}

function calculatedPanelToChartPanel(
  panel: ChartCalculatedChipDistributionPanel,
): ChartChipDistributionPanel {
  return {
    targetKind: panel.targetKind,
    label: panel.label,
    tradeDate: panel.targetTradeDate,
    status: panel.status,
    levels: panel.levels,
    maxLevel: panel.maxLevel,
    errorCategory: panel.errorCategory,
    errorSummary: panel.errorSummary,
  };
}

function ChipDistributionCard({
  panel,
  scale,
}: ChipDistributionCardProps) {
  const chartElementRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const isReady =
    panel.status === "succeeded" &&
    panel.levels.length > 0 &&
    scale.priceLevels.length > 0;
  const chartOptions = useMemo(
    () => (isReady ? buildDistributionOptions(panel, scale) : {}),
    [isReady, panel, scale],
  );

  useEffect(() => {
    if (isReady) {
      return;
    }

    chartInstanceRef.current?.dispose();
    chartInstanceRef.current = null;
  }, [isReady]);

  useEffect(() => {
    if (!chartElementRef.current || !isReady) {
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
  }, [chartOptions, isReady]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  const tradeDateText = panel.tradeDate ?? "未确定交易日";

  if (!isReady) {
    const summary =
      sanitizeUnavailableSummary(panel.errorSummary) ??
      (panel.status === "missing"
        ? "该交易日暂无筹码分布数据。"
        : "该交易日筹码分布暂不可用。");
    const isMissing = panel.status === "missing";
    const unavailableClassName = isMissing
      ? "border-dashed border-border bg-muted/20"
      : panel.status === "blocked"
        ? "border-[#F59E0B]/40 bg-[#FEF3C7]/30"
        : "border-destructive/30 bg-destructive/5";

    return (
      <section
        className={`flex min-h-[320px] flex-col rounded-lg border p-4 ${unavailableClassName}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-[15px] font-semibold leading-[1.4]">
              {panel.label} {tradeDateText}
            </h4>
            <p className="mt-1 text-[13px] leading-[1.4] text-muted-foreground">
              {isMissing ? "正常空状态" : "单日数据不可用"}
            </p>
          </div>
          <Badge variant={isMissing ? "outline" : "secondary"}>
            {distributionStatusLabels[panel.status]}
          </Badge>
        </div>
        <div className="mt-6 flex flex-1 items-center justify-center text-center">
          <div className="max-w-[320px]">
            {isMissing ? (
              <CircleSlash className="mx-auto size-6 text-muted-foreground" />
            ) : (
              <AlertTriangle className="mx-auto size-6 text-[#B45309]" />
            )}
            {panel.errorCategory ? (
              <p className="mt-3 text-[13px] font-medium leading-[1.4] text-foreground">
                {panel.errorCategory}
              </p>
            ) : null}
            <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
              {summary}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[320px] rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-[15px] font-semibold leading-[1.4]">
            {panel.label} {tradeDateText}
          </h4>
          <p className="mt-1 text-[13px] leading-[1.4] text-muted-foreground">
            完整价格档位分布
          </p>
        </div>
        {panel.maxLevel ? (
          <Badge variant="secondary">
            最大占比 {formatPrice(panel.maxLevel.price)} /{" "}
            {formatDistributionPercent(panel.maxLevel.percent)}
          </Badge>
        ) : null}
      </div>
      <div
        ref={chartElementRef}
        role="img"
        aria-label={`${panel.label} ${tradeDateText} 筹码分布图`}
        className="h-[260px] min-h-[240px] w-full"
      />
    </section>
  );
}

function CalculatedChipDistributionCard({
  panel,
  scale,
}: CalculatedChipDistributionCardProps) {
  const chartElementRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const chartPanel = calculatedPanelToChartPanel(panel);
  const isReady =
    panel.status === "succeeded" &&
    panel.levels.length > 0 &&
    scale.priceLevels.length > 0;
  const chartOptions = useMemo(
    () => (isReady ? buildDistributionOptions(chartPanel, scale) : {}),
    [chartPanel, isReady, scale],
  );

  useEffect(() => {
    if (isReady) {
      return;
    }

    chartInstanceRef.current?.dispose();
    chartInstanceRef.current = null;
  }, [isReady]);

  useEffect(() => {
    if (!chartElementRef.current || !isReady) {
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
  }, [chartOptions, isReady]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  const targetDateText = panel.targetTradeDate ?? "未确定交易日";
  const seedDateText = panel.seedTradeDate ?? "未确定种子日";

  if (!isReady) {
    const summary =
      sanitizeUnavailableSummary(panel.errorSummary) ??
      panel.unavailableReason ??
      "该计算分布暂不可用。";

    return (
      <section className="flex min-h-[320px] flex-col rounded-lg border border-[#F59E0B]/40 bg-[#FEF3C7]/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-[15px] font-semibold leading-[1.4]">
              {panel.label} {targetDateText}
            </h4>
            <p className="mt-1 text-[13px] leading-[1.4] text-muted-foreground">
              目标日 {targetDateText} · 种子日 {seedDateText}
            </p>
          </div>
          <Badge variant="secondary">
            {distributionStatusLabels[panel.status]}
          </Badge>
        </div>
        <div className="mt-6 flex flex-1 items-center justify-center text-center">
          <div className="max-w-[320px]">
            <AlertTriangle className="mx-auto size-6 text-[#B45309]" />
            {panel.unavailableReason ? (
              <p className="mt-3 text-[13px] font-medium leading-[1.4] text-foreground">
                {panel.unavailableReason}
              </p>
            ) : null}
            <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
              {summary}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[320px] rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-[15px] font-semibold leading-[1.4]">
            {panel.label} {targetDateText}
          </h4>
          <p className="mt-1 text-[13px] leading-[1.4] text-muted-foreground">
            目标日 {targetDateText} · 种子日 {seedDateText}
          </p>
        </div>
        {panel.maxLevel ? (
          <Badge variant="secondary">
            最大占比 {formatPrice(panel.maxLevel.price)} /{" "}
            {formatDistributionPercent(panel.maxLevel.percent)}
          </Badge>
        ) : null}
      </div>
      <div
        ref={chartElementRef}
        role="img"
        aria-label={`${panel.label} ${targetDateText} 计算分布图`}
        className="h-[260px] min-h-[240px] w-full"
      />
    </section>
  );
}

export function StockKlineChart({ tsCode }: StockKlineChartProps) {
  const chartElementRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [loadState, setLoadState] = useState<ChartLoadState>(initialLoadState);
  const [selectedDecayCoefficient, setSelectedDecayCoefficient] = useState({
    tsCode: null as string | null,
    coefficient: "0.5",
  });
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

  const calculatedCoefficientOptions =
    snapshot.calculatedChipDistributions.coefficients.map(String);
  const defaultCalculatedCoefficient = String(
    snapshot.calculatedChipDistributions.defaultDecayCoefficient,
  );
  const selectedCalculatedCoefficient =
    selectedDecayCoefficient.tsCode === snapshot.row.tsCode
      ? selectedDecayCoefficient.coefficient
      : defaultCalculatedCoefficient;
  const effectiveCalculatedCoefficient =
    calculatedCoefficientOptions.includes(selectedCalculatedCoefficient)
      ? selectedCalculatedCoefficient
      : defaultCalculatedCoefficient;
  const chipDistributions = resolveChipDistributions(snapshot);
  const calculatedSet = resolveCalculatedChipDistributionSet(
    snapshot,
    effectiveCalculatedCoefficient,
  );

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
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChipDistributionCard
          panel={chipDistributions.previous}
          scale={chipDistributions.scale}
        />
        <ChipDistributionCard
          panel={chipDistributions.latest}
          scale={chipDistributions.scale}
        />
      </div>
      {calculatedSet ? (
        <section className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-[16px] font-semibold leading-[1.4]">
                计算分布
              </h3>
              <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
                模型输出，不等同官方 cyq_chips
              </p>
              <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
                模型 {calculatedSet.latest.modelVersion}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[13px] font-medium" htmlFor="chip-decay-coefficient">
                衰减系数
              </label>
              <select
                id="chip-decay-coefficient"
                aria-label="衰减系数"
                className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
                value={effectiveCalculatedCoefficient}
                onChange={(event) =>
                  setSelectedDecayCoefficient({
                    tsCode: snapshot.row.tsCode,
                    coefficient: event.currentTarget.value,
                  })
                }
              >
                {calculatedCoefficientOptions.map((coefficient) => (
                  <option key={coefficient} value={coefficient}>
                    {coefficient}
                  </option>
                ))}
              </select>
              <Badge variant="outline">
                衰减系数 {effectiveCalculatedCoefficient}
              </Badge>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <CalculatedChipDistributionCard
              panel={calculatedSet.previous}
              scale={calculatedSet.scale}
            />
            <CalculatedChipDistributionCard
              panel={calculatedSet.latest}
              scale={calculatedSet.scale}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
