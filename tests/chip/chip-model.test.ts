// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
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
