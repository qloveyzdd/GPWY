import type { TushareEndpoint } from "@/lib/tushare/types";

export const TUSHARE_API_URL = "https://api.tushare.pro";

export const TUSHARE_ENDPOINTS = {
  stockBasic: {
    apiName: "stock_basic",
    fields: ["ts_code", "name", "market", "list_status"],
  },
  daily: {
    apiName: "daily",
    fields: ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
  },
  adjFactor: {
    apiName: "adj_factor",
    fields: ["ts_code", "trade_date", "adj_factor"],
  },
  chipChips: {
    apiName: "cyq_chips",
    fields: ["ts_code", "trade_date", "price", "percent"],
  },
  chipPerf: {
    apiName: "cyq_perf",
    fields: ["ts_code", "trade_date", "his_low", "his_high", "cost_50pct"],
  },
} satisfies Record<string, TushareEndpoint>;
