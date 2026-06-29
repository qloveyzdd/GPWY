import type { TushareErrorCategory } from "@/lib/tushare/types";

export type ChipDistributionRow = {
  tsCode: string;
  tradeDate: string;
  price: number;
  percent: number;
};

export type ChipDistributionLevel = ChipDistributionRow;

export type ChipDistributionTargetKind = "latest" | "previous";

export type ChipDistributionStatus =
  | "succeeded"
  | "blocked"
  | "failed"
  | "missing";

export type ChipDistributionRunStatus =
  | "succeeded"
  | "partial"
  | "blocked"
  | "failed";

export type ChipDistributionTarget = {
  screeningRunId: number;
  tsCode: string;
  targetKind: ChipDistributionTargetKind;
  tradeDate: string | null;
};

export type ChipDistributionStatusRecord = ChipDistributionTarget & {
  chipDistributionRunId: number;
  status: ChipDistributionStatus;
  source: ChipPeakExtractionSource | null;
  errorCategory: TushareErrorCategory | null;
  errorSummary: string | null;
  updatedAt: string;
};

export type ChipDistributionRunRecord = {
  id: number;
  screeningRunId: number;
  status: ChipDistributionRunStatus;
  createdAt: string;
  totalTargets: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
  missingCount: number;
  skippedCompleteCount: number;
};

export type ChipDistributionWorkItem = ChipDistributionTarget & {
  currentStatus: ChipDistributionStatus | null;
  reason: "not_seen" | "retry_failed" | "incomplete_succeeded";
};

export type ChipDistributionWorkPlan = {
  totalTargets: number;
  items: ChipDistributionWorkItem[];
  skippedCompleteTargets: ChipDistributionTarget[];
  blockedTargets: ChipDistributionTarget[];
  missingTargets: ChipDistributionTarget[];
  skippedCompleteCount: number;
  blockedCount: number;
  missingCount: number;
  failedRetryCount: number;
  pendingCount: number;
};

export type ChipPeakExtractionSource = "cyq_chips_highest_percent";

export type ChipPeakLevel = {
  rank: number;
  tradeDate: string;
  price: number;
  percent: number;
};

export type ChipPeakExtraction = {
  tsCode: string;
  tradeDate: string;
  chipPeakPrice: number;
  peakPercent: number;
  source: ChipPeakExtractionSource;
};

export type ChipPeakResultStatus =
  | "succeeded"
  | "blocked"
  | "failed"
  | "missing";

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
  peaks: ChipPeakLevel[];
  errorCategory: TushareErrorCategory | null;
  errorSummary: string | null;
};
