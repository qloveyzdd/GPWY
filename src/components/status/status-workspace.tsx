"use client";

import { useMemo, useState } from "react";
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
  logoutAction: (formData: FormData) => void | Promise<void>;
};

const statusLabels: Record<ValidationStatus, string> = {
  not_validated: "未验证",
  success: "正常",
  warning: "警告",
  blocked: "阻塞",
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

function mergeSections(snapshot: ValidationSnapshot) {
  const sectionMap = new Map(
    snapshot.sections.map((section) => [section.key, section]),
  );

  return EMPTY_VALIDATION_SECTIONS.map(
    (section) => sectionMap.get(section.key) ?? section,
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
      {statusLabels[status]}
    </Badge>
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
  logoutAction,
}: StatusWorkspaceProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isRunning, setIsRunning] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const sections = useMemo(() => mergeSections(snapshot), [snapshot]);
  const isEmpty = snapshot.overallStatus === "not_validated";

  async function runValidation() {
    setIsRunning(true);
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
      setIsRunning(false);
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
              disabled={isRunning}
              aria-busy={isRunning}
              onClick={runValidation}
            >
              <RefreshCw
                className={cn("size-4", isRunning ? "animate-spin" : "")}
              />
              {isRunning ? "正在验证数据源" : "重新验证数据源"}
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

        {clientError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>验证失败</AlertTitle>
            <AlertDescription>{clientError}</AlertDescription>
          </Alert>
        ) : null}

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

        <div className="grid gap-4">
          {sections.map((section) => (
            <SectionBand key={section.key} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}
