import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { StatusWorkspace } from "@/components/status/status-workspace";
import type { ResultsSnapshot } from "@/lib/results/results-types";
import type {
  RefreshOperation,
  RefreshStageSnapshot,
  RefreshStatusSnapshot,
} from "@/lib/refresh/refresh-types";
import { EMPTY_REFRESH_STATUS } from "@/lib/refresh/refresh-types";
import { EMPTY_VALIDATION_SNAPSHOT } from "@/lib/validation-types";

const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

function stage(
  input: Partial<RefreshStageSnapshot> & Pick<RefreshStageSnapshot, "stage">,
): RefreshStageSnapshot {
  const labels = {
    stock_list: "股票列表",
    market_data: "行情/复权",
    screening: "筛选",
    chip: "筹码处理",
  } as const;

  return {
    stage: input.stage,
    label: input.label ?? labels[input.stage],
    status: input.status ?? "pending",
    total: input.total ?? 0,
    completed: input.completed ?? 0,
    failed: input.failed ?? 0,
    retryCount: input.retryCount ?? 0,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    durationMs: input.durationMs ?? null,
    errorSummary: input.errorSummary ?? null,
  };
}

function stages(
  overrides: Partial<Record<RefreshStageSnapshot["stage"], Partial<RefreshStageSnapshot>>> = {},
) {
  return [
    stage({ stage: "stock_list", ...overrides.stock_list }),
    stage({ stage: "market_data", ...overrides.market_data }),
    stage({ stage: "screening", ...overrides.screening }),
    stage({ stage: "chip", ...overrides.chip }),
  ];
}

function operation(
  kind: RefreshOperation["kind"],
  status: RefreshOperation["status"] = "running",
): RefreshOperation {
  return {
    id: 1,
    kind,
    status,
    startedAt: "2026-06-29T00:00:00.000Z",
    finishedAt: status === "running" ? null : "2026-06-29T00:01:00.000Z",
    ownerRefreshJobId: null,
    errorSummary: null,
  };
}

function refreshStatus(
  overrides: Partial<RefreshStatusSnapshot> = {},
): RefreshStatusSnapshot {
  return {
    ...EMPTY_REFRESH_STATUS,
    stages: stages(),
    ...overrides,
  };
}

const readyResults: ResultsSnapshot = {
  status: "ready",
  summary: "最新筛选命中 1 只股票。",
  cacheSource: "normalized",
  sourceScreeningRunId: 1,
  screeningCreatedAt: "2026-06-29T00:00:00.000Z",
  chipPeakRunId: null,
  unavailableReason: null,
  rows: [
    {
      tsCode: "000001.SZ",
      name: "平安银行",
      latestTradeDate: "20260629",
      currentPrice: 8,
      intervalHigh: 10,
      intervalHighTradeDate: "20260620",
      currentHighRatio: 0.8,
      drawdownPct: 0.2,
      ma20: 8.5,
      ma60: 10,
      ma20Slope: -0.1,
      chipPeakState: "missing",
      chipPeakPrice: null,
      chipPeakTradeDate: null,
      chipPeakSource: null,
      chipPeaks: [],
      chipPeakErrorCategory: null,
      chipPeakErrorSummary: null,
    },
  ],
};

