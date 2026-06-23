"use client";

import { AlertTriangle, CircleSlash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ResultChipPeakState,
  ResultRow,
  ResultsSnapshot,
} from "@/lib/results/results-types";
import { cn } from "@/lib/utils";

type ResultsTableProps = {
  snapshot: ResultsSnapshot;
};

const chipStateLabels: Record<ResultChipPeakState, string> = {
  available: "可用",
  blocked: "阻塞",
  failed: "失败",
  missing: "无数据",
};

function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function chipStateTone(state: ResultChipPeakState) {
  switch (state) {
    case "available":
      return "border-[#15803D]/30 bg-[#15803D]/5 text-[#15803D]";
    case "blocked":
      return "border-[#B91C1C]/30 bg-[#B91C1C]/5 text-[#B91C1C]";
    case "failed":
      return "border-[#B45309]/30 bg-[#B45309]/5 text-[#B45309]";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

function ChipPeakCell({ row }: { row: ResultRow }) {
  if (row.chipPeakState === "available" && row.chipPeakPrice !== null) {
    return (
      <span className="font-medium tabular-nums">
        {formatPrice(row.chipPeakPrice)}
      </span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border px-2", chipStateTone(row.chipPeakState))}
    >
      {row.chipPeakState === "missing" ? (
        <CircleSlash className="size-3" />
      ) : (
        <AlertTriangle className="size-3" />
      )}
      {chipStateLabels[row.chipPeakState]}
    </Badge>
  );
}

function ResultsState({ snapshot }: ResultsTableProps) {
  const copy =
    snapshot.status === "empty"
      ? "最新一次下降趋势筛选已完成，但没有符合条件的股票。"
      : "还没有可展示的下降趋势筛选结果，请先完成缓存刷新和筛选。";

  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-4 text-[14px] leading-[1.5] text-muted-foreground">
      {copy}
    </div>
  );
}

export function ResultsTable({ snapshot }: ResultsTableProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[20px] font-semibold leading-[1.25]">
            最新筛选结果
          </h2>
          <p className="mt-1 text-[14px] leading-[1.4] text-muted-foreground">
            {snapshot.summary}
          </p>
        </div>
        {snapshot.status === "ready" ? (
          <Badge variant="outline" className="w-fit">
            {snapshot.rows.length} 只
          </Badge>
        ) : null}
      </div>

      {snapshot.status !== "ready" ? (
        <ResultsState snapshot={snapshot} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>股票代码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="text-right">当前价</TableHead>
              <TableHead className="text-right">区间高点</TableHead>
              <TableHead className="text-right">当前/高点</TableHead>
              <TableHead className="text-right">下跌幅度</TableHead>
              <TableHead className="text-right">筹码峰价格</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.rows.map((row) => (
              <TableRow key={row.tsCode}>
                <TableCell className="font-medium">{row.tsCode}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(row.currentPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(row.intervalHigh)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(row.currentHighRatio)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(row.drawdownPct)}
                </TableCell>
                <TableCell className="text-right">
                  <ChipPeakCell row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
