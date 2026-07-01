// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  applyChipDecayDay,
  calculateDecayChipDistribution,
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
  parseChipDecayCoefficient,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
} from "@/lib/chip/chip-model";

describe("decay chip model contract", () => {
  it("defines the fixed coefficient set and default coefficient", () => {
    expect(SUPPORTED_CHIP_DECAY_COEFFICIENTS).toEqual([
      0.3, 0.5, 0.8, 1, 1.2, 1.5, 2,
    ]);
    expect(DEFAULT_CHIP_DECAY_COEFFICIENT).toBe(0.5);
    expect(CHIP_MODEL_VERSION).toBe("decay-triangle-v1");
  });

  it("rejects coefficients outside the fixed set", () => {
    expect(parseChipDecayCoefficient(0.3)).toBe(0.3);
    expect(parseChipDecayCoefficient("1.5")).toBe(1.5);
    expect(() => parseChipDecayCoefficient(0.7)).toThrow(
      "invalid_chip_decay_coefficient",
    );
    expect(() => parseChipDecayCoefficient("bad")).toThrow(
      "invalid_chip_decay_coefficient",
    );
  });

  it("returns calculated distribution metadata for a seed-date snapshot", () => {
    const result = calculateDecayChipDistribution({
      tsCode: "000001.SZ",
      seedTradeDate: "20260626",
      targetTradeDate: "20260626",
      seedLevels: [
        { price: 10, percent: 60 },
        { price: 11, percent: 40 },
      ],
      bars: [],
      decayCoefficient: DEFAULT_CHIP_DECAY_COEFFICIENT,
    });

    expect(result.status).toBe("succeeded");

    if (result.status !== "succeeded") {
      throw new Error("expected_succeeded_result");
    }

    expect(result.modelVersion).toBe(CHIP_MODEL_VERSION);
    expect(result.decayCoefficient).toBe(0.5);
    expect(result.seedTradeDate).toBe("20260626");
    expect(result.targetTradeDate).toBe("20260626");
    expect(result.source).toBe("calculated_decay_model");
  });
});

describe("single-day chip decay", () => {
  it("moves the decayed weight into the daily price range and normalizes", () => {
    const nextLevels = applyChipDecayDay({
      levels: [
        { price: 20, percent: 50 },
        { price: 21, percent: 50 },
      ],
      bar: modelBar({
        low: 10,
        high: 12,
        averagePrice: 11,
        turnoverRate: 10,
      }),
      decayCoefficient: 1,
    });

    expect(sumPercent(nextLevels)).toBeCloseTo(100, 8);
    expect(sumPercentInRange(nextLevels, 10, 12)).toBeCloseTo(10, 6);
    expect(sumPercentInRange(nextLevels, 20, 21)).toBeCloseTo(90, 6);
    expect(nextLevels.every((level) => Number.isFinite(level.percent))).toBe(
      true,
    );
  });

  it("keeps more old high-price chips with a lower decay coefficient", () => {
    const seedLevels = [
      { price: 20, percent: 50 },
      { price: 21, percent: 50 },
    ];
    const bar = modelBar({
      low: 10,
      high: 12,
      averagePrice: 11,
      turnoverRate: 20,
    });

    const slowDecay = applyChipDecayDay({
      levels: seedLevels,
      bar,
      decayCoefficient: 0.3,
    });
    const fastDecay = applyChipDecayDay({
      levels: seedLevels,
      bar,
      decayCoefficient: 1.5,
    });

    expect(sumPercentInRange(slowDecay, 20, 21)).toBeGreaterThan(
      sumPercentInRange(fastDecay, 20, 21),
    );
  });

  it("handles a flat daily price range without empty output or NaN", () => {
    const nextLevels = applyChipDecayDay({
      levels: [{ price: 20, percent: 100 }],
      bar: modelBar({
        low: 10,
        high: 10,
        averagePrice: 10,
        turnoverRate: 100,
      }),
      decayCoefficient: 2,
    });

    expect(nextLevels).toEqual([{ price: 10, percent: 100 }]);
    expect(sumPercent(nextLevels)).toBeCloseTo(100, 8);
  });
});

