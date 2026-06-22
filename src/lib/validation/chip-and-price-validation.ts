import { classifyTushareError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  SafeTushareError,
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";
import type { ValidationSection } from "@/lib/validation-types";

type RunChipAndPriceValidationOptions = {
  client: TushareClientLike;
  tsCode: string;
  dailyProbe: TushareDataTable;
  now?: Date;
};

type ChipAttempt = {
  endpoint: string;
  state: "available" | "permission_denied" | "empty" | "not_supported" | "blocked";
  category?: SafeTushareError["category"];
};

export type ChipAndPriceValidationResult = {
  priceBasis: ValidationSection;
  chipCandidate: ValidationSection;
};

const chipCandidateEndpoints: TushareEndpoint[] = [
  TUSHARE_ENDPOINTS.chipChips,
  TUSHARE_ENDPOINTS.chipPerf,
];

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

function hasRows(table: TushareDataTable) {
  return table.items.length > 0;
}

function chipStateFromError(error: SafeTushareError): ChipAttempt["state"] {
  if (error.category === "permission_denied") {
    return "permission_denied";
  }

  if (error.category === "empty_data") {
    return "empty";
  }

  if (error.category === "unknown") {
    return "not_supported";
  }

  return "blocked";
}

async function buildPriceBasisSection({
  client,
  tsCode,
  dailyProbe,
  now,
}: RunChipAndPriceValidationOptions): Promise<ValidationSection> {
  try {
    const adjFactor = await client.query(TUSHARE_ENDPOINTS.adjFactor, {
      ts_code: tsCode,
      start_date: formatDate(dateDaysAgo(now ?? new Date(), 10)),
      end_date: formatDate(now ?? new Date()),
    });

    if (hasRows(dailyProbe) && hasRows(adjFactor)) {
      return {
        key: "price_basis",
        title: "行情价格口径",
        status: "success",
        summary: "已验证 daily 与 adj_factor 可用，后续筛选优先使用前复权价格。",
        details: [
          { label: "basis", value: "front_adjusted" },
          { label: "reason", value: "daily_and_adj_factor_available" },
          { label: "fallback_risk", value: "none" },
        ],
      };
    }
  } catch {
    // Fallback is recorded below with explicit risk copy.
  }

  return {
    key: "price_basis",
    title: "行情价格口径",
    status: "warning",
    summary:
      "未能稳定获取前复权行情，当前验证结果退回未复权价格；后续筛选会显示该口径风险。",
    details: [
      { label: "basis", value: "unadjusted_daily" },
      { label: "reason", value: "adj_factor_unavailable_or_empty" },
      { label: "fallback_risk", value: "ma_and_swing_high_shift" },
    ],
  };
}

async function buildChipCandidateSection({
  client,
  tsCode,
  now,
}: RunChipAndPriceValidationOptions): Promise<ValidationSection> {
  const attempts: ChipAttempt[] = [];

  for (const endpoint of chipCandidateEndpoints) {
    try {
      const table = await client.query(endpoint, {
        ts_code: tsCode,
        start_date: formatDate(dateDaysAgo(now ?? new Date(), 10)),
        end_date: formatDate(now ?? new Date()),
      });

      if (hasRows(table)) {
        attempts.push({
          endpoint: endpoint.apiName,
          state: "available",
        });
      } else {
        attempts.push({
          endpoint: endpoint.apiName,
          state: "empty",
          category: "empty_data",
        });
      }
    } catch (error) {
      const safeError = classifyTushareError(error, endpoint.apiName);
      attempts.push({
        endpoint: endpoint.apiName,
        state: chipStateFromError(safeError),
        category: safeError.category,
      });
    }
  }

  const available = attempts.find((attempt) => attempt.state === "available");

  if (available) {
    return {
      key: "chip_candidate",
      title: "筹码候选接口",
      status: "success",
      summary: "Tushare 筹码候选接口已返回官方数据，后续阶段可基于官方数据提取筹码峰。",
      details: [
        { label: "chip_state", value: "available" },
        {
          label: "available_endpoint",
          value: available.endpoint,
        },
        {
          label: "attempted_endpoints",
          value: attempts.map((attempt) => `${attempt.endpoint}:${attempt.state}`).join(","),
        },
      ],
    };
  }

  return {
    key: "chip_candidate",
    title: "筹码候选接口",
    status: "blocked",
    summary:
      "筹码候选接口当前不可用或权限不足；后续筹码峰功能保持阻塞，不使用估算值替代。",
    details: [
      { label: "chip_state", value: "blocked" },
      {
        label: "attempted_endpoints",
        value: attempts
          .map((attempt) =>
            `${attempt.endpoint}:${attempt.state}${attempt.category ? `:${attempt.category}` : ""}`,
          )
          .join(","),
      },
    ],
  };
}

export async function runChipAndPriceValidation(
  options: RunChipAndPriceValidationOptions,
): Promise<ChipAndPriceValidationResult> {
  const [priceBasis, chipCandidate] = await Promise.all([
    buildPriceBasisSection(options),
    buildChipCandidateSection(options),
  ]);

  return {
    priceBasis,
    chipCandidate,
  };
}