describe("StatusWorkspace", () => {
  afterEach(() => {
    cleanup();
    routerRefreshMock.mockReset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the stage panel and default incremental refresh CTA", () => {
    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={refreshStatus()}
        logoutAction={vi.fn()}
      />,
    );

    expect(screen.getByText("数据源状态")).toBeTruthy();
    expect(screen.getByText("尚未执行缓存刷新")).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始增量刷新" })).toBeTruthy();
    expect(screen.getByText("股票列表")).toBeTruthy();
    expect(screen.getByText("行情/复权")).toBeTruthy();
    expect(screen.getByText("筛选")).toBeTruthy();
    expect(screen.getByText("筹码处理")).toBeTruthy();
    expect(document.body.textContent).not.toContain("TUSHARE_TOKEN=");
  });

  it("renders failed stage counts and sanitized error summaries", () => {
    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={refreshStatus({
          stages: stages({
            market_data: {
              status: "failed",
              total: 120,
              completed: 119,
              failed: 1,
              durationMs: 90_000,
              errorSummary:
                "TUSHARE_TOKEN=secret failed at C:\\server\\refresh.sqlite market_cache_generations headers=abc",
            },
          }),
        })}
        logoutAction={vi.fn()}
      />,
    );

    expect(screen.getAllByText("失败").length).toBeGreaterThan(0);
    expect(screen.getByText("119/120")).toBeTruthy();
    expect(screen.getByText("脱敏原因：")).toBeTruthy();
    expect(document.body.textContent).not.toContain("TUSHARE_TOKEN");
    expect(document.body.textContent).not.toContain("refresh.sqlite");
    expect(document.body.textContent).not.toContain("market_cache_generations");
    expect(document.body.textContent).not.toContain("headers=abc");
  });

  it("starts manual incremental refresh and renders returned active status", async () => {
    const runningStatus = refreshStatus({
      activeOperation: operation("manual_refresh"),
      latestOperation: operation("manual_refresh"),
      hasActiveWork: true,
      isRunning: true,
      mode: "ordinary",
      stages: stages({
        stock_list: {
          status: "running",
          total: 5000,
          completed: 1000,
          durationMs: 20_000,
        },
      }),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ started: true, status: runningStatus }), {
        status: 202,
      }),
    );

    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={refreshStatus()}
        logoutAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始增量刷新" }));

    await waitFor(() => {
      expect(screen.getByText("刷新正在运行")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "刷新进行中" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/refresh/run", {
      method: "POST",
    });
  });

  it("polls while chip is active and refreshes on result and chip markers", async () => {
    vi.useFakeTimers();
    const chipRunning = refreshStatus({
      activeJob: null,
      activeOperation: operation("chip_background"),
      latestOperation: operation("chip_background"),
      hasActiveWork: true,
      resultVersion: "screening:1",
      chipVersion: null,
      stages: stages({
        chip: {
          status: "running",
          total: 10,
          completed: 2,
          durationMs: 10_000,
        },
      }),
    });
    const screeningPublished = {
      ...chipRunning,
      resultVersion: "screening:2",
    };
    const repeatedScreening = {
      ...screeningPublished,
    };
    const chipDone = refreshStatus({
      activeJob: null,
      activeOperation: null,
      latestOperation: {
        ...operation("chip_background", "succeeded"),
      },
      hasActiveWork: false,
      resultVersion: "screening:2",
      chipVersion: "chip:1",
      stages: stages({
        chip: {
          status: "partial",
          total: 10,
          completed: 10,
          failed: 2,
          durationMs: 30_000,
        },
      }),
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(screeningPublished), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(repeatedScreening), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(chipDone), { status: 200 }),
      );

    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={chipRunning}
        logoutAction={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(routerRefreshMock).toHaveBeenCalledTimes(2);
  });

  it("keeps published results visible while chip processing is partial", () => {
    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={refreshStatus({
          latestOperation: operation("chip_background", "succeeded"),
          chipVersion: "chip:partial",
          stages: stages({
            chip: {
              status: "partial",
              total: 3,
              completed: 3,
              failed: 1,
              errorSummary: "chip_partial:1",
            },
          }),
        })}
        initialResultsSnapshot={readyResults}
        logoutAction={vi.fn()}
      />,
    );

    expect(screen.getByText("筹码处理")).toBeTruthy();
    expect(screen.getByText("000001.SZ")).toBeTruthy();
    expect(screen.getByText("平安银行")).toBeTruthy();
  });

  it("blocks manual refresh during full rebuild without exposing a rebuild entry", () => {
    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={refreshStatus({
          activeOperation: operation("full_rebuild"),
          latestOperation: operation("full_rebuild"),
          hasActiveWork: true,
          stages: stages({
            stock_list: {
              status: "succeeded",
              total: 5000,
              completed: 5000,
            },
            market_data: {
              status: "running",
              total: 120,
              completed: 20,
              durationMs: 600_000,
            },
          }),
        })}
        logoutAction={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText("全量重建正在运行，暂不能启动普通刷新。").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "刷新进行中" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", {
        name: /全量重建|rebuild:market|重建市场缓存/,
      }),
    ).toBeNull();
    expect(document.body.textContent).not.toContain("rebuild:market");
  });
});
