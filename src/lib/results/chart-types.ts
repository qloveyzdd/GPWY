import type { ResultRow, ResultsUnavailableReason } from "@/lib/results/results-types";

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

export type ChartOverlays = {
  intervalHighPrice: number;
  intervalHighTradeDate: string;
  threshold85Price: number;
  chipPeaks: ResultRow["chipPeaks"];
  chipPeakState: ResultRow["chipPeakState"];
};

export type ReadyChartSnapshot = {
  status: "ready";
  unavailableReason: null;
  row: ResultRow;
  bars: ChartDailyBar[];
  ma20Series: ChartMovingAveragePoint[];
  ma60Series: ChartMovingAveragePoint[];
  overlays: ChartOverlays;
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
