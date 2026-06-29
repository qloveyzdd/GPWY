"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { StockKlineChart } from "@/components/charts/stock-kline-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResultRow, ResultsSnapshot } from "@/lib/results/results-types";
import { cn } from "@/lib/utils";

type ResultsTableProps = {
  snapshot: ResultsSnapshot;
};

type SortKey = "currentHighRatio" | "drawdownPct";

type SortDirection = "asc" | "desc";

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function defaultDirection(key: SortKey): SortDirection {
  return key === "drawdownPct" ? "desc" : "asc";
}

function ariaSort(direction: SortDirection) {
  return direction === "asc" ? "ascending" : "descending";
}

function sortRows(rows: ResultRow[], sort: SortState) {
  return [...rows].sort((left, right) => {
    const leftValue = left[sort.key];
    const rightValue = right[sort.key];
    const direction = sort.direction === "asc" ? 1 : -1;
    const diff = (leftValue - rightValue) * direction;

    if (diff !== 0) {
      return diff;
    }

    return left.tsCode.localeCompare(right.tsCode);
  });
}

function ResultsState({ snapshot }: ResultsTableProps) {
  const title =
    snapshot.status === "empty" ? "没有符合条件的股票" : "结果数据不可用";
  const copy =
    snapshot.status === "empty"
      ? "最新一次下降趋势筛选已完成，但没有符合条件的股票。"
      : "还没有可展示的下降趋势筛选结果，请先完成缓存刷新和筛选。";

  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-4">
      <p className="text-[15px] font-medium leading-[1.4] text-foreground">
        {title}
      </p>
      <p className="mt-1 text-[14px] leading-[1.5] text-muted-foreground">
        {copy}
      </p>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sort.key === sortKey;
  const Icon = isActive
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead
      className="text-right"
      aria-sort={isActive ? ariaSort(sort.direction) : undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-8 px-2"
        aria-label={`按${label}排序`}
        aria-pressed={isActive}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <Icon className="size-3.5" />
      </Button>
    </TableHead>
  );
}

export function ResultsTable({ snapshot }: ResultsTableProps) {
  const [sort, setSort] = useState<SortState>({
    key: "currentHighRatio",
    direction: "asc",
  });
  const rows = useMemo(
    () => sortRows(snapshot.rows, sort),
    [snapshot.rows, sort],
  );
  const [selectedTsCode, setSelectedTsCode] = useState<string | null>(null);
  const effectiveSelectedTsCode = rows.some(
    (row) => row.tsCode === selectedTsCode,
  )
    ? selectedTsCode
    : null;

  function toggleSelectedRow(tsCode: string) {
    setSelectedTsCode((current) => (current === tsCode ? null : tsCode));
  }

  function handleSort(key: SortKey) {
    setSort((current) => {
      if (current.key !== key) {
        return { key, direction: defaultDirection(key) };
      }

      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="w-fit">
              {snapshot.rows.length} 只
            </Badge>
            {snapshot.cacheSource === "legacy" ? (
              <Badge
                variant="outline"
                className="w-fit border-[#B45309]/30 bg-[#B45309]/5 text-[#B45309]"
              >
                旧缓存结果
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {snapshot.status !== "ready" ? (
        <ResultsState snapshot={snapshot} />
      ) : (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>股票代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="text-right">当前价</TableHead>
                <TableHead className="text-right">区间高点</TableHead>
                <SortHeader
                  label="当前/高点"
                  sortKey="currentHighRatio"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortHeader
                  label="下跌幅度"
                  sortKey="drawdownPct"
                  sort={sort}
                  onSort={handleSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isSelected = row.tsCode === effectiveSelectedTsCode;

                return (
                  <Fragment key={row.tsCode}>
                    <TableRow
                      tabIndex={0}
                      aria-selected={isSelected}
                      aria-expanded={isSelected}
                      className={cn(
                        "cursor-pointer outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60",
                        isSelected ? "bg-muted/50" : "",
                      )}
                      onClick={() => toggleSelectedRow(row.tsCode)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleSelectedRow(row.tsCode);
                        }
                      }}
                    >
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
                    </TableRow>
                    {isSelected ? (
                      <TableRow
                        data-testid={`stock-chart-row-${row.tsCode}`}
                        className="hover:bg-transparent"
                      >
                        <TableCell
                          colSpan={6}
                          className="whitespace-normal bg-muted/20 p-3 sm:p-4"
                        >
                          <StockKlineChart tsCode={row.tsCode} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
