import {
  extractChipPeaks,
  mapCyqChipsTable,
} from "@/lib/chip/chip-peak";
import {
  planChipDistributionWork,
  readLatestChipDistributionStatusForTarget,
  readLatestChipDistributionDateOnOrBefore,
  replaceChipDistribution,
  writeChipDistributionRun,
  writeChipPeakRun,
  type WriteChipDistributionRunInput,
  type WriteChipPeakRunInput,
} from "@/lib/chip/chip-store";
import type {
  ChipDistributionRunRecord,
  ChipDistributionStatus,
  ChipDistributionTarget,
  ChipPeakResultRecord,
  ChipPeakResultStatus,
  ChipPeakRunRecord,
} from "@/lib/chip/chip-types";
import { readTushareTokenSecret } from "@/lib/config";
import { readAdjustedMarketBarsForStock } from "@/lib/refresh/market-data-reader";
import { readDailyBarsForRefreshJob } from "@/lib/refresh/refresh-store";
import {
  readLatestScreeningRun,
  readScreeningResultsForRun,
} from "@/lib/screening/screening-store";
import type {
  ScreeningDailyBar,
  ScreeningResultRecord,
  ScreeningRunRecord,
} from "@/lib/screening/screening-types";
import { classifyTushareError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import { createTushareClient } from "@/lib/tushare/provider";
import type {
  TushareClientLike,
  TushareErrorCategory,
} from "@/lib/tushare/types";

export type RunChipPeakIntegrationOptions = {
  client?: TushareClientLike;
  now?: Date;
  onProgress?: ChipPeakProgressCallback;
};

export type RunChipDistributionIntegrationOptions = {
  client?: TushareClientLike;
  now?: Date;
  onProgress?: ChipDistributionProgressCallback;
};

export type ChipPeakProgress = {
  total: number;
  completed: number;
  succeeded: number;
  blocked: number;
  failed: number;
};

export type ChipDistributionProgress = {
  totalTargets: number;
  completedTargets: number;
  succeeded: number;
  blocked: number;
  failed: number;
  missing: number;
  skippedComplete: number;
};

export type ChipPeakProgressCallback = (progress: ChipPeakProgress) => void;

export type ChipDistributionProgressCallback = (
  progress: ChipDistributionProgress,
) => void;

type ChipDistributionStatusInput =
  WriteChipDistributionRunInput["statuses"][number];

const failedCategories = new Set<TushareErrorCategory>([
  "rate_limited",
  "network_or_service",
]);

function resultStatusForCategory(
  category: TushareErrorCategory,
): ChipPeakResultStatus {
  return failedCategories.has(category) ? "failed" : "blocked";
}

function distributionStatusForCategory(
  category: TushareErrorCategory,
): Extract<ChipDistributionStatus, "blocked" | "failed"> {
  return failedCategories.has(category) ? "failed" : "blocked";
}

function determineRunStatus({
  totalCandidates,
  successCount,
  blockedCount,
  failedCount,
}: Pick<
  WriteChipPeakRunInput,
  "totalCandidates" | "successCount" | "blockedCount" | "failedCount"
>): ChipPeakRunRecord["status"] {
  if (totalCandidates === 0 || successCount === totalCandidates) {
    return "succeeded";
  }

  if (successCount > 0) {
    return "partial";
  }

  if (blockedCount > 0) {
    return "blocked";
  }

  return failedCount > 0 ? "failed" : "blocked";
}

function determineDistributionRunStatus({
  totalTargets,
  successCount,
  blockedCount,
  failedCount,
  missingCount,
}: Pick<
  WriteChipDistributionRunInput,
  | "totalTargets"
  | "successCount"
  | "blockedCount"
  | "failedCount"
  | "missingCount"
>): ChipDistributionRunRecord["status"] {
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

function createBlockedResult(
  screeningRunId: number,
  tsCode: string,
  error: unknown,
): Omit<ChipPeakResultRecord, "chipPeakRunId"> {
  const safeError = classifyTushareError(error, "cyq_chips");

  return {
    screeningRunId,
    tsCode,
    status: resultStatusForCategory(safeError.category),
    tradeDate: null,
    chipPeakPrice: null,
    peakPercent: null,
    source: null,
    peaks: [],
    errorCategory: safeError.category,
    errorSummary: safeError.message,
  };
}

function createDistributionStatus(
  target: ChipDistributionTarget,
  status: ChipDistributionStatus,
  overrides: Partial<
    Pick<
      ChipDistributionStatusInput,
      "source" | "errorCategory" | "errorSummary"
    >
  > = {},
): ChipDistributionStatusInput {
  return {
    screeningRunId: target.screeningRunId,
    tsCode: target.tsCode,
    targetKind: target.targetKind,
    tradeDate: target.tradeDate,
    status,
    source:
      overrides.source ??
      (status === "succeeded" ? "cyq_chips_highest_percent" : null),
    errorCategory: overrides.errorCategory ?? null,
    errorSummary: overrides.errorSummary ?? null,
  };
}

function createCachedDistributionStatus(
  target: ChipDistributionTarget,
  fallbackStatus: ChipDistributionStatus,
): ChipDistributionStatusInput {
  const cached = readLatestChipDistributionStatusForTarget(target);

  if (cached) {
    return {
      screeningRunId: target.screeningRunId,
      tsCode: target.tsCode,
      targetKind: target.targetKind,
      tradeDate: target.tradeDate,
      status: cached.status,
      source: cached.source,
      errorCategory: cached.errorCategory,
      errorSummary: cached.errorSummary,
    };
  }

  return createDistributionStatus(target, fallbackStatus, {
    source: null,
    errorCategory: fallbackStatus === "blocked" ? "unknown" : null,
    errorSummary:
      fallbackStatus === "blocked" ? "chip_distribution_target_blocked" : null,
  });
}

function emitProgress(
  onProgress: ChipPeakProgressCallback | undefined,
  progress: ChipPeakProgress,
) {
  try {
    onProgress?.({ ...progress });
  } catch {
    // Progress reporting must not change chip row-level semantics.
  }
}

function emitDistributionProgress(
  onProgress: ChipDistributionProgressCallback | undefined,
  progress: ChipDistributionProgress,
) {
  try {
    onProgress?.({ ...progress });
  } catch {
    // Progress reporting must not change chip row-level semantics.
  }
}

function readSourceBarsForScreeningResult(
  screeningRun: ScreeningRunRecord,
  screeningResult: ScreeningResultRecord,
): ScreeningDailyBar[] {
  try {
    if (screeningRun.sourceMarketGenerationId !== null) {
      return readAdjustedMarketBarsForStock(
        screeningRun.sourceMarketGenerationId,
        screeningResult.tsCode,
      );
    }

    return readDailyBarsForRefreshJob(screeningRun.sourceRefreshJobId)
      .filter((bar) => bar.tsCode === screeningResult.tsCode)
      .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate))
      .slice(-60);
  } catch {
    return [];
  }
}

