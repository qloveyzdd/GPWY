import {
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
  type ChipCalculatedDistributionLevel,
  type ChipDecayCoefficient,
  type ChipDecayModelInput,
  type ChipDecayModelResult,
} from "@/lib/chip/chip-types";

export {
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
};

export type {
  ChipCalculatedDistributionLevel,
  ChipDecayCoefficient,
  ChipDecayModelInput,
  ChipDecayModelResult,
};

const PERCENT_TOTAL = 100;
const EPSILON = 1e-9;

export function parseChipDecayCoefficient(
  value: unknown,
): ChipDecayCoefficient {
  const numericValue =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : value;

  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    throw new Error("invalid_chip_decay_coefficient");
  }

  const supported = SUPPORTED_CHIP_DECAY_COEFFICIENTS.find(
    (coefficient) => Math.abs(coefficient - numericValue) < EPSILON,
  );

  if (supported === undefined) {
    throw new Error("invalid_chip_decay_coefficient");
  }

  return supported;
}

export function calculateDecayChipDistribution(
  input: ChipDecayModelInput,
): ChipDecayModelResult {
  const decayCoefficient =
    input.decayCoefficient ?? DEFAULT_CHIP_DECAY_COEFFICIENT;
  const modelVersion = input.modelVersion ?? CHIP_MODEL_VERSION;
  const baseResult = {
    tsCode: input.tsCode,
    source: "calculated_decay_model" as const,
    modelVersion,
    decayCoefficient,
    seedTradeDate: input.seedTradeDate,
    targetTradeDate: input.targetTradeDate,
  };

  if (input.seedLevels.length === 0) {
    return {
      ...baseResult,
      status: "unavailable",
      reason: "missing_seed_distribution",
    };
  }

  if (input.targetTradeDate.localeCompare(input.seedTradeDate) < 0) {
    return {
      ...baseResult,
      status: "unavailable",
      reason: "invalid_trade_date_range",
    };
  }

  const levels = normalizeLevels(input.seedLevels);

  if (input.targetTradeDate === input.seedTradeDate) {
    return {
      ...baseResult,
      status: "succeeded",
      levels,
    };
  }

  return {
    ...baseResult,
    status: "unavailable",
    reason: "missing_trade_data",
  };
}

function normalizeLevels(
  levels: ChipCalculatedDistributionLevel[],
): ChipCalculatedDistributionLevel[] {
  const grouped = new Map<number, number>();

  for (const level of levels) {
    if (
      !Number.isFinite(level.price) ||
      !Number.isFinite(level.percent) ||
      level.percent <= 0
    ) {
      continue;
    }

    grouped.set(level.price, (grouped.get(level.price) ?? 0) + level.percent);
  }

  const total = Array.from(grouped.values()).reduce(
    (sum, percent) => sum + percent,
    0,
  );

  if (total <= 0) {
    return [];
  }

  return Array.from(grouped.entries())
    .map(([price, percent]) => ({
      price,
      percent: (percent / total) * PERCENT_TOTAL,
    }))
    .sort((left, right) => left.price - right.price);
}
