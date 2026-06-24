import { readDailyBarsForRefreshJob } from "@/lib/refresh/refresh-store";
import { readLatestResultsSnapshot } from "@/lib/results/results-snapshot";
import type {
  ChartDailyBar,
  ChartUnavailableReason,
  ChartMovingAveragePoint,
  ChartSnapshot,
} from "@/lib/results/chart-types";
import { calculateMovingAverageSeries } from "@/lib/screening/indicators";
import { readLatestScreeningRun } from "@/lib/screening/screening-store";
import type { ScreeningDailyBar } from "@/lib/screening/screening-types";

function toChartBar(bar: ScreeningDailyBar): ChartDailyBar {
  return {
    tradeDate: bar.tradeDate,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    vol: bar.vol,
  };
}

function toChartMaPoint(point: {
  tradeDate: string;
  value: number;
}): ChartMovingAveragePoint {
  return {
    tradeDate: point.tradeDate,
    value: point.value,
  };
}

function unavailable(unavailableReason: ChartUnavailableReason): ChartSnapshot {
  if (unavailableReason === "stock_not_in_latest_results") {
    return {
      status: "not_found",
      unavailableReason,
      row: null,
      bars: [],
      ma20Series: [],
      ma60Series: [],
      overlays: null,
    };
  }

  return {
    status: "unavailable",
    unavailableReason,
    row: null,
    bars: [],
    ma20Series: [],
    ma60Series: [],
    overlays: null,
  };
}

export function readLatestChartSnapshot(tsCode: string): ChartSnapshot {
  const normalizedTsCode = tsCode.trim().toUpperCase();
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    return unavailable("no_screening_run");
  }

  const resultsSnapshot = readLatestResultsSnapshot();

  if (resultsSnapshot.status !== "ready") {
    return unavailable("stock_not_in_latest_results");
  }

  const row = resultsSnapshot.rows.find(
    (resultRow) => resultRow.tsCode === normalizedTsCode,
  );

  if (!row) {
    return unavailable("stock_not_in_latest_results");
  }

  const bars = readDailyBarsForRefreshJob(screeningRun.sourceRefreshJobId)
    .filter((bar) => bar.tsCode === row.tsCode)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate))
    .slice(-60);

  return {
    status: "ready",
    unavailableReason: null,
    row,
    bars: bars.map(toChartBar),
    ma20Series: calculateMovingAverageSeries(bars, 20).map(toChartMaPoint),
    ma60Series: calculateMovingAverageSeries(bars, 60).map(toChartMaPoint),
    overlays: {
      intervalHighPrice: row.intervalHigh,
      intervalHighTradeDate: row.intervalHighTradeDate,
      threshold85Price: row.intervalHigh * 0.85,
      chipPeaks: row.chipPeakState === "available" ? row.chipPeaks : [],
      chipPeakState: row.chipPeakState,
    },
  };
}