function resolvePreviousTradeDate(
  bars: ScreeningDailyBar[],
  latestTradeDate: string,
) {
  const sortedBars = [...bars].sort((left, right) =>
    left.tradeDate.localeCompare(right.tradeDate),
  );
  const latestIndex = sortedBars.findIndex(
    (bar) => bar.tradeDate === latestTradeDate,
  );

  if (latestIndex <= 0) {
    return null;
  }

  return sortedBars[latestIndex - 1]?.tradeDate ?? null;
}

function resolveChipDistributionTargets(
  screeningRun: ScreeningRunRecord,
  screeningResults: ScreeningResultRecord[],
): ChipDistributionTarget[] {
  return screeningResults.flatMap((screeningResult) => {
    const bars = readSourceBarsForScreeningResult(screeningRun, screeningResult);
    const previousTradeDate = resolvePreviousTradeDate(
      bars,
      screeningResult.latestTradeDate,
    );

    return [
      {
        screeningRunId: screeningRun.id,
        tsCode: screeningResult.tsCode,
        targetKind: "latest",
        tradeDate: screeningResult.latestTradeDate,
      },
      {
        screeningRunId: screeningRun.id,
        tsCode: screeningResult.tsCode,
        targetKind: "previous",
        tradeDate: previousTradeDate,
      },
    ];
  });
}

export function resolveChipDistributionTargetsForLatestScreening() {
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    throw new Error("no_screening_results");
  }

  return resolveChipDistributionTargets(
    screeningRun,
    readScreeningResultsForRun(screeningRun.id),
  );
}

function groupTargetsByStock<T extends Pick<ChipDistributionTarget, "tsCode">>(
  targets: T[],
) {
  const grouped = new Map<string, T[]>();

  for (const target of targets) {
    const existing = grouped.get(target.tsCode) ?? [];
    existing.push(target);
    grouped.set(target.tsCode, existing);
  }

  return grouped;
}

