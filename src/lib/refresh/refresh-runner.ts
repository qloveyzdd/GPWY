import type {
  RefreshJob,
  RefreshStatusSnapshot,
} from "@/lib/refresh/refresh-types";
import {
  bootstrapMarketData,
  type BootstrapMarketDataOptions,
} from "@/lib/refresh/bootstrap-market-data";
import {
  completeRefreshOperation,
  completeRefreshJob,
  failRefreshOperation,
  failRefreshJob,
  readActiveRefreshJob,
  readLatestCacheStats,
  readLatestRefreshJob,
  readLatestSuccessfulRefreshJob,
  readRefreshOperationSnapshot,
  startRefreshJob,
  startRefreshOperation,
  upsertRefreshStage,
} from "@/lib/refresh/refresh-store";
import {
  refreshActiveMarketGeneration,
} from "@/lib/refresh/incremental-market-data";
import {
  readActiveMarketCacheGeneration,
  readActiveMarketCacheStats,
} from "@/lib/refresh/market-data-store";
import {
  runChipDistributionIntegrationFromLatestScreening,
  type ChipDistributionProgress,
} from "@/lib/chip/chip-runner";
import type { ChipDistributionRunRecord } from "@/lib/chip/chip-types";
import { readLatestChipDistributionRun } from "@/lib/chip/chip-store";
import { readTushareTokenSecret } from "@/lib/config";
import { runDowntrendScreeningFromCache } from "@/lib/screening/screening-runner";
import { readLatestScreeningRun } from "@/lib/screening/screening-store";
import type { ScreeningRunRecord } from "@/lib/screening/screening-types";
import { classifyTushareError } from "@/lib/tushare/client";
import { createTushareClient } from "@/lib/tushare/provider";
import type { TushareClientLike } from "@/lib/tushare/types";

export type RefreshWorkerResult = {
  totalStocks: number;
  successCount: number;
  failedCount: number;
  targetTradeDates?: string[];
};

export type RefreshWorker = (job: RefreshJob) => Promise<RefreshWorkerResult>;
export type ScreeningWorkflowRunner = (options: {
  sourceRefreshJobId: number;
  now?: Date;
  targetTradeDates?: string[];
}) => ScreeningRunRecord;
export type ChipDistributionWorkflowRunner = (options: {
  now?: Date;
  onProgress?: (progress: ChipDistributionProgress) => void;
}) => Promise<ChipDistributionRunRecord>;

export type StartManualRefreshOptions = {
  worker?: RefreshWorker;
  providerWorkerOptions?: ProviderRefreshWorkerOptions;
  screeningRunner?: ScreeningWorkflowRunner;
  chipDistributionRunner?: ChipDistributionWorkflowRunner;
  chipPeakRunner?: ChipDistributionWorkflowRunner;
  now?: Date;
  waitForCompletion?: boolean;
};

export type StartManualRefreshResult = {
  started: boolean;
  job: RefreshJob | null;
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
      store,
    });

    return {
      totalStocks: data.stockCount,
      successCount: data.stockCount,
      failedCount: 0,
    };
  };
}

function createActiveGenerationRefreshWorker({
  generationId,
  stageOperationId,
  client,
  now,
  targetTradingDates,
  maxLookbackDays,
}: ProviderRefreshWorkerOptions & {
  generationId: number;
  stageOperationId: number;
}): RefreshWorker {
  return async () => {
    const token = readTushareTokenSecret();
    const tushareClient = client ?? (token ? createTushareClient(token) : null);

    if (!tushareClient) {
      throw new Error("missing_config:TUSHARE_TOKEN");
    }

    const data = await refreshActiveMarketGeneration({
      client: tushareClient,
      generationId,
      now,
      targetTradingDates,
      maxLookbackDays,
      stageOperationId,
    });

    return {
      totalStocks: data.stockCount,
      successCount: data.stockCount,
      failedCount: data.failedCount,
      targetTradeDates: data.targetTradeDates,
    };
  };
}

