import { mapCyqChipsTable } from "@/lib/chip/chip-peak";
import { replaceChipModelSeedSnapshot } from "@/lib/chip/chip-model-store";
import { readChipDistributionForDate, replaceChipDistribution } from "@/lib/chip/chip-store";
import type {
  ChipCalculatedDistributionLevel,
  ChipModelUnavailableReason,
} from "@/lib/chip/chip-types";
import {
  readMarketAdjustmentFactors,
  readMarketGenerationDates,
} from "@/lib/refresh/market-data-store";
import { classifyTushareError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  TushareClientLike,
  TushareErrorCategory,
} from "@/lib/tushare/types";

export type ResolveChipModelSeedInput = {
  generationId: number;
  tsCode: string;
  targetTradeDate: string;
  modelVersion: "decay-triangle-v1";
  client?: TushareClientLike | null;
  now?: Date;
};

export type ResolvedChipModelSeed =
  | {
      status: "succeeded";
      tsCode: string;
      targetTradeDate: string;
      seedTradeDate: string;
      expectedTradeDates: string[];
      seedLevels: ChipCalculatedDistributionLevel[];
    }
  | {
      status: "unavailable";
      tsCode: string;
      targetTradeDate: string;
      seedTradeDate: string | null;
      reason: ChipModelUnavailableReason;
      errorCategory: TushareErrorCategory | null;
      errorSummary: string | null;
    };

const SEED_LOOKBACK_TRADING_DAYS = 60;

function unavailableSeedResult({
  input,
  seedTradeDate,
  reason,
  errorCategory = null,
  errorSummary = null,
}: {
  input: ResolveChipModelSeedInput;
  seedTradeDate: string | null;
  reason: ChipModelUnavailableReason;
  errorCategory?: TushareErrorCategory | null;
  errorSummary?: string | null;
}): ResolvedChipModelSeed {
  return {
    status: "unavailable",
    tsCode: input.tsCode,
    targetTradeDate: input.targetTradeDate,
    seedTradeDate,
    reason,
    errorCategory,
    errorSummary,
  };
}

function resolveSeedWindow(generationId: number, targetTradeDate: string) {
  const tradeDates = readMarketGenerationDates(generationId)
    .filter(
      (record) =>
        record.dailyStatus === "succeeded" &&
        record.factorStatus === "succeeded",
    )
    .map((record) => record.tradeDate)
    .sort((left, right) => left.localeCompare(right));
  const targetIndex = tradeDates.findIndex(
    (tradeDate) => tradeDate === targetTradeDate,
  );

  if (targetIndex < SEED_LOOKBACK_TRADING_DAYS) {
    return null;
  }

  const seedIndex = targetIndex - SEED_LOOKBACK_TRADING_DAYS;

  return {
    seedTradeDate: tradeDates[seedIndex],
    expectedTradeDates: tradeDates.slice(seedIndex + 1, targetIndex + 1),
  };
}

async function readOrFetchOfficialSeedLevels({
  input,
  seedTradeDate,
}: {
  input: ResolveChipModelSeedInput;
  seedTradeDate: string;
}): Promise<
  | { status: "succeeded"; levels: ChipCalculatedDistributionLevel[] }
  | {
      status: "unavailable";
      errorCategory: TushareErrorCategory | null;
      errorSummary: string | null;
    }
