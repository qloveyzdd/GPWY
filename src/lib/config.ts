import { z } from "zod";

import type {
  ValidationSection,
  ValidationSnapshot,
} from "@/lib/validation-types";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const envSchema = z.object({
  APP_PASSWORD: optionalSecret,
  TUSHARE_TOKEN: optionalSecret,
  TUSHARE_PROVIDER: z.enum(["rest", "tinyshare"]).optional(),
  PYTHON_BIN: optionalSecret,
});

const providerRuntimeEnvSchema = z.object({
  TUSHARE_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(8),
  TUSHARE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(60_000),
  TINYSHARE_WORKER_COUNT: z.coerce.number().int().min(1).max(8).default(2),
});

export type ProviderRuntimeConfig = {
  maxConcurrency: number;
  requestTimeoutMs: number;
  tinyshareWorkerCount: number;
};

export type ConfigIssueCategory = "missing_config";

export type ConfigIssue = {
  category: ConfigIssueCategory;
  affected: "APP_PASSWORD" | "TUSHARE_TOKEN";
  message: string;
};

export type SafeConfigStatus = {
  appPassword: {
    configured: boolean;
  };
  tushareToken: {
    configured: boolean;
  };
  provider: "rest" | "tinyshare";
  issues: ConfigIssue[];
};

export function loadServerConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): SafeConfigStatus {
  const parsed = envSchema.parse({
    APP_PASSWORD: env.APP_PASSWORD,
    TUSHARE_TOKEN: env.TUSHARE_TOKEN,
    TUSHARE_PROVIDER: env.TUSHARE_PROVIDER,
    PYTHON_BIN: env.PYTHON_BIN,
  });
  const issues: ConfigIssue[] = [];

  if (!parsed.APP_PASSWORD) {
    issues.push({
      category: "missing_config",
      affected: "APP_PASSWORD",
      message: "缺少访问密码配置。请在服务器环境变量中设置 APP_PASSWORD。",
    });
  }

  if (!parsed.TUSHARE_TOKEN) {
    issues.push({
      category: "missing_config",
      affected: "TUSHARE_TOKEN",
      message:
        "缺少服务端配置。请在服务器环境变量中设置 TUSHARE_TOKEN 后重新验证。",
    });
  }

  return {
    appPassword: {
      configured: Boolean(parsed.APP_PASSWORD),
    },
    tushareToken: {
      configured: Boolean(parsed.TUSHARE_TOKEN),
    },
    provider: parsed.TUSHARE_PROVIDER ?? "rest",
    issues,
  };
}

export function readProviderRuntimeConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): ProviderRuntimeConfig {
  const parsed = providerRuntimeEnvSchema.parse({
    TUSHARE_MAX_CONCURRENCY: env.TUSHARE_MAX_CONCURRENCY,
    TUSHARE_REQUEST_TIMEOUT_MS: env.TUSHARE_REQUEST_TIMEOUT_MS,
    TINYSHARE_WORKER_COUNT: env.TINYSHARE_WORKER_COUNT,
  });

  return {
    maxConcurrency: parsed.TUSHARE_MAX_CONCURRENCY,
    requestTimeoutMs: parsed.TUSHARE_REQUEST_TIMEOUT_MS,
    tinyshareWorkerCount: parsed.TINYSHARE_WORKER_COUNT,
  };
}

export function readAppPasswordSecret(): string | null {
  return envSchema.parse({ APP_PASSWORD: process.env.APP_PASSWORD })
    .APP_PASSWORD ?? null;
}

export function readTushareTokenSecret(): string | null {
  return envSchema.parse({ TUSHARE_TOKEN: process.env.TUSHARE_TOKEN })
    .TUSHARE_TOKEN ?? null;
}

export function createConfigValidationSnapshot(
  config = loadServerConfig(),
  now = new Date(),
): ValidationSnapshot {
  const tokenIssue = config.issues.find(
    (issue) => issue.affected === "TUSHARE_TOKEN",
  );
  const appPasswordIssue = config.issues.find(
    (issue) => issue.affected === "APP_PASSWORD",
  );
  const tokenStatus = tokenIssue ? "blocked" : "success";
  const hasBlockingIssue = Boolean(tokenIssue || appPasswordIssue);
  const sections: ValidationSection[] = [
    {
      key: "token",
      title: "Token 配置",
      status: tokenStatus,
      summary: tokenIssue?.message ?? "Tushare token 已配置，页面仅显示配置状态。",
      details: [
        {
          label: "TUSHARE_TOKEN",
          value: config.tushareToken.configured ? "已配置" : "未配置",
        },
        {
          label: "错误类别",
          value: tokenIssue?.category ?? "无",
        },
      ],
    },
    {
      key: "connection",
      title: "Tushare 连接",
      status: "not_validated",
      summary: "本阶段当前步骤尚未调用 Tushare；连接验证由后续计划补齐。",
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

  return {
    overallStatus: hasBlockingIssue ? "blocked" : "success",
    lastRunAt: now.toISOString(),
    summary: hasBlockingIssue
      ? "服务端配置未通过验证。"
      : "服务端配置已通过基础验证。",
    sections,
  };
}
