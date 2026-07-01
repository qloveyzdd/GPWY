import { mapCyqChipsTable } from "@/lib/chip/chip-peak";
import {
  calculateDecayChipDistribution,
  CHIP_MODEL_VERSION,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
} from "@/lib/chip/chip-model";
import {
  planCalculatedChipDistributionWork,
  replaceCalculatedChipDistribution,
  replaceChipModelSeedSnapshot,
  writeCalculatedChipModelRun,
  type WriteCalculatedChipModelRunInput,
} from "@/lib/chip/chip-model-store";
import {
  readChipDistributionForDate,
  replaceChipDistribution,
} from "@/lib/chip/chip-store";
import { readTushareTokenSecret } from "@/lib/config";
import { readAdjustedChipModelBarsForStock } from "@/lib/refresh/market-data-reader";
import type {
  CalculatedChipDistributionStatus,
  CalculatedChipDistributionWorkTarget,
  CalculatedChipModelRunRecord,
  ChipCalculatedDistributionLevel,
  ChipDecayCoefficient,
  ChipModelUnavailableReason,
} from "@/lib/chip/chip-types";
import {
  readMarketAdjustmentFactors,
  readMarketGenerationDates,
} from "@/lib/refresh/market-data-store";
import {
  readLatestScreeningRun,
  readScreeningResultsForRun,
} from "@/lib/screening/screening-store";
import { classifyTushareError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import { createTushareClient } from "@/lib/tushare/provider";
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

export type RunCalculatedChipDistributionOptions = {
  client?: TushareClientLike;
  now?: Date;
  onProgress?: CalculatedChipDistributionProgressCallback;
};

export type CalculatedChipDistributionProgress = {
  totalTargets: number;
  completedTargets: number;
  succeeded: number;
  blocked: number;
  failed: number;
  missing: number;
  skippedComplete: number;
};

export type CalculatedChipDistributionProgressCallback = (
  progress: CalculatedChipDistributionProgress,
) => void;

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
const failedCategories = new Set<TushareErrorCategory>([
  "rate_limited",
  "network_or_service",
]);

type CalculatedStatusInput =
  WriteCalculatedChipModelRunInput["statuses"][number];

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

function previousTradeDate(generationId: number, latestTradeDate: string) {
  const tradeDates = readMarketGenerationDates(generationId)
    .filter(
      (record) =>
        record.dailyStatus === "succeeded" &&
        record.factorStatus === "succeeded",
    )
    .map((record) => record.tradeDate)
    .sort((left, right) => left.localeCompare(right));
  const latestIndex = tradeDates.findIndex(
    (tradeDate) => tradeDate === latestTradeDate,
  );

  if (latestIndex <= 0) {
    return null;
  }

  return tradeDates[latestIndex - 1] ?? null;
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

function createProgress(totalTargets: number): CalculatedChipDistributionProgress {
  return {
    totalTargets,
    completedTargets: 0,
    succeeded: 0,
    blocked: 0,
    failed: 0,
    missing: 0,
    skippedComplete: 0,
  };
}

function emitProgress(
  onProgress: CalculatedChipDistributionProgressCallback | undefined,
  progress: CalculatedChipDistributionProgress,
) {
  try {
    onProgress?.({ ...progress });
  } catch {
    // Progress callbacks must not change row-level calculation semantics.
  }
}

function statusForErrorCategory(
  category: TushareErrorCategory | null,
): Extract<CalculatedChipDistributionStatus, "blocked" | "failed"> {
  return category && failedCategories.has(category) ? "failed" : "blocked";
}

function recordStatus({
  statuses,
  progress,
  onProgress,
  record,
  skippedComplete = false,
}: {
  statuses: CalculatedStatusInput[];
  progress: CalculatedChipDistributionProgress;
  onProgress?: CalculatedChipDistributionProgressCallback;
  record: CalculatedStatusInput;
  skippedComplete?: boolean;
}) {
  statuses.push(record);
  progress.completedTargets += 1;

  if (record.status === "succeeded") {
    progress.succeeded += 1;
  } else if (record.status === "failed") {
    progress.failed += 1;
  } else if (record.status === "missing") {
    progress.missing += 1;
  } else {
    progress.blocked += 1;
  }

  if (skippedComplete) {
    progress.skippedComplete += 1;
  }

  emitProgress(onProgress, progress);
}

function statusRecord(
  target: CalculatedChipDistributionWorkTarget,
  status: CalculatedChipDistributionStatus,
  overrides: Partial<
    Pick<
      CalculatedStatusInput,
      "unavailableReason" | "errorCategory" | "errorSummary"
    >
  > = {},
): CalculatedStatusInput {
  return {
    ...target,
    status,
    unavailableReason: overrides.unavailableReason ?? null,
    errorCategory: overrides.errorCategory ?? null,
    errorSummary: overrides.errorSummary ?? null,
  };
}

function runStatus({
  totalTargets,
  successCount,
  blockedCount,
  failedCount,
  missingCount,
}: Pick<
  WriteCalculatedChipModelRunInput,
  | "totalTargets"
  | "successCount"
  | "blockedCount"
  | "failedCount"
  | "missingCount"
>): CalculatedChipModelRunRecord["status"] {
  if (totalTargets === 0 || successCount === totalTargets) {
    return "succeeded";
  }

  if (successCount > 0) {
    return "partial";
  }

  if (failedCount > 0) {
    return "failed";
  }

  return blockedCount > 0 || missingCount > 0 ? "blocked" : "succeeded";
}

function calculatedTargetsForLatestScreening(): {
  generationId: number | null;
  targets: CalculatedChipDistributionWorkTarget[];
} {
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    throw new Error("no_screening_results");
  }

  const generationId = screeningRun.sourceMarketGenerationId;
  const screeningResults = readScreeningResultsForRun(screeningRun.id);
  const targets: CalculatedChipDistributionWorkTarget[] = [];

  for (const result of screeningResults) {
    const baseDates =
      generationId === null
        ? {
            latest: {
              targetTradeDate: result.latestTradeDate,
              seedTradeDate: null,
            },
            previous: {
              targetTradeDate: null,
              seedTradeDate: null,
            },
          }
        : {
            latest: {
              targetTradeDate: result.latestTradeDate,
              seedTradeDate:
                resolveSeedWindow(generationId, result.latestTradeDate)
                  ?.seedTradeDate ?? null,
            },
            previous: (() => {
              const targetTradeDate = previousTradeDate(
                generationId,
                result.latestTradeDate,
              );

              return {
                targetTradeDate,
                seedTradeDate: targetTradeDate
                  ? (resolveSeedWindow(generationId, targetTradeDate)
                      ?.seedTradeDate ?? null)
                  : null,
              };
            })(),
          };

    for (const targetKind of ["latest", "previous"] as const) {
      for (const decayCoefficient of SUPPORTED_CHIP_DECAY_COEFFICIENTS) {
        targets.push({
          screeningRunId: screeningRun.id,
          tsCode: result.tsCode,
          targetKind,
          targetTradeDate: baseDates[targetKind].targetTradeDate,
          seedTradeDate: baseDates[targetKind].seedTradeDate,
          decayCoefficient,
          modelVersion: CHIP_MODEL_VERSION,
        });
      }
    }
  }

  return { generationId, targets };
}

function reasonFromReaderError(error: unknown): ChipModelUnavailableReason {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("missing_turnover_rate")) {
    return "missing_turnover_rate";
  }

  if (message.includes("missing_adjustment_factor")) {
    return "missing_adjustment_factor";
  }

  return "missing_trade_data";
}

