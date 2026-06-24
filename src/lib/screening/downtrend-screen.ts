import {
  calculateLatestMaSlope,
  calculateMovingAverageSeries,
  getLatestMovingAverage,
  sortBarsByTradeDate,
} from "@/lib/screening/indicators";
import type {
  DowntrendEvaluationResult,
  DowntrendRejectedReason,
  IntervalHigh,
  ScreeningDailyBar,
} from "@/lib/screening/screening-types";

export type EvaluateDowntrendStockOptions = {
  tsCode: string;
  bars: ScreeningDailyBar[];
  windowSize?: number;
  thresholdRatio?: number;
  maSlopePointCount?: number;
};

const defaultWindowSize = 60;
const defaultThresholdRatio = 0.85;
const defaultMaSlopePointCount = 5;

function latestWindow(bars: ScreeningDailyBar[], windowSize: number) {
  return sortBarsByTradeDate(bars).slice(-windowSize);
}

export function findIntervalHigh(bars: ScreeningDailyBar[]): IntervalHigh {
  const sorted = sortBarsByTradeDate(bars);
  let candidate = sorted.at(-1);

  if (!candidate) {
    throw new Error("interval high requires at least one bar");
  }

  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    const previous = sorted[index];

    if (previous.high <= candidate.high) {
      break;
    }

    candidate = previous;
  }

  return {
    tradeDate: candidate.tradeDate,
    price: candidate.high,
    source: "swing_high",
  };
}

export function evaluateDowntrendStock({
  tsCode,
  bars,
  windowSize = defaultWindowSize,
  thresholdRatio = defaultThresholdRatio,
  maSlopePointCount = defaultMaSlopePointCount,
}: EvaluateDowntrendStockOptions): DowntrendEvaluationResult {
  if (bars.length < windowSize) {
    return {
      status: "skipped",
      tsCode,
      reason: "insufficient_bars",
      availableBars: bars.length,
    };
  }

  const windowBars = latestWindow(bars, windowSize);
  const latestBar = windowBars.at(-1);
  const ma20 = getLatestMovingAverage(windowBars, 20);
  const ma60 = getLatestMovingAverage(windowBars, 60);
  const ma20Series = calculateMovingAverageSeries(windowBars, 20);
  const ma20Slope = calculateLatestMaSlope(ma20Series, maSlopePointCount);

  if (!latestBar || ma20 === null || ma60 === null || ma20Slope === null) {
    return {
      status: "skipped",
      tsCode,
      reason: "insufficient_bars",
      availableBars: bars.length,
    };
  }

  const intervalHigh = findIntervalHigh(windowBars);
  const currentPrice = latestBar.close;
  const currentHighRatio = currentPrice / intervalHigh.price;
  const drawdownPct = 1 - currentHighRatio;
  const reasons: DowntrendRejectedReason[] = [];

  if (ma20 >= ma60) {
    reasons.push("ma20_not_below_ma60");
  }

  if (ma20Slope >= 0) {
    reasons.push("ma20_slope_not_negative");
  }

  if (currentPrice > intervalHigh.price * thresholdRatio) {
    reasons.push("price_above_threshold");
  }

  const result = {
    tsCode,
    latestTradeDate: latestBar.tradeDate,
    currentPrice,
    intervalHigh: intervalHigh.price,
    intervalHighTradeDate: intervalHigh.tradeDate,
    intervalHighSource: intervalHigh.source,
    currentHighRatio,
    drawdownPct,
    ma20,
    ma60,
    ma20Slope,
  };

  return reasons.length
    ? {
        status: "rejected",
        reasons,
        ...result,
      }
    : {
        status: "matched",
        ...result,
      };
}
