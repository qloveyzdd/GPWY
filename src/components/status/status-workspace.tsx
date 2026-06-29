"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Database,
  LineChart,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { ResultsTable } from "@/components/results/results-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { ResultsSnapshot } from "@/lib/results/results-types";
import { EMPTY_RESULTS_SNAPSHOT } from "@/lib/results/results-types";
import type {
  RefreshOperationKind,
  RefreshStageSnapshot,
  RefreshStageStatus,
  RefreshStatusSnapshot,
} from "@/lib/refresh/refresh-types";
import type {
  ValidationSection,
  ValidationSectionKey,
  ValidationSnapshot,
  ValidationStatus,
} from "@/lib/validation-types";
import { EMPTY_VALIDATION_SECTIONS } from "@/lib/validation-types";
import { cn } from "@/lib/utils";

type StatusWorkspaceProps = {
  initialSnapshot: ValidationSnapshot;
  initialRefreshStatus: RefreshStatusSnapshot;
  initialResultsSnapshot?: ResultsSnapshot;
  logoutAction: (formData: FormData) => void | Promise<void>;
};

type StartRefreshResponse = {
  started: boolean;
  status: RefreshStatusSnapshot;
};

const validationStatusLabels: Record<ValidationStatus, string> = {
  not_validated: "未验证",
  success: "正常",
  warning: "警告",
  blocked: "阻塞",
};

const refreshStageStatusLabels: Record<RefreshStageStatus, string> = {
  pending: "等待中",
  running: "进行中",
  succeeded: "已完成",
  partial: "部分完成",
  failed: "失败",
  skipped: "已跳过",
};

const sectionIcons: Record<
  ValidationSectionKey,
  React.ComponentType<{ className?: string }>
> = {
  token: ShieldCheck,
  connection: Activity,
  stock_sample: Database,
  price_basis: LineChart,
  chip_candidate: CircleSlash,
};

const statusIcons: Record<
  ValidationStatus,
  React.ComponentType<{ className?: string }>
> = {
  not_validated: CircleSlash,
  success: CheckCircle2,
  warning: AlertTriangle,
  blocked: AlertTriangle,
};