async function calculateTarget({
  generationId,
  target,
  client,
  now,
}: {
  generationId: number;
  target: CalculatedChipDistributionWorkTarget;
  client: TushareClientLike | null;
  now: Date;
}): Promise<CalculatedStatusInput> {
  if (target.targetTradeDate === null || target.seedTradeDate === null) {
    return statusRecord(target, "missing", {
      unavailableReason: "missing_trade_data",
      errorSummary: "target_or_seed_trade_date_missing",
    });
  }

  const seed = await resolveChipModelSeedForTarget({
    generationId,
    tsCode: target.tsCode,
    targetTradeDate: target.targetTradeDate,
    modelVersion: target.modelVersion,
    client,
    now,
  });

  if (seed.status !== "succeeded") {
    const status = statusForErrorCategory(seed.errorCategory);

    return statusRecord(target, status, {
      unavailableReason: seed.reason,
      errorCategory: seed.errorCategory,
      errorSummary: seed.errorSummary ?? seed.reason,
    });
  }

  let bars;

  try {
    const startTradeDate = seed.expectedTradeDates[0];

    if (!startTradeDate) {
      return statusRecord(target, "blocked", {
        unavailableReason: "missing_trade_data",
        errorSummary: "missing_model_trade_dates",
      });
    }

    bars = readAdjustedChipModelBarsForStock({
      generationId,
      tsCode: target.tsCode,
      startTradeDate,
      endTradeDate: target.targetTradeDate,
    });
  } catch (error) {
    const reason = reasonFromReaderError(error);

    return statusRecord(target, "blocked", {
      unavailableReason: reason,
      errorSummary: reason,
    });
  }

  const result = calculateDecayChipDistribution({
    tsCode: target.tsCode,
    seedTradeDate: seed.seedTradeDate,
    targetTradeDate: target.targetTradeDate,
    seedLevels: seed.seedLevels,
    bars,
    expectedTradeDates: seed.expectedTradeDates,
    decayCoefficient: target.decayCoefficient as ChipDecayCoefficient,
    modelVersion: target.modelVersion,
  });

  if (result.status !== "succeeded") {
    return statusRecord(target, "blocked", {
      unavailableReason: result.reason,
      errorSummary: result.reason,
    });
  }

  replaceCalculatedChipDistribution({
    tsCode: target.tsCode,
    targetTradeDate: target.targetTradeDate,
    seedTradeDate: seed.seedTradeDate,
    decayCoefficient: target.decayCoefficient,
    modelVersion: target.modelVersion,
    levels: result.levels,
    now,
  });

  return statusRecord(target, "succeeded");
}

