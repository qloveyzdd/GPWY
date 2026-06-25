import { ProviderRequestScheduler } from "@/lib/tushare/request-scheduler";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
  TushareQueryOptions,
} from "@/lib/tushare/types";

export class ScheduledTushareClient implements TushareClientLike {
  constructor(
    private readonly client: TushareClientLike,
    private readonly scheduler: ProviderRequestScheduler,
  ) {}

  query(
    endpoint: TushareEndpoint,
    params: Record<string, unknown> = {},
    options: TushareQueryOptions = {},
  ): Promise<TushareDataTable> {
    return this.scheduler.schedule({
      affectedInterface: endpoint.apiName,
      priority: options.priority ?? "market",
      signal: options.signal,
      execute: (signal) => this.client.query(endpoint, params, { signal }),
    });
  }
}