function createResultVersion(run: ScreeningRunRecord | null) {
  return run ? `${run.id}:${run.createdAt}` : null;
}

function createChipVersion(run: ChipDistributionRunRecord | null) {
  return run ? `${run.id}:${run.createdAt}:${run.status}` : null;
}

async function finishRefreshJob(
  job: RefreshJob,
  worker: RefreshWorker,
  operationId: number,
  {
    now,
    screeningRunner = runDowntrendScreeningFromCache,
    chipDistributionRunner,
    chipPeakRunner,
  }: {
    now?: Date;
    screeningRunner?: ScreeningWorkflowRunner;
    chipDistributionRunner?: ChipDistributionWorkflowRunner;
    chipPeakRunner?: ChipDistributionWorkflowRunner;
  } = {},
) {
  try {
    const selectedChipDistributionRunner =
      chipDistributionRunner ??
      chipPeakRunner ??
      runDefaultChipBackgroundWorkflow;
    const result = await worker(job);
    const screeningStartedAt = new Date();

    upsertRefreshStage(operationId, {
      stage: "screening",
      status: "running",
      total: result.totalStocks,
      completed: 0,
      failed: 0,
      startedAt: screeningStartedAt,
    });

    const screeningRun = screeningRunner({
      sourceRefreshJobId: job.id,
      now,
      targetTradeDates: result.targetTradeDates,
    });

    upsertRefreshStage(operationId, {
      stage: "screening",
      status: "succeeded",
      total: screeningRun.totalStocks,
      completed: screeningRun.totalStocks,
      failed: 0,
      startedAt: screeningStartedAt,
      finishedAt: new Date(),
    });
    completeRefreshJob(job.id, result);
    completeRefreshOperation(operationId);
    startChipBackground({
      chipDistributionRunner: selectedChipDistributionRunner,
      now,
    });
  } catch (error) {
    const errorSummary = sanitizeErrorSummary(error);

    failRefreshJob(job.id, {
      errorSummary,
      failedCount: 1,
    });
    upsertRefreshStage(operationId, {
      stage: "screening",
      status: "failed",
      failed: 1,
      finishedAt: new Date(),
      errorSummary,
    });
    failRefreshOperation(operationId, { errorSummary });
  }
}

async function runDefaultChipBackgroundWorkflow(
  options: Parameters<ChipDistributionWorkflowRunner>[0],
) {
  return runChipDistributionIntegrationFromLatestScreening(options);
}

function chipStageStatus(run: ChipDistributionRunRecord) {
  if (run.totalTargets === 0) {
    return "skipped" as const;
  }

  if (run.status === "succeeded") {
    return "succeeded" as const;
  }

  if (run.status === "partial") {
    return "partial" as const;
  }

  return "failed" as const;
}

