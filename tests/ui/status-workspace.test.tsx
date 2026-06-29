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
import { EMPTY_REFRESH_STATUS } from "@/lib/refresh/refresh-types";
import { EMPTY_VALIDATION_SNAPSHOT } from "@/lib/validation-types";

const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

describe("StatusWorkspace", () => {
  afterEach(() => {
    cleanup();
    routerRefreshMock.mockReset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the empty state without raw secret details", () => {
    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={EMPTY_REFRESH_STATUS}
        logoutAction={vi.fn()}
      />,
    );

    expect(screen.getByText("数据源状态")).toBeTruthy();
    expect(screen.getByText("尚未执行缓存刷新")).toBeTruthy();
    expect(screen.getByText("尚未执行数据源验证")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "手动刷新缓存" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "重新验证数据源" }),
    ).toBeTruthy();
    expect(screen.queryByText("TUSHARE_TOKEN=")).toBeNull();
  });

  it("renders blocked chip candidate copy without approximating data", () => {
    render(
      <StatusWorkspace
        initialSnapshot={{
          overallStatus: "blocked",
          lastRunAt: "2026-06-23T00:00:00.000Z",
          summary: "筹码候选接口当前不可用。",
          sections: [
            {
              key: "chip_candidate",
              title: "筹码候选接口",
              status: "blocked",
              summary:
                "筹码候选接口当前不可用或权限不足；后续筹码峰功能保持阻塞，不使用估算值替代。",
            },
          ],
        }}
        initialRefreshStatus={EMPTY_REFRESH_STATUS}
        logoutAction={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText(
        "筹码候选接口当前不可用或权限不足；后续筹码峰功能保持阻塞，不使用估算值替代。",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("renders price-basis fallback risk copy", () => {
    render(
      <StatusWorkspace
        initialSnapshot={{
          overallStatus: "warning",
          lastRunAt: "2026-06-23T00:00:00.000Z",
          summary: "价格口径使用未复权 fallback。",
          sections: [
            {
              key: "price_basis",
              title: "行情价格口径",
              status: "warning",
              summary:
                "未能稳定获取前复权行情，当前验证结果退回未复权价格；后续筛选会显示该口径风险。",
              details: [
                { label: "basis", value: "unadjusted_daily" },
                { label: "fallback_risk", value: "ma_and_swing_high_shift" },
              ],
            },
          ],
        }}
        initialRefreshStatus={EMPTY_REFRESH_STATUS}
        logoutAction={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText(
        "未能稳定获取前复权行情，当前验证结果退回未复权价格；后续筛选会显示该口径风险。",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("starts manual refresh and renders returned running status", async () => {
    const runningStatus = {
      ...EMPTY_REFRESH_STATUS,
      activeJob: {
        id: 7,
        mode: "ordinary" as const,
        status: "running" as const,
        startedAt: "2026-06-23T00:00:00.000Z",
        finishedAt: null,
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
        errorSummary: null,
      },
      latestJob: {
        id: 7,
        mode: "ordinary" as const,
        status: "running" as const,
        startedAt: "2026-06-23T00:00:00.000Z",
        finishedAt: null,
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
        errorSummary: null,
      },
      latestSuccessfulJob: null,
      latestCacheStats: null,
      isRunning: true,
      mode: "ordinary" as const,
      lastSuccessfulFinishedAt: null,
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          started: true,
          status: runningStatus,
        }),
        { status: 202 },
      ),
    );

    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={EMPTY_REFRESH_STATUS}
        logoutAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "手动刷新缓存" }));

    await waitFor(() => {
      expect(screen.getByText("刷新正在运行")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/refresh/run", {
      method: "POST",
    });
  });

  it("renders the exact bootstrap state without exposing internal details", () => {
    const bootstrapStatus = {
      ...EMPTY_REFRESH_STATUS,
      activeJob: {
        id: 8,
        mode: "bootstrap" as const,
        status: "running" as const,
        startedAt: "2026-06-26T00:00:00.000Z",
        finishedAt: null,
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
        errorSummary: null,
      },
      latestJob: {
        id: 8,
        mode: "bootstrap" as const,
        status: "running" as const,
        startedAt: "2026-06-26T00:00:00.000Z",
        finishedAt: null,
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
        errorSummary: null,
      },
      latestSuccessfulJob: null,
      latestCacheStats: null,
      isRunning: true,
      mode: "bootstrap" as const,
      lastSuccessfulFinishedAt: null,
    };

    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={bootstrapStatus}
        logoutAction={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "正在初始化缓存" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("heading", { name: "正在初始化缓存" })).toBeTruthy();
    expect(
      screen.getByText(
        "正在重新获取最近 60 个交易日的数据。完成前继续显示旧缓存结果。",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("market_cache_generations");
    expect(document.body.textContent).not.toContain("refresh.sqlite");
    expect(document.body.textContent).not.toContain("TUSHARE_TOKEN");
  });

  it("refreshes server-rendered snapshots when a running refresh finishes", async () => {
    vi.useFakeTimers();
    const runningStatus = {
      ...EMPTY_REFRESH_STATUS,
      activeJob: {
        id: 7,
        mode: "ordinary" as const,
        status: "running" as const,
        startedAt: "2026-06-23T00:00:00.000Z",
        finishedAt: null,
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
        errorSummary: null,
      },
      latestJob: {
        id: 7,
        mode: "ordinary" as const,
        status: "running" as const,
        startedAt: "2026-06-23T00:00:00.000Z",
        finishedAt: null,
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
        errorSummary: null,
      },
      latestSuccessfulJob: null,
      latestCacheStats: null,
      isRunning: true,
      mode: "ordinary" as const,
      lastSuccessfulFinishedAt: null,
    };
    const completedStatus = {
      activeJob: null,
      latestJob: {
        ...runningStatus.latestJob,
        status: "succeeded" as const,
        finishedAt: "2026-06-23T00:02:00.000Z",
      },
      latestSuccessfulJob: {
        ...runningStatus.latestJob,
        status: "succeeded" as const,
        finishedAt: "2026-06-23T00:02:00.000Z",
      },
      latestCacheStats: {
        stockCount: 1,
        dailyBarCount: 60,
      },
      isRunning: false,
      mode: null,
      lastSuccessfulFinishedAt: "2026-06-23T00:02:00.000Z",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(completedStatus), { status: 200 }),
    );

    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        initialRefreshStatus={runningStatus}
        logoutAction={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(routerRefreshMock).toHaveBeenCalledOnce();
  });
});