describe("decay chip distribution calculation", () => {
  it("rolls seed levels forward through sorted daily bars to the target date", () => {
    const result = calculateDecayChipDistribution({
      tsCode: "000001.SZ",
      seedTradeDate: "20260626",
      targetTradeDate: "20260629",
      seedLevels: [{ price: 20, percent: 100 }],
      bars: [
        modelBar({
          tradeDate: "20260629",
          low: 11,
          high: 13,
          averagePrice: 12,
          turnoverRate: 10,
        }),
        modelBar({
          tradeDate: "20260627",
          low: 10,
          high: 12,
          averagePrice: 11,
          turnoverRate: 10,
        }),
      ],
      decayCoefficient: 1,
    });

    expect(result.status).toBe("succeeded");

    if (result.status !== "succeeded") {
      throw new Error("expected_succeeded_result");
    }

    expect(sumPercent(result.levels)).toBeCloseTo(100, 8);
    expect(sumPercentInRange(result.levels, 20, 20)).toBeCloseTo(81, 6);
    expect(result.levels.map((level) => level.price)).toEqual(
      [...result.levels].map((level) => level.price).sort((left, right) => left - right),
    );
  });

  it("returns missing_trade_data when the target bar is absent", () => {
    const result = calculateDecayChipDistribution({
      tsCode: "000001.SZ",
      seedTradeDate: "20260626",
      targetTradeDate: "20260629",
      seedLevels: [{ price: 20, percent: 100 }],
      bars: [
        modelBar({
          tradeDate: "20260627",
          low: 10,
          high: 12,
          averagePrice: 11,
          turnoverRate: 10,
        }),
      ],
      decayCoefficient: 1,
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "missing_trade_data",
    });
  });

  it("returns structured unavailable reasons for missing turnover and adjustment", () => {
    const missingTurnover = calculateDecayChipDistribution({
      tsCode: "000001.SZ",
      seedTradeDate: "20260626",
      targetTradeDate: "20260627",
      seedLevels: [{ price: 20, percent: 100 }],
      bars: [
        modelBar({
          tradeDate: "20260627",
          low: 10,
          high: 12,
          averagePrice: 11,
          turnoverRate: null,
        }),
      ],
      decayCoefficient: 1,
    });
    const missingAdjustment = calculateDecayChipDistribution({
      tsCode: "000001.SZ",
      seedTradeDate: "20260626",
      targetTradeDate: "20260627",
      seedLevels: [{ price: 20, percent: 100 }],
      bars: [
        modelBar({
          tradeDate: "20260627",
          low: 10,
          high: 12,
          averagePrice: 11,
          turnoverRate: 10,
          adjFactor: null,
        }),
      ],
      decayCoefficient: 1,
    });

    expect(missingTurnover).toMatchObject({
      status: "unavailable",
      reason: "missing_turnover_rate",
    });
    expect(missingAdjustment).toMatchObject({
      status: "unavailable",
      reason: "missing_adjustment_factor",
    });
  });

  it("calculates different target dates without mutating shared seed levels", () => {
    const seedLevels = [{ price: 20, percent: 100 }];
    const previous = calculateDecayChipDistribution({
      tsCode: "000001.SZ",
      seedTradeDate: "20260626",
      targetTradeDate: "20260627",
      seedLevels,
      bars: [
        modelBar({
          tradeDate: "20260627",
          low: 10,
          high: 12,
          averagePrice: 11,
          turnoverRate: 10,
        }),
      ],
      decayCoefficient: 1,
    });
    const latest = calculateDecayChipDistribution({
      tsCode: "000001.SZ",
      seedTradeDate: "20260626",
      targetTradeDate: "20260629",
      seedLevels,
      bars: [
        modelBar({
          tradeDate: "20260627",
          low: 10,
          high: 12,
          averagePrice: 11,
          turnoverRate: 10,
        }),
        modelBar({
          tradeDate: "20260629",
          low: 11,
          high: 13,
          averagePrice: 12,
          turnoverRate: 10,
        }),
      ],
      decayCoefficient: 1,
    });

    expect(previous.status).toBe("succeeded");
    expect(latest.status).toBe("succeeded");

    if (previous.status !== "succeeded" || latest.status !== "succeeded") {
      throw new Error("expected_succeeded_results");
    }

    expect(sumPercentInRange(previous.levels, 20, 20)).toBeCloseTo(90, 6);
    expect(sumPercentInRange(latest.levels, 20, 20)).toBeCloseTo(81, 6);
    expect(seedLevels).toEqual([{ price: 20, percent: 100 }]);
  });
});

function modelBar(
  overrides: {
    tradeDate?: string;
    adjFactor?: number | null;
  } & {
  low: number;
  high: number;
  averagePrice: number;
  turnoverRate: number | null;
  },
) {
  return {
    tsCode: "000001.SZ",
    tradeDate: overrides.tradeDate ?? "20260629",
    close: overrides.averagePrice,
    adjFactor: overrides.adjFactor ?? 1,
    ...overrides,
  };
}

function sumPercent(levels: { percent: number }[]) {
  return levels.reduce((sum, level) => sum + level.percent, 0);
}

function sumPercentInRange(
  levels: { price: number; percent: number }[],
  low: number,
  high: number,
) {
  return levels
    .filter((level) => level.price >= low && level.price <= high)
    .reduce((sum, level) => sum + level.percent, 0);
}
