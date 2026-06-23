import { readLatestChipPeakResults, readLatestChipPeakRun } from "@/lib/chip/chip-store";
import type { ChipPeakResultRecord } from "@/lib/chip/chip-types";
import {
  readLatestScreeningResults,
  readLatestScreeningRun,
} from "@/lib/screening/screening-store";
import type { ScreeningResultRecord } from "@/lib/screening/screening-types";
import type {
  ResultChipPeakState,
  ResultRow,
  ResultsSnapshot,
} from "@/lib/results/results-types";

function chipState(result: ChipPeakResultRecord | undefined): ResultChipPeakState {
  if (!result) {
    return "missing";
  }

  if (result.status === "succeeded" && result.chipPeakPrice !== null) {
    return "available";
  }

  if (result.status === "blocked" || result.status === "failed") {
    return result.status;
  }

  return "missing";
}

function toRow(
  screeningResult: ScreeningResultRecord,
  chipResult: ChipPeakResultRecord | undefined,
): ResultRow {
  const state = chipState(chipResult);

  return {
    tsCode: screeningResult.tsCode,
    name: screeningResult.name,
    latestTradeDate: screeningResult.latestTradeDate,
    currentPrice: screeningResult.currentPrice,
    intervalHigh: screeningResult.intervalHigh,
    intervalHighTradeDate: screeningResult.intervalHighTradeDate,
    currentHighRatio: screeningResult.currentHighRatio,
    drawdownPct: screeningResult.drawdownPct,
    ma20: screeningResult.ma20,
    ma60: screeningResult.ma60,
    ma20Slope: screeningResult.ma20Slope,
    chipPeakState: state,
    chipPeakPrice: state === "available" ? chipResult?.chipPeakPrice ?? null : null,
    chipPeakTradeDate: chipResult?.tradeDate ?? null,
    chipPeakSource: chipResult?.source ?? null,
    chipPeakErrorCategory: chipResult?.errorCategory ?? null,
    chipPeakErrorSummary: chipResult?.errorSummary ?? null,
  };
}

function sortByDefaultOrder(rows: ResultRow[]) {
  return [...rows].sort((left, right) => {
    const ratioDiff = left.currentHighRatio - right.currentHighRatio;

    if (ratioDiff !== 0) {
      return ratioDiff;
    }

    return left.tsCode.localeCompare(right.tsCode);
  });
}

export function readLatestResultsSnapshot(): ResultsSnapshot {
  const screeningRun = readLatestScreeningRun();

  if (!screeningRun) {
    return {
      status: "unavailable",
      summary: "尚未生成下降趋势筛选结果。",
      sourceScreeningRunId: null,
      screeningCreatedAt: null,
      chipPeakRunId: null,
      unavailableReason: "no_screening_run",
      rows: [],
    };
  }

  const screeningResults = readLatestScreeningResults();

  if (screeningResults.length === 0) {
    return {
      status: "empty",
      summary: "最新筛选没有符合条件的股票。",
      sourceScreeningRunId: screeningRun.id,
      screeningCreatedAt: screeningRun.createdAt,
      chipPeakRunId: null,
      unavailableReason: null,
      rows: [],
    };
  }

  const chipPeakRun = readLatestChipPeakRun();
  const canUseChipRun = chipPeakRun?.screeningRunId === screeningRun.id;
  const chipResults = canUseChipRun ? readLatestChipPeakResults() : [];
  const chipByCode = new Map(
    chipResults.map((result) => [result.tsCode, result] as const),
  );
  const rows = sortByDefaultOrder(
    screeningResults.map((result) => toRow(result, chipByCode.get(result.tsCode))),
  );

  return {
    status: "ready",
    summary: `最新筛选命中 ${rows.length} 只股票。`,
    sourceScreeningRunId: screeningRun.id,
    screeningCreatedAt: screeningRun.createdAt,
    chipPeakRunId: canUseChipRun ? chipPeakRun.id : null,
    unavailableReason: null,
    rows,
  };
}