> {
  const cachedLevels = readChipDistributionForDate(input.tsCode, seedTradeDate);

  if (cachedLevels.length > 0) {
    return { status: "succeeded", levels: cachedLevels };
  }

  if (!input.client) {
    const safeError = classifyTushareError(
      new Error("missing_config:TUSHARE_TOKEN"),
      "cyq_chips",
    );

    return {
      status: "unavailable",
      errorCategory: safeError.category,
      errorSummary: safeError.message,
    };
  }

  try {
    const table = await input.client.query(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: input.tsCode,
        trade_date: seedTradeDate,
      },
      { priority: "chip" },
    );
    const rows = mapCyqChipsTable(table).filter(
      (row) => row.tsCode === input.tsCode && row.tradeDate === seedTradeDate,
    );

    if (rows.length === 0) {
      return {
        status: "unavailable",
        errorCategory: "empty_data",
        errorSummary: "missing_seed_distribution",
      };
    }

    replaceChipDistribution({
      tsCode: input.tsCode,
      tradeDate: seedTradeDate,
      levels: rows,
      now: input.now,
    });

    return { status: "succeeded", levels: rows };
  } catch (error) {
    const safeError = classifyTushareError(error, "cyq_chips");

    return {
      status: "unavailable",
      errorCategory: safeError.category,
      errorSummary: safeError.message,
    };
  }
}

function readAdjustmentFactor(
  generationId: number,
  tsCode: string,
  tradeDate: string,
) {
  return readMarketAdjustmentFactors(generationId).find(
    (record) => record.tsCode === tsCode && record.tradeDate === tradeDate,
  )?.adjFactor;
}

function adjustSeedLevelsToTargetPriceScale({
  generationId,
  tsCode,
  seedTradeDate,
  targetTradeDate,
  levels,
}: {
  generationId: number;
  tsCode: string;
  seedTradeDate: string;
  targetTradeDate: string;
  levels: ChipCalculatedDistributionLevel[];
}) {
  const seedFactor = readAdjustmentFactor(generationId, tsCode, seedTradeDate);
  const targetFactor = readAdjustmentFactor(
    generationId,
    tsCode,
    targetTradeDate,
  );

  if (
    seedFactor === undefined ||
    targetFactor === undefined ||
    seedFactor <= 0 ||
    targetFactor <= 0
  ) {
    return null;
  }

  const ratio = seedFactor / targetFactor;

  return levels
    .map((level) => ({
      price: level.price * ratio,
      percent: level.percent,
    }))
    .sort((left, right) => left.price - right.price);
}

export async function resolveChipModelSeedForTarget(
  input: ResolveChipModelSeedInput,
): Promise<ResolvedChipModelSeed> {
  const seedWindow = resolveSeedWindow(input.generationId, input.targetTradeDate);

  if (!seedWindow) {
    return unavailableSeedResult({
      input,
      seedTradeDate: null,
      reason: "missing_trade_data",
      errorSummary: "insufficient_generation_trade_dates_for_seed",
    });
  }

  const officialSeed = await readOrFetchOfficialSeedLevels({
    input,
    seedTradeDate: seedWindow.seedTradeDate,
  });

  if (officialSeed.status !== "succeeded") {
    return unavailableSeedResult({
      input,
      seedTradeDate: seedWindow.seedTradeDate,
      reason: "missing_seed_distribution",
      errorCategory: officialSeed.errorCategory,
      errorSummary: officialSeed.errorSummary,
    });
  }

  const seedLevels = adjustSeedLevelsToTargetPriceScale({
    generationId: input.generationId,
    tsCode: input.tsCode,
    seedTradeDate: seedWindow.seedTradeDate,
    targetTradeDate: input.targetTradeDate,
    levels: officialSeed.levels,
  });

  if (seedLevels === null) {
    return unavailableSeedResult({
      input,
      seedTradeDate: seedWindow.seedTradeDate,
      reason: "missing_adjustment_factor",
      errorSummary: "missing_adjustment_factor",
    });
  }

  replaceChipModelSeedSnapshot({
    tsCode: input.tsCode,
    targetTradeDate: input.targetTradeDate,
    seedTradeDate: seedWindow.seedTradeDate,
    modelVersion: input.modelVersion,
    levels: seedLevels,
    now: input.now,
  });

  return {
    status: "succeeded",
    tsCode: input.tsCode,
    targetTradeDate: input.targetTradeDate,
    seedTradeDate: seedWindow.seedTradeDate,
    expectedTradeDates: seedWindow.expectedTradeDates,
    seedLevels,
  };
}
