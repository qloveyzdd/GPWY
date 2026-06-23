// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  calculateLatestMaSlope,
  calculateMovingAverageSeries,
  getLatestMovingAverage,
  isLatestMaSlopeNegative,
  sortBarsByTradeDate,
} from "@/lib/screening/indicators";
import type { ScreeningDailyBar } from "@/lib/screening/screening-types";

function bar(tradeDate: string, close: number): ScreeningDailyBar {
  return {
    tsCode: "000001.SZ",
    tradeDate,
    open: close,
    high: close,
    low: close,
    close,
    vol: 1000,
  };
}

describe("screening indicators", () => {
  it("sorts daily bars by trade date before calculations", () => {
    const sorted = sortBarsByTradeDate([
      bar("20260603", 3),
      bar("20260601", 1),
      bar("20260602", 2),
    ]);

    expect(sorted.map((item) => item.tradeDate)).toEqual([
      "20260601",
      "20260602",
      "20260603",
    ]);
  });

  it("calculates moving average series only after enough closes exist", () => {
    const series = calculateMovingAverageSeries(
      [bar("20260601", 1), bar("20260602", 2), bar("20260603", 3)],
      2,
    );

    expect(series).toEqual([
      { tradeDate: "20260602", value: 1.5 },
      { tradeDate: "20260603", value: 2.5 },
    ]);
  });

  it("returns the latest moving average for chronological close prices", () => {
    const bars = Array.from({ length: 60 }, (_, index) =>
      bar(`202606${String(index + 1).padStart(2, "0")}`, index + 1),
    );

    expect(getLatestMovingAverage(bars, 20)).toBe(50.5);
    expect(getLatestMovingAverage(bars, 60)).toBe(30.5);
  });

  it("detects negative latest 5-point MA slope", () => {
    const descending = [
      { tradeDate: "20260601", value: 12 },
      { tradeDate: "20260602", value: 11 },
      { tradeDate: "20260603", value: 10.5 },
      { tradeDate: "20260604", value: 10 },
      { tradeDate: "20260605", value: 9.5 },
    ];
    const flat = descending.map((point) => ({ ...point, value: 10 }));

    expect(isLatestMaSlopeNegative(descending, 5)).toBe(true);
    expect(calculateLatestMaSlope(descending, 5)).toBe(-0.625);
    expect(isLatestMaSlopeNegative(flat, 5)).toBe(false);
    expect(isLatestMaSlopeNegative(descending.slice(-4), 5)).toBe(false);
    expect(calculateLatestMaSlope(descending.slice(-4), 5)).toBeNull();
  });
});
