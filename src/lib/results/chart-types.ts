import type { TushareErrorCategory } from "@/lib/tushare/types";
import type { ResultRow, ResultsUnavailableReason } from "@/lib/results/results-types";
import type {
  ChipDecayCoefficient,
  ChipModelUnavailableReason,
  CHIP_MODEL_VERSION,
} from "@/lib/chip/chip-types";

export type ChartSnapshotStatus = "ready" | "not_found" | "unavailable";

export type ChartUnavailableReason =
  | ResultsUnavailableReason
  | "stock_not_in_latest_results";

export type ChartDailyBar = {
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
};

export type ChartMovingAveragePoint = {
  tradeDate: string;
  value: number;
};

export type ChartChipDistributionTargetKind = "previous" | "latest";

export type ChartChipDistributionStatus =
  | "succeeded"
  | "blocked"
  | "failed"
  | "missing";

export type ChartChipDistributionLevel = {
  price: number;
  percent: number;
};

export type ChartChipDistributionPanel = {
  targetKind: ChartChipDistributionTargetKind;
  label: string;
  tradeDate: string | null;
  status: ChartChipDistributionStatus;
  levels: ChartChipDistributionLevel[];
  maxLevel: ChartChipDistributionLevel | null;
  errorCategory: TushareErrorCategory | null;
  errorSummary: string | null;
};

export type ChartChipDistributionScale = {
  priceLevels: number[];
  maxPercent: number;
};

export type ChartChipDistributions = {
  previous: ChartChipDistributionPanel;
  latest: ChartChipDistributionPanel;
  scale: ChartChipDistributionScale;
};

export type ChartCalculatedChipDistributionPanel = {
  targetKind: ChartChipDistributionTargetKind;
  label: string;
  targetTradeDate: string | null;
  seedTradeDate: string | null;
  status: ChartChipDistributionStatus;
  decayCoefficient: ChipDecayCoefficient;
  modelVersion: typeof CHIP_MODEL_VERSION;
  levels: ChartChipDistributionLevel[];
  maxLevel: ChartChipDistributionLevel | null;
  unavailableReason: ChipModelUnavailableReason | null;
  errorCategory: TushareErrorCategory | null;
  errorSummary: string | null;
};

export type ChartCalculatedChipDistributionSet = {
  decayCoefficient: ChipDecayCoefficient;
  previous: ChartCalculatedChipDistributionPanel;
  latest: ChartCalculatedChipDistributionPanel;
  scale: ChartChipDistributionScale;
};

export type ChartCalculatedChipDistributions = {
  defaultDecayCoefficient: ChipDecayCoefficient;
  coefficients: ChipDecayCoefficient[];
  byCoefficient: Record<string, ChartCalculatedChipDistributionSet>;
};

export type ChartOverlays = {
  intervalHighPrice: number;
  intervalHighTradeDate: string;
  threshold85Price: number;
};

export type ReadyChartSnapshot = {
  status: "ready";
  unavailableReason: null;
  row: ResultRow;
  bars: ChartDailyBar[];
  ma20Series: ChartMovingAveragePoint[];
  ma60Series: ChartMovingAveragePoint[];
  overlays: ChartOverlays;
  chipDistributions: ChartChipDistributions;
  calculatedChipDistributions: ChartCalculatedChipDistributions;
};

export type UnavailableChartSnapshot = {
  status: "unavailable";
  unavailableReason: ChartUnavailableReason;
  row: null;
  bars: [];
  ma20Series: [];
  ma60Series: [];
  overlays: null;
};

export type NotFoundChartSnapshot = {
  status: "not_found";
  unavailableReason: "stock_not_in_latest_results";
  row: null;
  bars: [];
  ma20Series: [];
  ma60Series: [];
  overlays: null;
};

export type ChartSnapshot =
  | ReadyChartSnapshot
  | UnavailableChartSnapshot
  | NotFoundChartSnapshot;
