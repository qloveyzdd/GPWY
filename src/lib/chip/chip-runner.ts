import {
  extractChipPeaks,
  mapCyqChipsTable,
} from "@/lib/chip/chip-peak";
import {
  writeChipPeakRun,
  type WriteChipPeakRunInput,
} from "@/lib/chip/chip-store";
import type {
  ChipPeakResultRecord,
  ChipPeakRunRecord,
  ChipPeakResultStatus,
} from "@/lib/chip/chip-types";
import { readTushareTokenSecret } from "@/lib/config";
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

export type RunChipPeakIntegrationOptions = {
  client?: TushareClientLike;
  now?: Date;
  onProgress?: ChipPeakProgressCallback;
};

export type ChipPeakProgress = {
  total: number;
  completed: number;
  succeeded: number;
  blocked: number;
  failed: number;
};

export type ChipPeakProgressCallback = (progress: ChipPeakProgress) => void;

const failedCategories = new Set<TushareErrorCategory>([
  "rate_limited",
  "network_or_service",
]);

function resultStatusForCategory(
  category: TushareErrorCategory,
): ChipPeakResultStatus {
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
