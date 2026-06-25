export type TushareErrorCategory =
  | "missing_config"
  | "invalid_token"
  | "permission_denied"
  | "empty_data"
  | "rate_limited"
  | "network_or_service"
  | "unknown";

export type SafeTushareError = {
  category: TushareErrorCategory;
  affectedInterface: string;
  message: string;
};

export type TushareEndpoint = {
  apiName: string;
  fields: string[];
};

export type TushareDataTable = {
  fields: string[];
  items: unknown[][];
};

export type ProviderRequestPriority = "validation" | "market" | "chip";

export type TushareQueryOptions = {
  priority?: ProviderRequestPriority;
  signal?: AbortSignal;
};

export type TushareClientLike = {
  query: (
    endpoint: TushareEndpoint,
    params?: Record<string, unknown>,
    options?: TushareQueryOptions,
  ) => Promise<TushareDataTable>;
};
