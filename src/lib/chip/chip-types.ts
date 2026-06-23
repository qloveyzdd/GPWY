import type { TushareErrorCategory } from "@/lib/tushare/types";

export type ChipDistributionRow = {
  tsCode: string;
  tradeDate: string;
  price: number;
  percent: number;
};

export type ChipPeakExtractionSource = "cyq_chips_highest_percent";

export type ChipPeakExtraction = {
  tsCode: string;
  tradeDate: string;
  chipPeakPrice: number;
  peakPercent: number;
  source: ChipPeakExtractionSource;
};

export type ChipPeakResultStatus = "succeeded" | "blocked" | "failed";

export type ChipPeakRunStatus = "succeeded" | "partial" | "blocked" | "failed";

export type ChipPeakRunRecord = {
  id: number;
  screeningRunId: number;
  status: ChipPeakRunStatus;
  createdAt: string;
  totalCandidates: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
};

export type ChipPeakResultRecord = {
  chipPeakRunId: number;
  screeningRunId: number;
  tsCode: string;
  status: ChipPeakResultStatus;
  tradeDate: string | null;
  chipPeakPrice: number | null;
  peakPercent: number | null;
  source: ChipPeakExtractionSource | null;
  errorCategory: TushareErrorCategory | null;
  errorSummary: string | null;
};
