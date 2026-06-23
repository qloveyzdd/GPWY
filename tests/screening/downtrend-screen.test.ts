// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  evaluateDowntrendStock,
  findIntervalHigh,
} from "@/lib/screening/downtrend-screen";
import type { ScreeningDailyBar } from "@/lib/screening/screening-types";

function makeDescendingBars(): ScreeningDailyBar[] {
  return Array.from({ length: 60 }, (_, index) => {
    const close = 100 - index;

    return {
      tsCode: "000001.SZ",
      tradeDate: `2026${String(index + 1).padStart(4, "0")}`,
      open: close + 0.5,
      high: close + 1,
      low: close - 1,
      close,
      vol: 1000 + index,
    };
  });
}

describe("downtrend screen", () => {
  it("uses the latest strict local swing high when present", () => {
    const bars = makeDescendingBars();
    bars[40] = { ...bars[40], high: 95 };
    bars[50] = { ...bars[50], high: 90 };

    const high = findIntervalHigh(bars);

    expect(high).toEqual({
      tradeDate: bars[50].tradeDate,
      price: 90,
      source: "swing_high",
    });
  });

  it("falls back to the latest 60-day highest high when no local swing high exists", () => {
    const bars = makeDescendingBars();
    bars[10] = { ...bars[10], high: 120 };
    bars[11] = { ...bars[11], high: 120 };

    const high = findIntervalHigh(bars);

    expect(high).toEqual({
      tradeDate: bars[11].tradeDate,
      price: 120,
      source: "fallback_60d_high",
    });
  });

  it("matches when MA trend, MA20 slope, and 85 percent threshold all pass", () => {
    const bars = makeDescendingBars();
    bars[50] = { ...bars[50], high: 90 };

    const result = evaluateDowntrendStock({
      tsCode: "000001.SZ",
      bars,
    });

    expect(result.status).toBe("matched");
    if (result.status !== "matched") {
      throw new Error("expected matched result");
    }
    expect(result.currentPrice).toBe(41);
    expect(result.intervalHigh).toBe(90);
    expect(result.currentHighRatio).toBeCloseTo(41 / 90, 8);
    expect(result.drawdownPct).toBeCloseTo(1 - 41 / 90, 8);
    expect(result.ma20).toBeLessThan(result.ma60);
    expect(result.ma20Slope).toBeLessThan(0);
    expect(result.intervalHighSource).toBe("swing_high");
  });

  it("includes the 85 percent boundary", () => {
    const bars = makeDescendingBars();
    bars[50] = { ...bars[50], high: 90 };
    bars[59] = { ...bars[59], close: 76.5, high: 77 };

    const result = evaluateDowntrendStock({
      tsCode: "000001.SZ",
      bars,
    });

    expect(result.status).toBe("matched");
    if (result.status !== "matched") {
      throw new Error("expected matched result");
    }
    expect(result.currentHighRatio).toBe(0.85);
  });

  it("skips stocks with fewer than 60 bars", () => {
    const result = evaluateDowntrendStock({
      tsCode: "000001.SZ",
      bars: makeDescendingBars().slice(0, 59),
    });

    expect(result).toEqual({
      status: "skipped",
      tsCode: "000001.SZ",
      reason: "insufficient_bars",
      availableBars: 59,
    });
  });
});
