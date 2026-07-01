import type { TushareErrorCategory } from "@/lib/tushare/types";

export type ChipDistributionRow = {
  tsCode: string;
  tradeDate: string;
  price: number;
  percent: number;
};

export type ChipDistributionLevel = ChipDistributionRow;

export type ChipDistributionTargetKind = "latest" | "previous";

export const CHIP_MODEL_VERSION = "decay-triangle-v1" as const;

export const SUPPORTED_CHIP_DECAY_COEFFICIENTS = [
  0.3, 0.5, 0.8, 1, 1.2, 1.5, 2,
] as const;

export const DEFAULT_CHIP_DECAY_COEFFICIENT = 0.5 as const;

export type ChipDecayCoefficient =
  (typeof SUPPORTED_CHIP_DECAY_COEFFICIENTS)[number];

export type ChipCalculatedDistributionSource = "calculated_decay_model";

export type ChipCalculatedDistributionLevel = {
  price: number;
  percent: number;
};

export type ChipDecayModelBar = {
  tsCode: string;
  tradeDate: string;
  low: number;
  high: number;
  close: number;
  averagePrice: number;
  turnoverRate: number | null;
};

export type ApplyChipDecayDayInput = {
  levels: ChipCalculatedDistributionLevel[];
  bar: ChipDecayModelBar;
  decayCoefficient: ChipDecayCoefficient;
};

export type ChipModelUnavailableReason =
  | "missing_seed_distribution"
  | "missing_trade_data"
  | "missing_turnover_rate"
  | "missing_adjustment_factor"
  | "invalid_trade_date_range";

export type ChipDecayModelInput = {
  tsCode: string;
  seedTradeDate: string;
  targetTradeDate: string;
  seedLevels: ChipCalculatedDistributionLevel[];
  bars: ChipDecayModelBar[];
  decayCoefficient?: ChipDecayCoefficient;
  modelVersion?: typeof CHIP_MODEL_VERSION;
};

export type ChipDecayModelSucceededResult = {
  status: "succeeded";
  tsCode: string;
  source: ChipCalculatedDistributionSource;
  modelVersion: typeof CHIP_MODEL_VERSION;
  decayCoefficient: ChipDecayCoefficient;
  seedTradeDate: string;
  targetTradeDate: string;
  levels: ChipCalculatedDistributionLevel[];
};

export type ChipDecayModelUnavailableResult = {
  status: "unavailable";
  tsCode: string;
  source: ChipCalculatedDistributionSource;
  modelVersion: typeof CHIP_MODEL_VERSION;
  decayCoefficient: ChipDecayCoefficient;
  seedTradeDate: string;
  targetTradeDate: string;
  reason: ChipModelUnavailableReason;
};

export type ChipDecayModelResult =
  | ChipDecayModelSucceededResult
  | ChipDecayModelUnavailableResult;

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