export async function runCalculatedChipDistributionIntegrationFromLatestScreening({
  client,
  now = new Date(),
  onProgress,
}: RunCalculatedChipDistributionOptions = {}): Promise<CalculatedChipModelRunRecord> {
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    throw new Error("no_screening_results");
  }

  const { generationId, targets } = calculatedTargetsForLatestScreening();
  const workPlan = planCalculatedChipDistributionWork(targets);
  const token = readTushareTokenSecret();
  const tushareClient = client ?? (token ? createTushareClient(token) : null);
  const progress = createProgress(targets.length);
  const statuses: CalculatedStatusInput[] = [];

  emitProgress(onProgress, progress);

  for (const target of workPlan.skippedCompleteTargets) {
    recordStatus({
      statuses,
      progress,
      onProgress,
      record: statusRecord(target, "succeeded"),
      skippedComplete: true,
    });
  }

  for (const target of workPlan.blockedTargets) {
    recordStatus({
      statuses,
      progress,
      onProgress,
      record: statusRecord(target, "blocked", {
        unavailableReason: "missing_trade_data",
        errorSummary: "calculated_chip_target_blocked",
      }),
    });
  }

  for (const target of workPlan.missingTargets) {
    recordStatus({
      statuses,
      progress,
      onProgress,
      record: statusRecord(target, "missing", {
        unavailableReason: "missing_trade_data",
        errorSummary: "target_or_seed_trade_date_missing",
      }),
    });
  }

  for (const target of workPlan.items) {
    const record =
      generationId === null
        ? statusRecord(target, "blocked", {
            unavailableReason: "missing_trade_data",
            errorSummary: "missing_source_market_generation",
          })
        : await calculateTarget({
            generationId,
            target,
            client: tushareClient,
            now,
          });

    recordStatus({
      statuses,
      progress,
      onProgress,
      record,
    });
  }

  const successCount = statuses.filter(
    (record) => record.status === "succeeded",
  ).length;
  const blockedCount = statuses.filter(
    (record) => record.status === "blocked",
  ).length;
  const failedCount = statuses.filter(
    (record) => record.status === "failed",
  ).length;
  const missingCount = statuses.filter(
    (record) => record.status === "missing",
  ).length;

  return writeCalculatedChipModelRun({
    screeningRunId: screeningRun.id,
    status: runStatus({
      totalTargets: targets.length,
      successCount,
      blockedCount,
      failedCount,
      missingCount,
    }),
    totalTargets: targets.length,
    successCount,
    blockedCount,
    failedCount,
    missingCount,
    skippedCompleteCount: progress.skippedComplete,
    statuses,
    now,
  });
}
