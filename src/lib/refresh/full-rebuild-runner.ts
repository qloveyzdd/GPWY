import {
  bootstrapMarketData,
  type BootstrapMarketDataProgress,
  type BootstrapMarketDataResult,
} from "@/lib/refresh/bootstrap-market-data";
import {
  completeRefreshOperation,
  failRefreshOperation,
  readRefreshOperationSnapshot,
  startRefreshOperation,
  upsertRefreshStage,
} from "@/lib/refresh/refresh-store";
import type {
  RefreshOperationSnapshot,
  RefreshStageSnapshot,
} from "@/lib/refresh/refresh-types";
import { classifyTushareError } from "@/lib/tushare/client";
import type { TushareClientLike } from "@/lib/tushare/types";

export type RunFullMarketRebuildOptions = {
  client: TushareClientLike;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
  onStage?: (stage: RefreshStageSnapshot) => void;
};

export type RunFullMarketRebuildResult = {
  result: BootstrapMarketDataResult;
  snapshot: RefreshOperationSnapshot;
};

const tokenAssignmentPattern =
  /(token|authorization|cookie|headers?)\s*[:=]\s*[^,\s"}]+/gi;
const localPathPattern = /[A-Z]:[\\/][^,\s"}]+|\/(?:Users|home|var|tmp)\/[^,\s"}]+/g;
const secretLikePattern = /\b[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*\b/gi;

function sanitizeRebuildError(error: unknown) {
  const safeError = classifyTushareError(error, "full_rebuild");
  const text = `${safeError.category}:${safeError.affectedInterface}:${safeError.message}`;

  return text
    .replace(tokenAssignmentPattern, "$1=[redacted]")
    .replace(localPathPattern, "[redacted-path]")
    .replace(secretLikePattern, "[redacted]")
    .slice(0, 240);
}

function emitStage(
  operationId: number,
  progress: BootstrapMarketDataProgress,
  onStage: ((stage: RefreshStageSnapshot) => void) | undefined,
) {
  upsertRefreshStage(operationId, {
    stage: progress.stage,
    status: progress.status,
    total: progress.total,
    completed: progress.completed,
    failed: progress.failed,
    errorSummary: progress.errorSummary
      ? sanitizeRebuildError(new Error(progress.errorSummary))
      : null,
  });

  const stage = readRefreshOperationSnapshot().stages.find(
    (snapshot) => snapshot.stage === progress.stage,
  );

  if (stage) {
    onStage?.(stage);
  }
}

export async function runFullMarketRebuild({
  client,
  now = new Date(),
  targetTradingDates,
  maxLookbackDays,
  onStage,
}: RunFullMarketRebuildOptions): Promise<RunFullMarketRebuildResult> {
  const operationStart = startRefreshOperation("full_rebuild", { now });

  if (!operationStart.started) {
    throw new Error("refresh_operation_already_running");
  }

  const operationId = operationStart.operation.id;

  try {
    const result = await bootstrapMarketData({
      client,
      now,
      targetTradingDates,
      maxLookbackDays,
      onProgress: (progress) => emitStage(operationId, progress, onStage),
    });

    upsertRefreshStage(operationId, {
      stage: "screening",
      status: "skipped",
      errorSummary: "full_rebuild_does_not_publish_screening",
    });
    upsertRefreshStage(operationId, {
      stage: "chip",
      status: "skipped",
      errorSummary: "full_rebuild_does_not_run_chip",
    });
    completeRefreshOperation(operationId);

    return {
      result,
      snapshot: readRefreshOperationSnapshot(),
    };
  } catch (error) {
    const errorSummary = sanitizeRebuildError(error);

    failRefreshOperation(operationId, { errorSummary });
    throw new Error(errorSummary);
  }
}
