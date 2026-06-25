import type { ChipPeakLevel } from "@/lib/chip/chip-types";
import type { TushareErrorCategory } from "@/lib/tushare/types";

export type ResultsSnapshotStatus = "ready" | "empty" | "unavailable";
export type ResultsCacheSource = "legacy" | "normalized" | null;

export type ResultsUnavailableReason = "no_screening_run";

export type ResultChipPeakState =
  | "available"
  | "blocked"
  | "failed"
  | "missing";

export type ResultRow = {
  tsCode: string;
  name: string;
  latestTradeDate: string;
  currentPrice: number;
  intervalHigh: number;
  intervalHighTradeDate: string;
  currentHighRatio: number;
  drawdownPct: number;
  ma20: number;
  ma60: number;
  ma20Slope: number;
  chipPeakState: ResultChipPeakState;
  chipPeakPrice: number | null;
  chipPeakTradeDate: string | null;
  chipPeakSource: string | null;
  chipPeaks: ChipPeakLevel[];
  chipPeakErrorCategory: TushareErrorCategory | null;
  chipPeakErrorSummary: string | null;
};

export type ResultsSnapshot = {
  status: ResultsSnapshotStatus;
  summary: string;
  cacheSource: ResultsCacheSource;
  sourceScreeningRunId: number | null;
  screeningCreatedAt: string | null;
  chipPeakRunId: number | null;
  unavailableReason: ResultsUnavailableReason | null;
  rows: ResultRow[];
};

export const EMPTY_RESULTS_SNAPSHOT: ResultsSnapshot = {
  status: "unavailable",
  summary: "尚未生成下降趋势筛选结果。",
  cacheSource: null,
  sourceScreeningRunId: null,
  screeningCreatedAt: null,
  chipPeakRunId: null,
  unavailableReason: "no_screening_run",
  rows: [],
};
