export type RefreshJobStatus = "running" | "succeeded" | "failed";
export type RefreshMode = "bootstrap" | "ordinary";
export type RefreshOperationStatus = "running" | "succeeded" | "failed";
export type RefreshOperationKind =
  | "manual_refresh"
  | "chip_background"
  | "full_rebuild";
export type RefreshStageKey =
  | "stock_list"
  | "market_data"
  | "screening"
  | "chip";
export type RefreshStageStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped";

export const REFRESH_STAGE_ORDER: RefreshStageKey[] = [
  "stock_list",
  "market_data",
  "screening",
  "chip",
];

export const REFRESH_STAGE_LABELS: Record<RefreshStageKey, string> = {
  stock_list: "股票列表",
  market_data: "行情/复权",
  screening: "筛选",
  chip: "筹码处理",
};

export type RefreshJob = {
  id: number;
  mode: RefreshMode;
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

export type RefreshOperation = {
  id: number;
  kind: RefreshOperationKind;
  status: RefreshOperationStatus;
  startedAt: string;
  finishedAt: string | null;
  ownerRefreshJobId: number | null;
  errorSummary: string | null;
};

export type RefreshOperationStartResult = {
  started: boolean;
  operation: RefreshOperation;
};

export type RefreshStageSnapshot = {
  stage: RefreshStageKey;
  label: string;
  status: RefreshStageStatus;
  total: number;
  completed: number;
  failed: number;
  retryCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorSummary: string | null;
};

export type RefreshOperationSnapshot = {
  activeOperation: RefreshOperation | null;
  latestOperation: RefreshOperation | null;
  stages: RefreshStageSnapshot[];
  hasActiveWork: boolean;
};

export type RefreshCacheStats = {
  stockCount: number;
  dailyBarCount: number;
};

export type RefreshStatusSnapshot = {
  activeJob: RefreshJob | null;
  latestJob: RefreshJob | null;
  latestSuccessfulJob: RefreshJob | null;
  latestCacheStats: RefreshCacheStats | null;
  activeOperation: RefreshOperation | null;
  latestOperation: RefreshOperation | null;
  stages: RefreshStageSnapshot[];
  hasActiveWork: boolean;
  resultVersion: string | null;
  chipVersion: string | null;
  isRunning: boolean;
  mode: RefreshMode | null;
  lastSuccessfulFinishedAt: string | null;
};

export const EMPTY_REFRESH_STAGES: RefreshStageSnapshot[] =
  REFRESH_STAGE_ORDER.map((stage) => ({
    stage,
    label: REFRESH_STAGE_LABELS[stage],
    status: "pending",
    total: 0,
    completed: 0,
    failed: 0,
    retryCount: 0,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    errorSummary: null,
  }));

export const EMPTY_REFRESH_STATUS: RefreshStatusSnapshot = {
  activeJob: null,
  latestJob: null,
  latestSuccessfulJob: null,
  latestCacheStats: null,
  activeOperation: null,
  latestOperation: null,
  stages: EMPTY_REFRESH_STAGES,
  hasActiveWork: false,
  resultVersion: null,
  chipVersion: null,
  isRunning: false,
  mode: null,
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