function recordDistributionStatus(
  statusRecords: ChipDistributionStatusInput[],
  progress: ChipDistributionProgress,
  onProgress: ChipDistributionProgressCallback | undefined,
  record: ChipDistributionStatusInput,
  { skippedComplete = false }: { skippedComplete?: boolean } = {},
) {
  statusRecords.push(record);
  progress.completedTargets += 1;

  if (record.status === "succeeded") {
    progress.succeeded += 1;
  } else if (record.status === "blocked") {
    progress.blocked += 1;
  } else if (record.status === "failed") {
    progress.failed += 1;
  } else {
    progress.missing += 1;
  }

  if (skippedComplete) {
    progress.skippedComplete += 1;
  }

  emitDistributionProgress(onProgress, progress);
}

function targetDates(items: ChipDistributionTarget[]) {
  return items
    .map((item) => item.tradeDate)
    .filter((tradeDate): tradeDate is string => tradeDate !== null)
    .sort((left, right) => left.localeCompare(right));
}

function groupRowsByTargetDate(
  tsCode: string,
  targetDateSet: Set<string>,
  rows: ReturnType<typeof mapCyqChipsTable>,
) {
  const rowsByDate = new Map<string, ReturnType<typeof mapCyqChipsTable>>();

  for (const row of rows) {
    if (row.tsCode !== tsCode || !targetDateSet.has(row.tradeDate)) {
      continue;
    }

    const existing = rowsByDate.get(row.tradeDate) ?? [];
    existing.push(row);
    rowsByDate.set(row.tradeDate, existing);
  }

  return rowsByDate;
}

