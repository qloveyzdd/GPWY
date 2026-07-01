import {
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
  type ApplyChipDecayDayInput,
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
  ApplyChipDecayDayInput,
  ChipCalculatedDistributionLevel,
  ChipDecayCoefficient,
  ChipDecayModelInput,
  ChipDecayModelResult,
};

const PERCENT_TOTAL = 100;
const EPSILON = 1e-9;
const DEFAULT_TRIANGLE_LEVEL_COUNT = 121;
const MAX_TRIANGLE_LEVEL_COUNT = 241;
const PRICE_PRECISION = 10_000;

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

  let levels = normalizeLevels(input.seedLevels);

  if (levels.length === 0) {
    return {
      ...baseResult,
      status: "unavailable",
      reason: "missing_seed_distribution",
    };
  }

  if (input.targetTradeDate === input.seedTradeDate) {
    return {
      ...baseResult,
      status: "succeeded",
      levels,
    };
  }

  const modelBars = input.bars
    .filter(
      (bar) =>
        bar.tradeDate.localeCompare(input.seedTradeDate) > 0 &&
        bar.tradeDate.localeCompare(input.targetTradeDate) <= 0,
    )
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));

  if (!modelBars.some((bar) => bar.tradeDate === input.targetTradeDate)) {
    return {
      ...baseResult,
      status: "unavailable",
      reason: "missing_trade_data",
    };
  }

  const invalidAdjustment = modelBars.some(
    (bar) =>
      bar.adjFactor === null ||
      bar.adjFactor === undefined ||
      !Number.isFinite(bar.adjFactor) ||
      bar.adjFactor <= 0,
  );

  if (invalidAdjustment) {
    return {
      ...baseResult,
      status: "unavailable",
      reason: "missing_adjustment_factor",
    };
  }

  const invalidTurnover = modelBars.some(
    (bar) =>
      bar.turnoverRate === null ||
      !Number.isFinite(bar.turnoverRate) ||
      bar.turnoverRate < 0,
  );

  if (invalidTurnover) {
    return {
      ...baseResult,
      status: "unavailable",
      reason: "missing_turnover_rate",
    };
  }

  for (const bar of modelBars) {
    levels = applyChipDecayDay({
      levels,
      bar,
      decayCoefficient,
    });
  }

  return {
    ...baseResult,
    status: "succeeded",
    levels,
  };
}

export function applyChipDecayDay(
  input: ApplyChipDecayDayInput,
): ChipCalculatedDistributionLevel[] {
  const normalizedLevels = normalizeLevels(input.levels);

  if (normalizedLevels.length === 0) {
    return [];
  }

  const decayRate = clamp(
    ((input.bar.turnoverRate ?? 0) / 100) * input.decayCoefficient,
    0,
    1,
  );
  const retainedLevels = normalizedLevels.map((level) => ({
    price: level.price,
    percent: level.percent * (1 - decayRate),
  }));
  const retainedPercent = retainedLevels.reduce(
    (sum, level) => sum + level.percent,
    0,
  );
  const decayedPercent = Math.max(0, PERCENT_TOTAL - retainedPercent);

  if (decayedPercent <= EPSILON) {
    return normalizeLevels(retainedLevels);
  }

  return normalizeLevels([
    ...retainedLevels,
    ...buildTriangleDistribution(input.bar, decayedPercent),
  ]);
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

function buildTriangleDistribution(
  bar: ApplyChipDecayDayInput["bar"],
  totalPercent: number,
): ChipCalculatedDistributionLevel[] {
  const low = Math.min(bar.low, bar.high);
  const high = Math.max(bar.low, bar.high);

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return [];
  }

  if (Math.abs(high - low) <= EPSILON) {
    return [{ price: roundPrice(low), percent: totalPercent }];
  }

  const center = clamp(
    Number.isFinite(bar.averagePrice) ? bar.averagePrice : bar.close,
    low,
    high,
  );
  const levelCount = clampInteger(
    Math.min(DEFAULT_TRIANGLE_LEVEL_COUNT, MAX_TRIANGLE_LEVEL_COUNT),
    2,
    MAX_TRIANGLE_LEVEL_COUNT,
  );
  const step = (high - low) / (levelCount - 1);
  const rawLevels: Array<ChipCalculatedDistributionLevel & { weight: number }> =
    [];

  for (let index = 0; index < levelCount; index += 1) {
    const price = index === levelCount - 1 ? high : low + step * index;
    const weight = triangleWeight(price, low, high, center);

    if (weight > EPSILON) {
      rawLevels.push({
        price: roundPrice(price),
        percent: 0,
        weight,
      });
    }
  }

  if (rawLevels.length === 0) {
    return [{ price: roundPrice(center), percent: totalPercent }];
  }

  const totalWeight = rawLevels.reduce((sum, level) => sum + level.weight, 0);

  return rawLevels.map((level) => ({
    price: level.price,
    percent: (level.weight / totalWeight) * totalPercent,
  }));
}

function triangleWeight(price: number, low: number, high: number, center: number) {
  if (Math.abs(price - center) <= EPSILON) {
    return 1;
  }

  if (price < center) {
    const leftSpan = center - low;

    if (leftSpan <= EPSILON) {
      return (high - price) / (high - low);
    }

    return (price - low) / leftSpan;
  }

  const rightSpan = high - center;

  if (rightSpan <= EPSILON) {
    return (price - low) / (high - low);
  }

  return (high - price) / rightSpan;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampInteger(value: number, min: number, max: number) {
  return Math.trunc(clamp(value, min, max));
}

function roundPrice(price: number) {
  return Math.round(price * PRICE_PRECISION) / PRICE_PRECISION;
}
