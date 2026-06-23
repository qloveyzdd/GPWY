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
  swingNeighborCount?: number;
  thresholdRatio?: number;
  maSlopePointCount?: number;
};

const defaultWindowSize = 60;
const defaultSwingNeighborCount = 3;
const defaultThresholdRatio = 0.85;
const defaultMaSlopePointCount = 5;

function latestWindow(bars: ScreeningDailyBar[], windowSize: number) {
  return sortBarsByTradeDate(bars).slice(-windowSize);
}

function isStrictSwingHigh(
  bars: ScreeningDailyBar[],
  index: number,
  neighborCount: number,
) {
  const currentHigh = bars[index].high;

  for (
    let neighborIndex = index - neighborCount;
    neighborIndex <= index + neighborCount;
    neighborIndex += 1
  ) {
    if (neighborIndex === index) {
      continue;
    }

    if (currentHigh <= bars[neighborIndex].high) {
      return false;
    }
  }

  return true;
}

function findRecentSwingHigh(
  bars: ScreeningDailyBar[],
  neighborCount: number,
): IntervalHigh | null {
  for (
    let index = bars.length - neighborCount - 1;
    index >= neighborCount;
    index -= 1
  ) {
    if (isStrictSwingHigh(bars, index, neighborCount)) {
      return {
        tradeDate: bars[index].tradeDate,
        price: bars[index].high,
        source: "swing_high",
      };
    }
  }

  return null;
}

function findFallbackHigh(bars: ScreeningDailyBar[]): IntervalHigh {
  return bars.reduce<IntervalHigh>(
    (highest, bar) => {
      if (bar.high >= highest.price) {
        return {
          tradeDate: bar.tradeDate,
          price: bar.high,
          source: "fallback_60d_high",
        };
      }

      return highest;
    },
    {
      tradeDate: bars[0].tradeDate,
      price: bars[0].high,
      source: "fallback_60d_high",
    },
  );
}

export function findIntervalHigh(
  bars: ScreeningDailyBar[],
  neighborCount = defaultSwingNeighborCount,
): IntervalHigh {
  const sorted = sortBarsByTradeDate(bars);
  const swingHigh = findRecentSwingHigh(sorted, neighborCount);

  return swingHigh ?? findFallbackHigh(sorted);
}

export function evaluateDowntrendStock({
  tsCode,
  bars,
  windowSize = defaultWindowSize,
  swingNeighborCount = defaultSwingNeighborCount,
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

  const intervalHigh = findIntervalHigh(windowBars, swingNeighborCount);
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
