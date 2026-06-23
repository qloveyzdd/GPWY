import {
  extractChipPeak,
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
  readLatestScreeningResults,
  readLatestScreeningRun,
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
};

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
    errorCategory: safeError.category,
    errorSummary: safeError.message,
  };
}

export async function runChipPeakIntegrationFromLatestScreening({
  client,
  now = new Date(),
}: RunChipPeakIntegrationOptions = {}): Promise<ChipPeakRunRecord> {
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    throw new Error("no_screening_results");
  }

  const screeningResults = readLatestScreeningResults();
  const token = readTushareTokenSecret();
  const tushareClient = client ?? (token ? createTushareClient(token) : null);
  const results: Omit<ChipPeakResultRecord, "chipPeakRunId">[] = [];

  for (const screeningResult of screeningResults) {
    if (!tushareClient) {
      results.push(
        createBlockedResult(
          screeningRun.id,
          screeningResult.tsCode,
          new Error("missing_config:TUSHARE_TOKEN"),
        ),
      );
      continue;
    }

    try {
      const table = await tushareClient.query(TUSHARE_ENDPOINTS.chipChips, {
        ts_code: screeningResult.tsCode,
        trade_date: screeningResult.latestTradeDate,
      });
      const peak = extractChipPeak(mapCyqChipsTable(table));

      results.push({
        screeningRunId: screeningRun.id,
        tsCode: screeningResult.tsCode,
        status: "succeeded",
        tradeDate: peak.tradeDate,
        chipPeakPrice: peak.chipPeakPrice,
        peakPercent: peak.peakPercent,
        source: peak.source,
        errorCategory: null,
        errorSummary: null,
      });
    } catch (error) {
      results.push(
        createBlockedResult(screeningRun.id, screeningResult.tsCode, error),
      );
    }
  }

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
