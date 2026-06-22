import type {
  RefreshJob,
  RefreshStatusSnapshot,
} from "@/lib/refresh/refresh-types";
import {
  completeRefreshJob,
  failRefreshJob,
  readActiveRefreshJob,
  readLatestRefreshJob,
  readLatestSuccessfulRefreshJob,
  startRefreshJob,
} from "@/lib/refresh/refresh-store";

export type RefreshWorkerResult = {
  totalStocks: number;
  successCount: number;
  failedCount: number;
};

export type RefreshWorker = (job: RefreshJob) => Promise<RefreshWorkerResult>;

export type StartManualRefreshOptions = {
  worker?: RefreshWorker;
  now?: Date;
  waitForCompletion?: boolean;
};

export type StartManualRefreshResult = {
  started: boolean;
  job: RefreshJob;
  status: RefreshStatusSnapshot;
};

const tokenAssignmentPattern =
  /(token|authorization|cookie|headers?)\s*[:=]\s*[^,\s"}]+/gi;
const localPathPattern = /[A-Z]:[\\/][^,\s"}]+/g;
const secretLikePattern = /\b[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*\b/gi;

async function placeholderWorker(): Promise<RefreshWorkerResult> {
  return {
    totalStocks: 0,
    successCount: 0,
    failedCount: 0,
  };
}

function sanitizeErrorSummary(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "");

  return text
    .replace(tokenAssignmentPattern, "$1=[redacted]")
    .replace(localPathPattern, "[redacted-path]")
    .replace(secretLikePattern, "[redacted]")
    .slice(0, 240);
}

async function finishRefreshJob(job: RefreshJob, worker: RefreshWorker) {
  try {
    const result = await worker(job);
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

  return {
    activeJob,
    latestJob: readLatestRefreshJob(),
    latestSuccessfulJob,
    isRunning: Boolean(activeJob),
    lastSuccessfulFinishedAt: latestSuccessfulJob?.finishedAt ?? null,
  };
}

export async function startManualRefresh({
  worker = placeholderWorker,
  now = new Date(),
  waitForCompletion = false,
}: StartManualRefreshOptions = {}): Promise<StartManualRefreshResult> {
  const startResult = startRefreshJob(now);

  if (!startResult.started) {
    return {
      ...startResult,
      status: readRefreshStatus(),
    };
  }

  const refreshPromise = finishRefreshJob(startResult.job, worker);

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
