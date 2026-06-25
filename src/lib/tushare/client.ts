import { z } from "zod";

import { TUSHARE_API_URL } from "@/lib/tushare/endpoints";
import type {
  SafeTushareError,
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
  TushareErrorCategory,
  TushareQueryOptions,
} from "@/lib/tushare/types";

const tushareResponseSchema = z.object({
  code: z.number(),
  msg: z.string().nullable().optional(),
  data: z
    .object({
      fields: z.array(z.string()),
      items: z.array(z.array(z.unknown())),
    })
    .optional(),
});

export class TushareApiError extends Error {
  constructor(
    readonly apiName: string,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
    this.name = "TushareApiError";
  }
}

type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export type TushareClientOptions = {
  token: string;
  apiUrl?: string;
  fetcher?: FetchLike;
};

const safeMessages: Record<TushareErrorCategory, string> = {
  missing_config:
    "缺少服务端配置。请在服务器环境变量中设置 TUSHARE_TOKEN 后重新验证。",
  invalid_token:
    "Tushare token 验证失败。请检查 token 是否正确、是否启用、以及账户权限是否满足当前接口。",
  permission_denied:
    "Tushare 接口权限不足。请检查账户权限或积分是否满足当前接口。",
  empty_data: "Tushare 接口返回空数据。请检查查询参数、交易日或账户权限。",
  rate_limited:
    "Tushare 返回限频或额度不足。请稍后重新验证，或检查账户额度。",
  network_or_service:
    "Tushare 网络或服务请求失败。请检查服务器网络后重新验证。",
  unknown: "Tushare 返回未知错误，已隐藏原始响应。",
};

function normalizeMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  return String(error ?? "").toLowerCase();
}

function detectCategory(error: unknown): TushareErrorCategory {
  const message = normalizeMessage(error);

  if (message.includes("missing_config") || message.includes("缺少服务端配置")) {
    return "missing_config";
  }

  if (error instanceof TushareApiError && error.code === 0) {
    return "empty_data";
  }

  if (
    message.includes("token") ||
    message.includes("无效") ||
    message.includes("invalid")
  ) {
    return "invalid_token";
  }

  if (
    message.includes("权限") ||
    message.includes("permission") ||
    message.includes("积分")
  ) {
    return "permission_denied";
  }

  if (
    message.includes("rate") ||
    message.includes("limit") ||
    message.includes("频") ||
    message.includes("额度")
  ) {
    return "rate_limited";
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "AbortError") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econn") ||
    message.includes("abort") ||
    message.includes("timeout")
  ) {
    return "network_or_service";
  }

  return "unknown";
}

export function classifyTushareError(
  error: unknown,
  affectedInterface = "unknown",
): SafeTushareError {
  const category = detectCategory(error);

  return {
    category,
    affectedInterface:
      error instanceof TushareApiError ? error.apiName : affectedInterface,
    message: safeMessages[category],
  };
}

export class TushareClient implements TushareClientLike {
  private readonly token: string;
  private readonly apiUrl: string;
  private readonly fetcher: FetchLike;

  constructor({
    token,
    apiUrl = TUSHARE_API_URL,
    fetcher = fetch as FetchLike,
  }: TushareClientOptions) {
    this.token = token;
    this.apiUrl = apiUrl;
    this.fetcher = fetcher;
  }

  async query(
    endpoint: TushareEndpoint,
    params: Record<string, unknown> = {},
    options: TushareQueryOptions = {},
  ): Promise<TushareDataTable> {
    let response: Response;
    try {
      response = await this.fetcher(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_name: endpoint.apiName,
          token: this.token,
          params,
          fields: endpoint.fields.join(","),
        }),
        signal: options.signal,
      });
    } catch (error) {
      const safeError = classifyTushareError(error, endpoint.apiName);
      if (safeError.category === "network_or_service") {
        throw new TushareApiError(
          endpoint.apiName,
          null,
          "network_or_service",
        );
      }
      throw error;
    }

    if (!response.ok) {
      throw new TushareApiError(
        endpoint.apiName,
        response.status,
        "network_or_service",
      );
    }

    const parsed = tushareResponseSchema.parse(await response.json());

    if (parsed.code !== 0) {
      throw new TushareApiError(
        endpoint.apiName,
        parsed.code,
        parsed.msg ?? "unknown tushare error",
      );
    }

    if (!parsed.data?.items.length) {
      throw new TushareApiError(endpoint.apiName, 0, "empty data");
    }

    return parsed.data;
  }
}
