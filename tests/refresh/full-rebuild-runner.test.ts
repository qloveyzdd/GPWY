// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runFullMarketRebuild,
} from "@/lib/refresh/full-rebuild-runner";
import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  readActiveMarketCacheGeneration,
  readMarketCacheGenerationById,
  upsertMarketGenerationDate,
} from "@/lib/refresh/market-data-store";
import {
  readRefreshOperationSnapshot,
  startRefreshOperation,
} from "@/lib/refresh/refresh-store";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempMarketStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-full-rebuild-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function table(fields: string[], items: unknown[][]): TushareDataTable {
  return { fields, items };
}

function tradeDates(count = 60) {
  return Array.from(
    { length: count },
    (_, index) => `2026${String(index + 1).padStart(4, "0")}`,
  ).reverse();
}

function createActiveGeneration() {
  const generation = createMarketCacheGeneration({ targetTradeDateCount: 60 });

  for (const tradeDate of tradeDates()) {
    upsertMarketGenerationDate(generation.id, {
      tradeDate,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }

  return activateMarketCacheGeneration(generation.id);
}

function createRebuildClient({
  failFactorDate,
}: {
  failFactorDate?: string;
} = {}): TushareClientLike {
  return {
    query: vi.fn(
      async (
        endpoint: TushareEndpoint,
        params: Record<string, unknown> = {},
      ) => {
        if (endpoint.apiName === "stock_basic") {
          const status = String(params.list_status);

          return table(TUSHARE_ENDPOINTS.stockBasic.fields, [
            [`${status}.SZ`, status, "Main", status],
          ]);
        }

        if (endpoint.apiName === "trade_cal") {
          return table(
            TUSHARE_ENDPOINTS.tradeCalendar.fields,
            tradeDates().map((tradeDate) => [tradeDate, 1]),
          );
        }

        if (endpoint.apiName === "daily") {
          return table(TUSHARE_ENDPOINTS.daily.fields, [
            ["L.SZ", params.trade_date, 10, 11, 9, 10, 100],
          ]);
        }

        if (endpoint.apiName === "adj_factor") {
          if (String(params.trade_date) === failFactorDate) {
            throw new TypeError(
              "fetch failed at C:\\server\\private\\factor.ts",
            );
          }

          return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
            ["L.SZ", params.trade_date, 1],
          ]);
        }

        throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
      },
    ),
  };
}

describe("runFullMarketRebuild", () => {
  it("rebuilds a new generation atomically and records stage progress", async () => {
    useTempMarketStore();
    const previous = createActiveGeneration();
    const stages: string[] = [];

    const rebuild = await runFullMarketRebuild({
      client: createRebuildClient(),
      now: new Date("2026-06-29T00:00:00.000Z"),
      onStage: (stage) => {
        stages.push(`${stage.stage}:${stage.status}:${stage.completed}/${stage.total}`);
      },
    });
    const active = readActiveMarketCacheGeneration();
    const snapshot = readRefreshOperationSnapshot();

    expect(active?.id).toBe(rebuild.result.generationId);
    expect(active?.id).not.toBe(previous.id);
    expect(readMarketCacheGenerationById(previous.id)?.status).toBe("retired");
    expect(snapshot.latestOperation).toMatchObject({
      kind: "full_rebuild",
      status: "succeeded",
    });
    expect(snapshot.stages.find((stage) => stage.stage === "stock_list"))
      .toMatchObject({ status: "succeeded", total: 3, completed: 3 });
    expect(snapshot.stages.find((stage) => stage.stage === "market_data"))
      .toMatchObject({ status: "succeeded", total: 120, completed: 120 });
    expect(snapshot.stages.find((stage) => stage.stage === "screening"))
      .toMatchObject({ status: "skipped" });
    expect(snapshot.stages.find((stage) => stage.stage === "chip"))
      .toMatchObject({ status: "skipped" });
    expect(stages.some((stage) => stage.startsWith("stock_list:succeeded")))
      .toBe(true);
    expect(stages.some((stage) => stage.startsWith("market_data:succeeded")))
      .toBe(true);
  });

  it("keeps the previous active generation when rebuild fails", async () => {
    useTempMarketStore();
    const previous = createActiveGeneration();

    await expect(
      runFullMarketRebuild({
        client: createRebuildClient({ failFactorDate: tradeDates()[0] }),
      }),
    ).rejects.toThrow("network_or_service");

    const snapshot = readRefreshOperationSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(readActiveMarketCacheGeneration()?.id).toBe(previous.id);
    expect(readMarketCacheGenerationById(previous.id)?.status).toBe("active");
    expect(readMarketCacheGenerationById(previous.id + 1)).toBeNull();
    expect(snapshot.latestOperation).toMatchObject({
      kind: "full_rebuild",
      status: "failed",
    });
    expect(serialized).not.toContain("very-secret-token");
    expect(serialized).not.toContain("C:\\server\\private");
  });

  it("uses the shared operation lock", async () => {
    useTempMarketStore();

    startRefreshOperation("manual_refresh");

    await expect(
      runFullMarketRebuild({
        client: createRebuildClient(),
      }),
    ).rejects.toThrow("refresh_operation_already_running");
  });
});
