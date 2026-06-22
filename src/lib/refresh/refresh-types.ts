export type RefreshJobStatus = "running" | "succeeded" | "failed";

export type RefreshJob = {
  id: number;
  status: RefreshJobStatus;
  startedAt: string;
  finishedAt: string | null;
  totalStocks: number;
  successCount: number;
  failedCount: number;
  errorSummary: string | null;
};

export type RefreshStartResult = {
  started: boolean;
  job: RefreshJob;
};

export type RefreshStatusSnapshot = {
  activeJob: RefreshJob | null;
  latestJob: RefreshJob | null;
  latestSuccessfulJob: RefreshJob | null;
  isRunning: boolean;
  lastSuccessfulFinishedAt: string | null;
};

export const EMPTY_REFRESH_STATUS: RefreshStatusSnapshot = {
  activeJob: null,
  latestJob: null,
  latestSuccessfulJob: null,
  isRunning: false,
  lastSuccessfulFinishedAt: null,
};

export type StockBasicRecord = {
  tsCode: string;
  name: string;
  market: string | null;
  listStatus: string | null;
};

export type DailyBarRecord = {
  tsCode: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
};
