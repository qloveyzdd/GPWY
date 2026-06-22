export type ValidationStatus =
  | "not_validated"
  | "success"
  | "warning"
  | "blocked";

export type ValidationSectionKey =
  | "token"
  | "connection"
  | "stock_sample"
  | "price_basis"
  | "chip_candidate";

export type ValidationDetail = {
  label: string;
  value: string;
};

export type ValidationSection = {
  key: ValidationSectionKey;
  title: string;
  status: ValidationStatus;
  summary: string;
  details?: ValidationDetail[];
};

export type ValidationSnapshot = {
  overallStatus: ValidationStatus;
  lastRunAt: string | null;
  summary: string;
  sections: ValidationSection[];
};

export const EMPTY_VALIDATION_SECTIONS: ValidationSection[] = [
  {
    key: "token",
    title: "Token 配置",
    status: "not_validated",
    summary: "尚未验证服务端 Tushare token 配置。",
  },
  {
    key: "connection",
    title: "Tushare 连接",
    status: "not_validated",
    summary: "尚未发起 Tushare 连接验证。",
  },
  {
    key: "stock_sample",
    title: "股票基础样本",
    status: "not_validated",
    summary: "尚未读取股票代码和名称样本。",
  },
  {
    key: "price_basis",
    title: "行情价格口径",
    status: "not_validated",
    summary: "尚未验证 MA20、MA60 和波段高点使用的价格口径。",
  },
  {
    key: "chip_candidate",
    title: "筹码候选接口",
    status: "not_validated",
    summary: "尚未验证 Tushare 筹码候选接口权限和可用性。",
  },
];

export const EMPTY_VALIDATION_SNAPSHOT: ValidationSnapshot = {
  overallStatus: "not_validated",
  lastRunAt: null,
  summary: "尚未执行数据源验证",
  sections: EMPTY_VALIDATION_SECTIONS,
};
