import type {
  MovingAveragePoint,
  ScreeningDailyBar,
} from "@/lib/screening/screening-types";

export function sortBarsByTradeDate<T extends { tradeDate: string }>(
  bars: T[],
) {
  return [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

export function calculateMovingAverageSeries(
  bars: ScreeningDailyBar[],
  period: number,
): MovingAveragePoint[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("moving average period must be a positive integer");
  }

  const sorted = sortBarsByTradeDate(bars);
  const series: MovingAveragePoint[] = [];
  let rollingSum = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    rollingSum += sorted[index].close;

    if (index >= period) {
      rollingSum -= sorted[index - period].close;
    }

    if (index >= period - 1) {
      series.push({
        tradeDate: sorted[index].tradeDate,
        value: rollingSum / period,
      });
    }
  }

  return series;
}

export function getLatestMovingAverage(
  bars: ScreeningDailyBar[],
  period: number,
) {
  const series = calculateMovingAverageSeries(bars, period);

  return series.at(-1)?.value ?? null;
}

export function calculateLatestMaSlope(
  series: MovingAveragePoint[],
  pointCount = 5,
) {
  if (!Number.isInteger(pointCount) || pointCount < 2) {
    throw new Error("slope point count must be an integer greater than 1");
  }

  if (series.length < pointCount) {
    return null;
  }

  const latestPoints = series.slice(-pointCount);
  const first = latestPoints[0];
  const last = latestPoints.at(-1);

  if (!last) {
    return null;
  }

  return (last.value - first.value) / (pointCount - 1);
}

export function isLatestMaSlopeNegative(
  series: MovingAveragePoint[],
  pointCount = 5,
) {
  const slope = calculateLatestMaSlope(series, pointCount);

  return slope === null ? false : slope < 0;
}
