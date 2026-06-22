import {
  createConfigValidationSnapshot,
  loadServerConfig,
  readTushareTokenSecret,
} from "@/lib/config";
import { TushareClient, classifyTushareError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  SafeTushareError,
  TushareClientLike,
} from "@/lib/tushare/types";
import { runChipAndPriceValidation } from "@/lib/validation/chip-and-price-validation";
import { sanitizeValidationSnapshot } from "@/lib/validation/result-sanitizer";
import { writeValidationSnapshot } from "@/lib/validation-store";
import type {
  ValidationSection,
  ValidationSnapshot,
} from "@/lib/validation-types";

type RunBasicValidationOptions = {
  client?: TushareClientLike;
  now?: Date;
};

function mapRow(fields: string[], row: unknown[]) {
  return Object.fromEntries(fields.map((field, index) => [field, row[index]]));
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function dateDaysAgo(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);

  return next;
}

function blockedSection(
  key: ValidationSection["key"],
  title: string,
  error: SafeTushareError,
): ValidationSection {
  return {
    key,
    title,
    status: "blocked",
    summary: error.message,
    details: [
      { label: "错误类别", value: error.category },
      { label: "影响接口", value: error.affectedInterface },
    ],
  };
}

function buildFailureSnapshot(
  error: SafeTushareError,
  now: Date,
): ValidationSnapshot {
  return {
    overallStatus: "blocked",
    lastRunAt: now.toISOString(),
    summary: error.message,
    sections: [
      {
        key: "token",
        title: "Token 配置",
        status: error.category === "invalid_token" ? "blocked" : "success",
        summary:
          error.category === "invalid_token"
            ? error.message
            : "Tushare token 已配置，页面仅显示配置状态。",
      },
      blockedSection("connection", "Tushare 连接", error),
      blockedSection("stock_sample", "股票基础样本", error),
      {
        key: "price_basis",
        title: "行情价格口径",
        status: "not_validated",
        summary: "股票基础信息验证失败，尚未验证行情价格口径。",
      },
      {
        key: "chip_candidate",
        title: "筹码候选接口",
        status: "not_validated",
        summary: "尚未验证 Tushare 筹码候选接口权限和可用性。",
      },
    ],
  };
}

export async function runBasicValidation({
  client,
  now = new Date(),
}: RunBasicValidationOptions = {}): Promise<ValidationSnapshot> {
  const config = loadServerConfig();

  if (!config.tushareToken.configured) {
    const snapshot = sanitizeValidationSnapshot(
      createConfigValidationSnapshot(config, now),
    );
    writeValidationSnapshot(snapshot);
    return snapshot;
  }

  const token = readTushareTokenSecret();
  const tushareClient = client ?? new TushareClient({ token: token ?? "" });

  try {
    const stockBasic = await tushareClient.query(TUSHARE_ENDPOINTS.stockBasic, {
      list_status: "L",
    });
    const sample = mapRow(stockBasic.fields, stockBasic.items[0] ?? []);
    const tsCode = String(sample.ts_code ?? "");
    const daily = await tushareClient.query(TUSHARE_ENDPOINTS.daily, {
      ts_code: tsCode,
      start_date: formatDate(dateDaysAgo(now, 10)),
      end_date: formatDate(now),
    });
    const chipAndPrice = await runChipAndPriceValidation({
      client: tushareClient,
      tsCode,
      dailyProbe: daily,
      now,
    });
    const snapshot: ValidationSnapshot = {
      overallStatus:
        chipAndPrice.priceBasis.status === "success" &&
        chipAndPrice.chipCandidate.status === "success"
          ? "success"
          : chipAndPrice.chipCandidate.status === "blocked"
            ? "blocked"
            : "warning",
      lastRunAt: now.toISOString(),
      summary: "股票基础信息、价格口径和筹码候选接口验证已完成。",
      sections: [
        {
          key: "token",
          title: "Token 配置",
          status: "success",
          summary: "Tushare token 已配置，页面仅显示配置状态。",
        },
        {
          key: "connection",
          title: "Tushare 连接",
          status: "success",
          summary: "Tushare stock_basic 接口已返回可用数据。",
          details: [{ label: "接口", value: "stock_basic" }],
        },
        {
          key: "stock_sample",
          title: "股票基础样本",
          status: "success",
          summary: "已获取 A 股股票代码和名称样本。",
          details: [
            { label: "股票代码", value: tsCode },
            { label: "股票名称", value: String(sample.name ?? "未知") },
            { label: "返回字段", value: stockBasic.fields.join(",") },
          ],
        },
        chipAndPrice.priceBasis,
        chipAndPrice.chipCandidate,
      ],
    };
    const sanitizedSnapshot = sanitizeValidationSnapshot(snapshot);

    writeValidationSnapshot(sanitizedSnapshot);
    return sanitizedSnapshot;
  } catch (error) {
    const snapshot = sanitizeValidationSnapshot(
      buildFailureSnapshot(classifyTushareError(error, "stock_basic"), now),
    );
    writeValidationSnapshot(snapshot);
    return snapshot;
  }
}