export async function runChipDistributionIntegrationFromLatestScreening({
  client,
  now = new Date(),
  onProgress,
}: RunChipDistributionIntegrationOptions = {}): Promise<ChipDistributionRunRecord> {
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    throw new Error("no_screening_results");
  }

  const screeningResults = readScreeningResultsForRun(screeningRun.id);
  const targets = resolveChipDistributionTargets(
    screeningRun,
    screeningResults,
  );
  const workPlan = planChipDistributionWork(targets);
  const token = readTushareTokenSecret();
  const tushareClient = client ?? (token ? createTushareClient(token) : null);
  const progress: ChipDistributionProgress = {
    totalTargets: targets.length,
    completedTargets: 0,
    succeeded: 0,
    blocked: 0,
    failed: 0,
    missing: 0,
    skippedComplete: 0,
  };
  const statusRecords: ChipDistributionStatusInput[] = [];

  emitDistributionProgress(onProgress, progress);

  for (const target of workPlan.skippedCompleteTargets) {
    recordDistributionStatus(
      statusRecords,
      progress,
      onProgress,
      createCachedDistributionStatus(target, "succeeded"),
      { skippedComplete: true },
    );
  }

  for (const target of workPlan.blockedTargets) {
    recordDistributionStatus(
      statusRecords,
      progress,
      onProgress,
      createCachedDistributionStatus(target, "blocked"),
    );
  }

  for (const target of workPlan.missingTargets) {
    recordDistributionStatus(
      statusRecords,
      progress,
      onProgress,
      createDistributionStatus(target, "missing", {
        source: null,
        errorSummary: "previous_trade_date_missing",
      }),
    );
  }

  await Promise.all(
    Array.from(groupTargetsByStock(workPlan.items).entries()).map(
      async ([tsCode, stockItems]) => {
        const requestDates = targetDates(stockItems);

        if (requestDates.length === 0) {
          return;
        }

        if (!tushareClient) {
          const safeError = classifyTushareError(
            new Error("missing_config:TUSHARE_TOKEN"),
            "cyq_chips",
          );

          for (const item of stockItems) {
            recordDistributionStatus(
              statusRecords,
              progress,
              onProgress,
              createDistributionStatus(item, "blocked", {
                source: null,
                errorCategory: safeError.category,
                errorSummary: safeError.message,
              }),
            );
          }
          return;
        }

        try {
          const startDate = requestDates[0];
          const endDate = requestDates.at(-1);

          if (!startDate || !endDate) {
            return;
          }

          const table = await tushareClient.query(
            TUSHARE_ENDPOINTS.chipChips,
            {
              ts_code: tsCode,
              start_date: startDate,
              end_date: endDate,
            },
            { priority: "chip" },
          );
          const targetDateSet = new Set(requestDates);
          const rowsByDate = groupRowsByTargetDate(
            tsCode,
            targetDateSet,
            mapCyqChipsTable(table),
          );

          for (const item of stockItems) {
            if (item.tradeDate === null) {
              continue;
            }

            const rows = rowsByDate.get(item.tradeDate) ?? [];

            if (rows.length === 0) {
              const fallbackTradeDate =
                readLatestChipDistributionDateOnOrBefore(
                  item.tsCode,
                  item.tradeDate,
                );

              if (fallbackTradeDate) {
                recordDistributionStatus(
                  statusRecords,
                  progress,
                  onProgress,
                  createDistributionStatus(
                    {
                      ...item,
                      tradeDate: fallbackTradeDate,
                    },
                    "succeeded",
                  ),
                );
                continue;
              }

              recordDistributionStatus(
                statusRecords,
                progress,
                onProgress,
                createDistributionStatus(item, "blocked", {
                  source: null,
                  errorCategory: "empty_data",
                  errorSummary:
                    "cyq_chips returned no distribution rows for target trade date",
                }),
              );
              continue;
            }

            replaceChipDistribution({
              tsCode: item.tsCode,
              tradeDate: item.tradeDate,
              levels: rows,
              now,
            });
            recordDistributionStatus(
              statusRecords,
              progress,
              onProgress,
              createDistributionStatus(item, "succeeded"),
            );
          }
        } catch (error) {
          const safeError = classifyTushareError(error, "cyq_chips");
          const status = distributionStatusForCategory(safeError.category);

          for (const item of stockItems) {
            recordDistributionStatus(
              statusRecords,
              progress,
              onProgress,
              createDistributionStatus(item, status, {
                source: null,
                errorCategory: safeError.category,
                errorSummary: safeError.message,
              }),
            );
          }
        }
      },
    ),
  );

  const successCount = statusRecords.filter(
    (record) => record.status === "succeeded",
  ).length;
  const blockedCount = statusRecords.filter(
    (record) => record.status === "blocked",
  ).length;
  const failedCount = statusRecords.filter(
    (record) => record.status === "failed",
  ).length;
  const missingCount = statusRecords.filter(
    (record) => record.status === "missing",
  ).length;

  return writeChipDistributionRun({
    screeningRunId: screeningRun.id,
    status: determineDistributionRunStatus({
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
    statuses: statusRecords,
    now,
  });
}

export async function runChipPeakIntegrationFromLatestScreening({
  client,
  now = new Date(),
  onProgress,
}: RunChipPeakIntegrationOptions = {}): Promise<ChipPeakRunRecord> {
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    throw new Error("no_screening_results");
  }

  const screeningResults = readScreeningResultsForRun(screeningRun.id);
  const token = readTushareTokenSecret();
  const tushareClient = client ?? (token ? createTushareClient(token) : null);
  const progress: ChipPeakProgress = {
    total: screeningResults.length,
    completed: 0,
    succeeded: 0,
    blocked: 0,
    failed: 0,
  };

  emitProgress(onProgress, progress);

  const results = await Promise.all(
    screeningResults.map(async (screeningResult) => {
      let result: Omit<ChipPeakResultRecord, "chipPeakRunId">;

      if (!tushareClient) {
        result = createBlockedResult(
          screeningRun.id,
          screeningResult.tsCode,
          new Error("missing_config:TUSHARE_TOKEN"),
        );
      } else {
        try {
          const table = await tushareClient.query(
            TUSHARE_ENDPOINTS.chipChips,
            {
              ts_code: screeningResult.tsCode,
              trade_date: screeningResult.latestTradeDate,
            },
            { priority: "chip" },
          );
          const rows = mapCyqChipsTable(table);
          const peaks = extractChipPeaks(rows);
          const peak = peaks[0];

          result = {
            screeningRunId: screeningRun.id,
            tsCode: screeningResult.tsCode,
            status: "succeeded",
            tradeDate: peak.tradeDate,
            chipPeakPrice: peak.price,
            peakPercent: peak.percent,
            source: "cyq_chips_highest_percent",
            peaks,
            errorCategory: null,
            errorSummary: null,
          } satisfies Omit<ChipPeakResultRecord, "chipPeakRunId">;
        } catch (error) {
          result = createBlockedResult(
            screeningRun.id,
            screeningResult.tsCode,
            error,
          );
        }
      }

      progress.completed += 1;

      if (result.status === "succeeded") {
        progress.succeeded += 1;
      } else if (result.status === "blocked") {
        progress.blocked += 1;
      } else {
        progress.failed += 1;
      }

      emitProgress(onProgress, progress);

      return result;
    }),
  );

  const successCount = results.filter(
    (result) => result.status === "succeeded",
  ).length;
  const blockedCount = results.filter(
    (result) => result.status === "blocked",
  ).length;
  const failedCount = results.filter(
    (result) => result.status === "failed",
  ).length;
  const totalCandidates = screeningResults.length;

  return writeChipPeakRun({
    screeningRunId: screeningRun.id,
    status: determineRunStatus({
      totalCandidates,
      successCount,
      blockedCount,
      failedCount,
    }),
    totalCandidates,
    successCount,
    blockedCount,
    failedCount,
    results,
    now,
  });
}