function startChipBackground({
  chipDistributionRunner,
  now,
}: {
  chipDistributionRunner: ChipDistributionWorkflowRunner;
  now?: Date;
}) {
  const startedAt = new Date();
  const startResult = startRefreshOperation("chip_background", {
    now: now ?? startedAt,
  });

  if (!startResult.started) {
    return;
  }

  const operationId = startResult.operation.id;

  upsertRefreshStage(operationId, {
    stage: "stock_list",
    status: "succeeded",
  });
  upsertRefreshStage(operationId, {
    stage: "market_data",
    status: "succeeded",
  });
  upsertRefreshStage(operationId, {
    stage: "screening",
    status: "succeeded",
  });
  upsertRefreshStage(operationId, {
    stage: "chip",
    status: "running",
    startedAt,
  });

  void (async () => {
    try {
      const run = await chipDistributionRunner({
        now,
        onProgress: (progress) => {
          upsertRefreshStage(operationId, {
            stage: "chip",
            status: "running",
            total: progress.totalTargets,
            completed: progress.completedTargets,
            failed: progress.failed + progress.blocked + progress.missing,
            startedAt,
          });
        },
      });
      const terminalStatus = chipStageStatus(run);
      const failedCount =
        run.failedCount + run.blockedCount + run.missingCount;
      const errorSummary =
        terminalStatus === "partial" || terminalStatus === "failed"
          ? `chip_${run.status}:${failedCount}`
          : null;

      upsertRefreshStage(operationId, {
        stage: "chip",
        status: terminalStatus,
        total: run.totalTargets,
        completed:
          run.successCount + run.blockedCount + run.failedCount + run.missingCount,
        failed: failedCount,
        startedAt,
        finishedAt: new Date(),
        errorSummary,
      });

      if (terminalStatus === "failed") {
        failRefreshOperation(operationId, {
          errorSummary: errorSummary ?? "chip_failed",
        });
      } else {
        completeRefreshOperation(operationId);
      }
    } catch (error) {
      const errorSummary = sanitizeErrorSummary(error);

      upsertRefreshStage(operationId, {
        stage: "chip",
        status: "failed",
        failed: 1,
        startedAt,
        finishedAt: new Date(),
        errorSummary,
      });
      failRefreshOperation(operationId, { errorSummary });
    }
  })();
}

export function readRefreshStatus(): RefreshStatusSnapshot {
  const activeJob = readActiveRefreshJob();
  const latestSuccessfulJob = readLatestSuccessfulRefreshJob();
  const normalizedCacheStats = readActiveMarketCacheStats();
  const operationSnapshot = readRefreshOperationSnapshot();

  return {
    activeJob,
    latestJob: readLatestRefreshJob(),
    latestSuccessfulJob,
    latestCacheStats: normalizedCacheStats ?? readLatestCacheStats(),
    activeOperation: operationSnapshot.activeOperation,
    latestOperation: operationSnapshot.latestOperation,
    stages: operationSnapshot.stages,
    hasActiveWork: operationSnapshot.hasActiveWork || Boolean(activeJob),
    resultVersion: createResultVersion(readLatestScreeningRun()),
    chipVersion: createChipVersion(readLatestChipDistributionRun()),
    isRunning: Boolean(activeJob),
    mode: activeJob?.mode ?? null,
    lastSuccessfulFinishedAt: latestSuccessfulJob?.finishedAt ?? null,
  };
}

export async function startManualRefresh({
  worker,
  providerWorkerOptions,
  screeningRunner,
  chipDistributionRunner,
  chipPeakRunner,
  now = new Date(),
  waitForCompletion = false,
}: StartManualRefreshOptions = {}): Promise<StartManualRefreshResult> {
  const activeGeneration = readActiveMarketCacheGeneration();
  const mode = worker ? "ordinary" : activeGeneration ? "ordinary" : "bootstrap";
  const operationStart = startRefreshOperation("manual_refresh", { now });

  if (!operationStart.started) {
    return {
      started: false,
      job: readActiveRefreshJob() ?? readLatestRefreshJob(),
      status: readRefreshStatus(),
    };
  }

  const startResult = startRefreshJob(now, mode);

  if (!startResult.started) {
    failRefreshOperation(operationStart.operation.id, {
      errorSummary: "refresh_job_already_running",
      finishedAt: now,
    });

    return {
      ...startResult,
      status: readRefreshStatus(),
    };
  }

  const selectedWorker =
    worker ??
    (activeGeneration
      ? createActiveGenerationRefreshWorker({
          ...providerWorkerOptions,
          generationId: activeGeneration.id,
          stageOperationId: operationStart.operation.id,
          now: providerWorkerOptions?.now ?? now,
        })
      : createProviderRefreshWorker({
          ...providerWorkerOptions,
          now: providerWorkerOptions?.now ?? now,
        }));
  const refreshPromise = finishRefreshJob(
    startResult.job,
    selectedWorker,
    operationStart.operation.id,
    {
      now,
      screeningRunner,
      chipDistributionRunner,
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