function statusTone(status: ValidationStatus) {
  switch (status) {
    case "success":
      return "border-[#15803D]/30 bg-[#15803D]/5 text-[#15803D]";
    case "warning":
      return "border-[#B45309]/30 bg-[#B45309]/5 text-[#B45309]";
    case "blocked":
      return "border-[#B91C1C]/30 bg-[#B91C1C]/5 text-[#B91C1C]";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

function stageTone(status: RefreshStageStatus) {
  switch (status) {
    case "running":
      return "border-primary/60 bg-primary/5 ring-2 ring-primary/20";
    case "succeeded":
      return "border-[#15803D]/30 bg-[#15803D]/5";
    case "partial":
      return "border-[#B45309]/30 bg-[#B45309]/5";
    case "failed":
      return "border-[#B91C1C]/30 bg-[#B91C1C]/5";
    default:
      return "border-border bg-card";
  }
}

function stageBadgeTone(status: RefreshStageStatus) {
  switch (status) {
    case "running":
      return "border-primary/30 bg-primary/5 text-primary";
    case "succeeded":
      return "border-[#15803D]/30 bg-[#15803D]/5 text-[#15803D]";
    case "partial":
      return "border-[#B45309]/30 bg-[#B45309]/5 text-[#B45309]";
    case "failed":
      return "border-[#B91C1C]/30 bg-[#B91C1C]/5 text-[#B91C1C]";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function mergeSections(snapshot: ValidationSnapshot) {
  const sectionMap = new Map(
    snapshot.sections.map((section) => [section.key, section]),
  );

  return EMPTY_VALIDATION_SECTIONS.map(
    (section) => sectionMap.get(section.key) ?? section,
  );
}

function refreshBadgeStatus(status: RefreshStatusSnapshot): ValidationStatus {
  if (status.hasActiveWork || status.isRunning) {
    return "warning";
  }

  if (status.latestJob?.status === "failed") {
    return "blocked";
  }

  if (status.latestSuccessfulJob) {
    return "success";
  }

  return "not_validated";
}

function refreshSummary(status: RefreshStatusSnapshot) {
  if (status.hasActiveWork || status.isRunning) {
    if (status.activeOperation?.kind === "full_rebuild") {
      return "全量重建正在运行";
    }

    return status.mode === "bootstrap" ? "正在初始化缓存" : "刷新正在运行";
  }

  if (status.latestJob?.status === "failed") {
    return "最近刷新失败";
  }

  if (status.latestSuccessfulJob) {
    return "最近刷新成功";
  }

  return "尚未执行缓存刷新";
}

function operationLabel(kind: RefreshOperationKind | undefined) {
  switch (kind) {
    case "chip_background":
      return "筹码后台处理";
    case "full_rebuild":
      return "全量重建";
    case "manual_refresh":
      return "普通增量刷新";
    default:
      return "刷新任务";
  }
}

function refreshDetail(status: RefreshStatusSnapshot) {
  if (status.activeOperation?.kind === "full_rebuild") {
    return "全量重建正在运行，暂不能启动普通刷新。";
  }

  if (status.activeOperation?.kind === "chip_background") {
    return "筛选结果已更新，筹码处理仍在后台继续。";
  }

  if (status.activeJob) {
    if (status.mode === "bootstrap") {
      return "正在重新获取最近 60 个交易日的数据。完成前继续显示旧缓存结果。";
    }

    return `任务 #${status.activeJob.id} 已开始，正在写入本地缓存。`;
  }

  if (status.latestJob?.status === "failed") {
    return `任务 #${status.latestJob.id} 失败：${
      status.latestJob.errorSummary ?? "未返回错误摘要"
    }`;
  }

  if (status.latestSuccessfulJob) {
    const job = status.latestSuccessfulJob;
    const stockCount = status.latestCacheStats?.stockCount ?? job.successCount;
    const dailyBarText = status.latestCacheStats
      ? `，日线 ${status.latestCacheStats.dailyBarCount} 条`
      : "";

    return `最近成功：${job.finishedAt ?? "未知"}，缓存股票 ${stockCount} 只${dailyBarText}，失败 ${job.failedCount} 只。`;
  }

  return "点击“开始增量刷新”从数据源拉取股票基础信息和行情切片。";
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "未开始";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.round(durationMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
}

function safeStageError(errorSummary: string | null) {
  if (!errorSummary) {
    return null;
  }

  return errorSummary
    .replace(/TUSHARE_TOKEN|REFRESH_DB_PATH|market_cache_generations/gi, "[已脱敏]")
    .replace(/(token|authorization|cookie|headers?)\s*[:=]\s*[^,\s"}]+/gi, "$1=[已脱敏]")
    .replace(/[A-Z]:[\\/][^,\s"}]+|\/(?:Users|home|var|tmp)\/[^,\s"}]+/g, "[已脱敏路径]")
    .slice(0, 240);
}

function chipStage(status: RefreshStatusSnapshot) {
  return status.stages.find((stage) => stage.stage === "chip");
}

function isChipTerminal(stage: RefreshStageSnapshot | undefined) {
  return (
    stage?.stage === "chip" &&
    ["succeeded", "partial", "failed", "skipped"].includes(stage.status)
  );
}

function StatusBadge({ status }: { status: ValidationStatus }) {
  const Icon = statusIcons[status];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border px-2", statusTone(status))}
    >
      <Icon className="size-3" />
      {validationStatusLabels[status]}
    </Badge>
  );
}

function StageProgressPanel({ status }: { status: RefreshStatusSnapshot }) {
  return (
    <section
      aria-label="刷新阶段进度"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-semibold leading-[1.25]">
          刷新阶段
        </h2>
        <p className="text-[14px] leading-[1.4] text-muted-foreground">
          当前任务：{operationLabel(status.activeOperation?.kind)}
        </p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {status.stages.map((stage) => {
          const safeError = safeStageError(stage.errorSummary);

          return (
            <article
              key={stage.stage}
              className={cn(
                "rounded-lg border p-4 transition-colors",
                stageTone(stage.status),
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[16px] font-semibold leading-[1.5]">
                  {stage.label}
                </h3>
                <Badge
                  variant="outline"
                  className={cn("border px-2", stageBadgeTone(stage.status))}
                >
                  {stage.status === "running" ? (
                    <RefreshCw className="mr-1 size-3 animate-spin" />
                  ) : null}
                  {refreshStageStatusLabels[stage.status]}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[14px] leading-[1.4]">
                <div>
                  <dt className="text-muted-foreground">进度</dt>
                  <dd className="font-semibold tabular-nums">
                    {stage.completed}/{stage.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">失败</dt>
                  <dd className="font-semibold tabular-nums">{stage.failed}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">耗时</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatDuration(stage.durationMs)}
                  </dd>
                </div>
                {stage.retryCount > 0 &&
                (stage.status === "partial" || stage.status === "failed") ? (
                  <div>
                    <dt className="text-muted-foreground">重试</dt>
                    <dd className="font-semibold tabular-nums">
                      {stage.retryCount}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {safeError ? (
                <p className="mt-3 text-[14px] leading-[1.4] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    脱敏原因：
                  </span>
                  {safeError}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SectionBand({ section }: { section: ValidationSection }) {
  const Icon = sectionIcons[section.key];

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <Icon className="size-5 text-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-[20px] font-semibold leading-[1.25]">
              {section.title}
            </h2>
            <p className="text-[14px] leading-[1.4] text-muted-foreground">
              {section.summary}
            </p>
          </div>
        </div>
        <StatusBadge status={section.status} />
      </div>

      {section.details?.length ? (
        <>
          <Separator className="my-4" />
          <Table>
            <TableBody>
              {section.details.map((detail) => (
                <TableRow key={detail.label}>
                  <TableCell className="w-40 whitespace-normal text-[14px] text-muted-foreground">
                    {detail.label}
                  </TableCell>
                  <TableCell className="whitespace-normal text-[14px]">
                    {detail.value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
    </section>
  );
}

export function StatusWorkspace({
  initialSnapshot,
  initialRefreshStatus,
  initialResultsSnapshot = EMPTY_RESULTS_SNAPSHOT,
  logoutAction,
}: StatusWorkspaceProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [refreshStatus, setRefreshStatus] = useState(initialRefreshStatus);
  const [isStartingRefresh, setIsStartingRefresh] = useState(false);
  const [isRunningValidation, setIsRunningValidation] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const hasObservedActiveWorkRef = useRef(
    initialRefreshStatus.hasActiveWork || initialRefreshStatus.isRunning,
  );
  const resultVersionRef = useRef(initialRefreshStatus.resultVersion);
  const chipVersionRef = useRef(initialRefreshStatus.chipVersion);
  const chipStageStatusRef = useRef(chipStage(initialRefreshStatus)?.status);
  const sections = useMemo(() => mergeSections(snapshot), [snapshot]);
  const isEmpty = snapshot.overallStatus === "not_validated";
  const refreshBusy =
    isStartingRefresh || refreshStatus.hasActiveWork || refreshStatus.isRunning;
  const isFullRebuildRunning =
    refreshStatus.activeOperation?.kind === "full_rebuild";

  useEffect(() => {
    if (!refreshStatus.hasActiveWork) {
      return;
    }

    async function pollRefreshStatus() {
      try {
        const response = await fetch("/api/refresh/status");

        if (response.ok) {
          const nextStatus = (await response.json()) as RefreshStatusSnapshot;
          setRefreshStatus(nextStatus);
        }
      } catch {
        // Polling failures keep the last known safe state visible.
      }
    }

    const intervalId = window.setInterval(() => {
      void pollRefreshStatus();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [refreshStatus.hasActiveWork]);

  useEffect(() => {
    const previousResultVersion = resultVersionRef.current;
    const previousChipVersion = chipVersionRef.current;
    const previousChipStatus = chipStageStatusRef.current;
    const currentChipStage = chipStage(refreshStatus);

    if (
      refreshStatus.resultVersion &&
      refreshStatus.resultVersion !== previousResultVersion
    ) {
      router.refresh();
    }

    if (
      refreshStatus.chipVersion &&
      refreshStatus.chipVersion !== previousChipVersion
    ) {
      router.refresh();
    } else if (
      previousChipStatus === "running" &&
      isChipTerminal(currentChipStage)
    ) {
      router.refresh();
    }

    resultVersionRef.current = refreshStatus.resultVersion;
    chipVersionRef.current = refreshStatus.chipVersion;
    chipStageStatusRef.current = currentChipStage?.status;
  }, [refreshStatus, router]);

  useEffect(() => {
    if (refreshStatus.hasActiveWork || refreshStatus.isRunning) {
      hasObservedActiveWorkRef.current = true;
      return;
    }

    if (
      hasObservedActiveWorkRef.current &&
      !refreshStatus.resultVersion &&
      !refreshStatus.chipVersion
    ) {
      hasObservedActiveWorkRef.current = false;
      router.refresh();
    }
  }, [
    refreshStatus.chipVersion,
    refreshStatus.hasActiveWork,
    refreshStatus.isRunning,
    refreshStatus.resultVersion,
    router,
  ]);

  async function startRefresh() {
    setIsStartingRefresh(true);
    setRefreshError(null);

    try {
      const response = await fetch("/api/refresh/run", {
        method: "POST",
      });

      if (!response.ok) {
        setRefreshError("刷新请求未通过访问保护，请重新登录后再试。");
        return;
      }

      const result = (await response.json()) as StartRefreshResponse;
      setRefreshStatus(result.status);
    } catch {
      setRefreshError("刷新请求失败，请检查服务是否正在运行。");
    } finally {
      setIsStartingRefresh(false);
    }
  }

  async function runValidation() {
    setIsRunningValidation(true);
    setClientError(null);

    try {
      const response = await fetch("/api/validation/run", {
        method: "POST",
      });

      if (!response.ok) {
        setClientError("验证请求未通过访问保护，请重新登录后再试。");
        return;
      }

      const nextSnapshot = (await response.json()) as ValidationSnapshot;
      setSnapshot(nextSnapshot);
    } catch {
      setClientError("验证请求失败，请检查服务是否正在运行。");
    } finally {
      setIsRunningValidation(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
        <header className="flex min-h-14 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] leading-[1.4] text-muted-foreground">
              A Stock Downtrend Screener
            </p>
            <h1 className="text-[28px] font-semibold leading-[1.2]">
              数据源状态
            </h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              className="min-h-11"
              disabled={refreshBusy}
              aria-busy={refreshBusy}
              onClick={startRefresh}
            >
              <Database
                className={cn("size-4", refreshBusy ? "animate-pulse" : "")}
              />
              {refreshBusy ? "刷新进行中" : "开始增量刷新"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={isRunningValidation}
              aria-busy={isRunningValidation}
              onClick={runValidation}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  isRunningValidation ? "animate-spin" : "",
                )}
              />
              {isRunningValidation ? "正在验证数据源" : "重新验证数据源"}
            </Button>
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="outline"
                className="min-h-11 w-full sm:w-auto"
              >
                退出
              </Button>
            </form>
          </div>
        </header>

        {isFullRebuildRunning ? (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>普通刷新已暂时阻塞</AlertTitle>
            <AlertDescription>
              全量重建正在运行，暂不能启动普通刷新。
            </AlertDescription>
          </Alert>
        ) : null}

        {refreshError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>刷新失败</AlertTitle>
            <AlertDescription>{refreshError}</AlertDescription>
          </Alert>
        ) : null}

        {clientError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>验证失败</AlertTitle>
            <AlertDescription>{clientError}</AlertDescription>
          </Alert>
        ) : null}

        <StageProgressPanel status={refreshStatus} />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {sections.map((section) => {
            const Icon = sectionIcons[section.key];

            return (
              <div
                key={section.key}
                className="min-h-28 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon className="size-5 text-muted-foreground" />
                  <StatusBadge status={section.status} />
                </div>
                <h2 className="mt-3 text-[16px] font-semibold leading-[1.5]">
                  {section.title}
                </h2>
                <p className="mt-1 text-[14px] leading-[1.4] text-muted-foreground">
                  {section.summary}
                </p>
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[20px] font-semibold leading-[1.25]">
                {refreshSummary(refreshStatus)}
              </h2>
              <p className="mt-1 text-[14px] leading-[1.4] text-muted-foreground">
                {refreshDetail(refreshStatus)}
              </p>
            </div>
            <StatusBadge status={refreshBadgeStatus(refreshStatus)} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[20px] font-semibold leading-[1.25]">
                {isEmpty ? "尚未执行数据源验证" : snapshot.summary}
              </h2>
              <p className="mt-1 text-[14px] leading-[1.4] text-muted-foreground">
                {isEmpty
                  ? "点击“重新验证数据源”检查 Tushare token、股票基础信息、行情价格口径和筹码候选接口。"
                  : `最近验证时间：${snapshot.lastRunAt ?? "未知"}`}
              </p>
            </div>
            <StatusBadge status={snapshot.overallStatus} />
          </div>
        </section>

        <ResultsTable snapshot={initialResultsSnapshot} />

        <div className="grid gap-4">
          {sections.map((section) => (
            <SectionBand key={section.key} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}
