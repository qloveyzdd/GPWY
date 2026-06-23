export type ScreeningDailyBar = {
  tsCode: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
};

export type MovingAveragePoint = {
  tradeDate: string;
  value: number;
};

export type IntervalHighSource = "swing_high" | "fallback_60d_high";

export type IntervalHigh = {
  tradeDate: string;
  price: number;
  source: IntervalHighSource;
};

export type DowntrendMatchedResult = {
  status: "matched";
  tsCode: string;
  latestTradeDate: string;
  currentPrice: number;
  intervalHigh: number;
  intervalHighTradeDate: string;
  intervalHighSource: IntervalHighSource;
  currentHighRatio: number;
  drawdownPct: number;
  ma20: number;
  ma60: number;
  ma20Slope: number;
};

export type DowntrendRejectedReason =
  | "ma20_not_below_ma60"
  | "ma20_slope_not_negative"
  | "price_above_threshold";

export type DowntrendRejectedResult = {
  status: "rejected";
  tsCode: string;
  reasons: DowntrendRejectedReason[];
  latestTradeDate: string;
  currentPrice: number;
  intervalHigh: number;
  intervalHighTradeDate: string;
  intervalHighSource: IntervalHighSource;
  currentHighRatio: number;
  drawdownPct: number;
  ma20: number;
  ma60: number;
  ma20Slope: number;
};

export type DowntrendSkippedResult = {
  status: "skipped";
  tsCode: string;
  reason: "insufficient_bars";
  availableBars: number;
};

export type DowntrendEvaluationResult =
  | DowntrendMatchedResult
  | DowntrendRejectedResult
  | DowntrendSkippedResult;

export type ScreeningRunRecord = {
  id: number;
  sourceRefreshJobId: number;
  createdAt: string;
  totalStocks: number;
  matchedCount: number;
  skippedCount: number;
};

export type ScreeningResultRecord = Omit<
  DowntrendMatchedResult,
  "status"
> & {
  screeningRunId: number;
  name: string;
};
