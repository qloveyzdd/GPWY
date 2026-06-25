import type {
  RefreshJob,
  RefreshStatusSnapshot,
} from "@/lib/refresh/refresh-types";
import {
  bootstrapMarketData,
  type BootstrapMarketDataOptions,
} from "@/lib/refresh/bootstrap-market-data";
import {
  completeRefreshJob,
  failRefreshJob,
  readActiveRefreshJob,
  readLatestCacheStats,
  readLatestRefreshJob,
  readLatestSuccessfulRefreshJob,
  startRefreshJob,
} from "@/lib/refresh/refresh-store";
import {
  readActiveMarketCacheGeneration,
  readActiveMarketCacheStats,
  readMarketStocks,
} from "@/lib/refresh/market-data-store";
import {
  runChipPeakIntegrationFromLatestScreening,
} from "@/lib/chip/chip-runner";
import type { ChipPeakRunRecord } from "@/lib/chip/chip-types";
import { readTushareTokenSecret } from "@/lib/config";
import { runDowntrendScreeningFromCache } from "@/lib/screening/screening-runner";
import type { ScreeningRunRecord } from "@/lib/screening/screening-types";
import { classifyTushareError } from "@/lib/tushare/client";
import { createTushareClient } from "@/lib/tushare/provider";
import type { TushareClientLike } from "@/lib/tushare/types";

export type RefreshWorkerResult = {
  totalStocks: number;
  successCount: number;
  failedCount: number;
};

export type RefreshWorker = (job: RefreshJob) => Promise<RefreshWorkerResult>;
export type ScreeningWorkflowRunner = (options: {
  sourceRefreshJobId: number;
  now?: Date;
}) => ScreeningRunRecord;
export type ChipPeakWorkflowRunner = (options: {
  now?: Date;
}) => Promise<ChipPeakRunRecord>;

export type StartManualRefreshOptions = {
  worker?: RefreshWorker;
  providerWorkerOptions?: ProviderRefreshWorkerOptions;
  screeningRunner?: ScreeningWorkflowRunner;
  chipPeakRunner?: ChipPeakWorkflowRunner;
  now?: Date;
  waitForCompletion?: boolean;
};

export type StartManualRefreshResult = {
  started: boolean;
  job: RefreshJob;
  status: RefreshStatusSnapshot;
};

export type ProviderRefreshWorkerOptions = Omit<
  BootstrapMarketDataOptions,
  "client"
> & {
  client?: TushareClientLike;
};

const tokenAssignmentPattern =
  /(token|authorization|cookie|headers?)\s*[:=]\s*[^,\s"}]+/gi;
const localPathPattern = /[A-Z]:[\\/][^,\s"}]+/g;
const secretLikePattern = /\b[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*\b/gi;

function sanitizeErrorSummary(error: unknown) {
  const safeError = classifyTushareError(error, "refresh");
  const text = `${safeError.category}:${safeError.affectedInterface}:${safeError.message}`;

  return text
    .replace(tokenAssignmentPattern, "$1=[redacted]")
    .replace(localPathPattern, "[redacted-path]")
    .replace(secretLikePattern, "[redacted]")
    .slice(0, 240);
}

export function createProviderRefreshWorker({
  client,
  now,
  targetTradingDates,
  maxLookbackDays,
  providerRetryCount,
  providerRetryDelayMs,
  store,
}: ProviderRefreshWorkerOptions = {}): RefreshWorker {
  return async () => {
    const token = readTushareTokenSecret();
    const tushareClient = client ?? (token ? createTushareClient(token) : null);

    if (!tushareClient) {
      throw new Error("missing_config:TUSHARE_TOKEN");
    }

    const data = await bootstrapMarketData({
      client: tushareClient,
      now,
      targetTradingDates,
      maxLookbackDays,
      providerRetryCount,
      providerRetryDelayMs,
      store,
    });

    return {
      totalStocks: data.stockCount,
      successCount: data.stockCount,
      failedCount: 0,
    };
  };
}

function createActiveGenerationRefreshWorker(): RefreshWorker {
  return async () => {
    const tradableStockCount = readMarketStocks().filter(
      (stock) => stock.listStatus === "L",
    ).length;

    return {
      totalStocks: tradableStockCount,
      successCount: tradableStockCount,
      failedCount: 0,
    };
  };
}

async function finishRefreshJob(
  job: RefreshJob,
  worker: RefreshWorker,
  {
    now,
    screeningRunner = runDowntrendScreeningFromCache,
    chipPeakRunner = runChipPeakIntegrationFromLatestScreening,
  }: {
    now?: Date;
    screeningRunner?: ScreeningWorkflowRunner;
    chipPeakRunner?: ChipPeakWorkflowRunner;
  } = {},
) {
  try {
    const result = await worker(job);
    screeningRunner({ sourceRefreshJobId: job.id, now });

    try {
      await chipPeakRunner({ now });
    } catch {
      // Chip peak enrichment is row-level best effort; screening results stay usable.
    }

    completeRefreshJob(job.id, result);
  } catch (error) {
    failRefreshJob(job.id, {
      errorSummary: sanitizeErrorSummary(error),
      failedCount: 1,
    });
  }
}

export function readRefreshStatus(): RefreshStatusSnapshot {
  const activeJob = readActiveRefreshJob();
  const latestSuccessfulJob = readLatestSuccessfulRefreshJob();
  const normalizedCacheStats = readActiveMarketCacheStats();

  return {
    activeJob,
    latestJob: readLatestRefreshJob(),
    latestSuccessfulJob,
    latestCacheStats: normalizedCacheStats ?? readLatestCacheStats(),
    isRunning: Boolean(activeJob),
    mode: activeJob?.mode ?? null,
    lastSuccessfulFinishedAt: latestSuccessfulJob?.finishedAt ?? null,
  };
}

export async function startManualRefresh({
  worker,
  providerWorkerOptions,
  screeningRunner,
  chipPeakRunner,
  now = new Date(),
  waitForCompletion = false,
}: StartManualRefreshOptions = {}): Promise<StartManualRefreshResult> {
  const activeGeneration = readActiveMarketCacheGeneration();
  const mode = worker ? "ordinary" : activeGeneration ? "ordinary" : "bootstrap";
  const startResult = startRefreshJob(now, mode);

  if (!startResult.started) {
    return {
      ...startResult,
      status: readRefreshStatus(),
    };
  }

  const selectedWorker =
    worker ??
    (activeGeneration
      ? createActiveGenerationRefreshWorker()
      : createProviderRefreshWorker({
          ...providerWorkerOptions,
          now: providerWorkerOptions?.now ?? now,
        }));
  const refreshPromise = finishRefreshJob(
    startResult.job,
    selectedWorker,
    {
      now,
      screeningRunner,
      chipPeakRunner,
    },
  );

  if (waitForCompletion) {
    await refreshPromise;
  } else {
    void refreshPromise;
  }

  return {
    started: true,
    job: waitForCompletion
      ? (readLatestRefreshJob() ?? startResult.job)
      : startResult.job,
    status: readRefreshStatus(),
  };
}
