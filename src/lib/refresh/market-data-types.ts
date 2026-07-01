export type MarketStockStatus = "L" | "P" | "D";

export type MarketStockRecord = {
  tsCode: string;
  name: string;
  market: string | null;
  listStatus: MarketStockStatus;
};

export type RawDailyQuoteRecord = {
  tsCode: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  amount?: number | null;
};

export type DailyBasicRecord = {
  tsCode: string;
  tradeDate: string;
  turnoverRate: number;
  turnoverRateFreeFloat: number | null;
};

export type AdjustmentFactorRecord = {
  tsCode: string;
  tradeDate: string;
  adjFactor: number;
};

export type MarketCacheGenerationStatus =
  | "building"
  | "active"
  | "failed"
  | "retired";

export type MarketCacheGeneration = {
  id: number;
  status: MarketCacheGenerationStatus;
  startedAt: string;
  activatedAt: string | null;
  targetTradeDateCount: number;
};

export type MarketGenerationItemStatus =
  | "pending"
  | "succeeded"
  | "failed";

export type MarketDataItemKind = "daily" | "factor";

export type MarketDataWorkItem = {
  generationId: number;
  tradeDate: string;
  itemKind: MarketDataItemKind;
  currentStatus: MarketGenerationItemStatus;
};

export type ActiveGenerationMarketWorkPlan = {
  generationId: number;
  targetTradeDates: string[];
  items: MarketDataWorkItem[];
  missingDailyCount: number;
  missingFactorCount: number;
  ready: boolean;
};

export type MarketGenerationDateRecord = {
  generationId: number;
  tradeDate: string;
  dailyStatus: MarketGenerationItemStatus;
  factorStatus: MarketGenerationItemStatus;
  updatedAt: string;
};

export type MarketGenerationValidation = {
  generationId: number;
  expectedTradeDateCount: number;
  actualTradeDateCount: number;
  pairedSuccessCount: number;
  complete: boolean;
};
