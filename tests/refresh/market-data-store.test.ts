// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateMarketCacheGeneration,
  assertActiveGenerationReadyForScreening,
  createMarketCacheGeneration,
  deleteBuildingMarketCacheGeneration,
  ensureMarketGenerationDates,
  planActiveGenerationMarketWork,
  readActiveMarketCacheGeneration,
  readMarketAdjustmentFactors,
  readMarketCacheGenerationById,
  readMarketDailyBasics,
  readMarketDailyQuotes,
  readMarketGenerationDates,
  readMarketStocks,
  readPairedSuccessTradeDates,
  updateMarketGenerationDateItemStatus,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyBasics,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
  upsertMarketStocks,
  validateMarketCacheGeneration,
} from "@/lib/refresh/market-data-store";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempMarketStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-market-store-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function markCompleteDates(generationId: number, count = 60) {
  for (let index = 1; index <= count; index += 1) {
    upsertMarketGenerationDate(generationId, {
      tradeDate: `2026${String(index).padStart(4, "0")}`,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }
}

describe("market data store", () => {
  it("upserts normalized rows by natural key and retains stock history", () => {
    useTempMarketStore();
    const generation = createMarketCacheGeneration({
      targetTradeDateCount: 60,
      now: new Date("2026-06-26T00:00:00.000Z"),
    });

    upsertMarketStocks([
      {
        tsCode: "000001.SZ",
        name: "Listed",
        market: "Main",
        listStatus: "L",
      },
      {
        tsCode: "000002.SZ",
        name: "Paused",
        market: "Main",
        listStatus: "P",
      },
      {
        tsCode: "000003.SZ",
        name: "Delisted",
        market: "Main",
        listStatus: "D",
      },
    ]);
    upsertMarketStocks([
      {
        tsCode: "000001.SZ",
        name: "Listed Renamed",
        market: "Main",
        listStatus: "L",
      },
    ]);

    upsertMarketDailyQuotes(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        vol: 100,
        amount: 105,
      },
    ]);
    upsertMarketDailyQuotes(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        open: 20,
        high: 21,
        low: 19,
        close: 20.5,
        vol: 200,
        amount: 410,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260626",
        open: 21,
        high: 22,
        low: 20,
        close: 21.5,
        vol: 300,
        amount: 645,
      },
    ]);

    upsertMarketAdjustmentFactors(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        adjFactor: 1,
      },
    ]);
    upsertMarketAdjustmentFactors(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        adjFactor: 1.1,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260626",
        adjFactor: 1.2,
      },
    ]);

    expect(readMarketStocks()).toEqual([
      {
        tsCode: "000001.SZ",
        name: "Listed Renamed",
        market: "Main",
        listStatus: "L",
      },
      {
        tsCode: "000002.SZ",
        name: "Paused",
        market: "Main",
        listStatus: "P",
      },
      {
        tsCode: "000003.SZ",
        name: "Delisted",
        market: "Main",
        listStatus: "D",
      },
    ]);
    expect(readMarketDailyQuotes(generation.id)).toHaveLength(2);
    expect(readMarketDailyQuotes(generation.id)[0]?.close).toBe(20.5);
    expect(readMarketDailyQuotes(generation.id)[0]?.amount).toBe(410);
    expect(readMarketAdjustmentFactors(generation.id)).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        adjFactor: 1.1,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260626",
        adjFactor: 1.2,
      },
    ]);
  });

  it("stores daily basic turnover records by generation and natural key", () => {
    useTempMarketStore();
    const generation = createMarketCacheGeneration({
      targetTradeDateCount: 60,
      now: new Date("2026-06-26T00:00:00.000Z"),
    });

    upsertMarketDailyBasics(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
    ]);
    upsertMarketDailyBasics(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        turnoverRate: 2.4,
        turnoverRateFreeFloat: null,
      },
      {
        tsCode: "000002.SZ",
        tradeDate: "20260625",
        turnoverRate: 1.2,
        turnoverRateFreeFloat: 0.9,
      },
    ]);

    expect(readMarketDailyBasics(generation.id)).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        turnoverRate: 2.4,
        turnoverRateFreeFloat: null,
      },
      {
        tsCode: "000002.SZ",
        tradeDate: "20260625",
        turnoverRate: 1.2,
        turnoverRateFreeFloat: 0.9,
      },
    ]);
  });

  it("rejects incomplete generations and atomically retires the previous active generation", () => {
    useTempMarketStore();
    const first = createMarketCacheGeneration({ targetTradeDateCount: 60 });

    markCompleteDates(first.id, 59);
    expect(validateMarketCacheGeneration(first.id)).toMatchObject({
      actualTradeDateCount: 59,
      pairedSuccessCount: 59,
      complete: false,
    });
    expect(() => activateMarketCacheGeneration(first.id)).toThrow(
      "market_generation_incomplete",
    );
    expect(readActiveMarketCacheGeneration()).toBeNull();

    upsertMarketGenerationDate(first.id, {
      tradeDate: "20260060",
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
    const firstActive = activateMarketCacheGeneration(
      first.id,
      new Date("2026-06-26T01:00:00.000Z"),
    );
    expect(firstActive.status).toBe("active");
    expect(readActiveMarketCacheGeneration()?.id).toBe(first.id);

    const second = createMarketCacheGeneration({ targetTradeDateCount: 60 });
    markCompleteDates(second.id);
    activateMarketCacheGeneration(
      second.id,
      new Date("2026-06-26T02:00:00.000Z"),
    );

    expect(readActiveMarketCacheGeneration()?.id).toBe(second.id);
    expect(readMarketCacheGenerationById(first.id)?.status).toBe("retired");
    expect(readMarketCacheGenerationById(second.id)?.status).toBe("active");
  });

  it("deletes only a failed building generation and leaves active data intact", () => {
    useTempMarketStore();
    const active = createMarketCacheGeneration({ targetTradeDateCount: 60 });
    markCompleteDates(active.id);
    activateMarketCacheGeneration(active.id);
    upsertMarketDailyQuotes(active.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260625",
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        vol: 100,
        amount: 100,
      },
    ]);

    const building = createMarketCacheGeneration({ targetTradeDateCount: 60 });
    upsertMarketGenerationDate(building.id, {
      tradeDate: "20260626",
      dailyStatus: "succeeded",
      factorStatus: "failed",
    });
    upsertMarketDailyQuotes(building.id, [
      {
        tsCode: "000002.SZ",
        tradeDate: "20260626",
        open: 20,
        high: 21,
        low: 19,
        close: 20,
        vol: 200,
        amount: 400,
      },
    ]);
    upsertMarketDailyBasics(building.id, [
      {
        tsCode: "000002.SZ",
        tradeDate: "20260626",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
    ]);
    upsertMarketAdjustmentFactors(building.id, [
      {
        tsCode: "000002.SZ",
        tradeDate: "20260626",
        adjFactor: 2,
      },
    ]);

    expect(deleteBuildingMarketCacheGeneration(building.id)).toBe(true);
    expect(readMarketCacheGenerationById(building.id)).toBeNull();
    expect(readMarketGenerationDates(building.id)).toEqual([]);
    expect(readMarketDailyQuotes(building.id)).toEqual([]);
    expect(readMarketDailyBasics(building.id)).toEqual([]);
    expect(readMarketAdjustmentFactors(building.id)).toEqual([]);
    expect(readActiveMarketCacheGeneration()?.id).toBe(active.id);
    expect(readMarketDailyQuotes(active.id)).toHaveLength(1);
    expect(deleteBuildingMarketCacheGeneration(active.id)).toBe(false);
  });

  it("plans missing and failed active-generation daily/factor work independently", () => {
    useTempMarketStore();
    const generation = createMarketCacheGeneration({ targetTradeDateCount: 60 });
    markCompleteDates(generation.id);
    activateMarketCacheGeneration(generation.id);

    ensureMarketGenerationDates(generation.id, [
      "20260625",
      "20260626",
      "20260627",
      "20260628",
    ]);
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260626",
      "daily",
      "succeeded",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260626",
      "factor",
      "failed",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260627",
      "daily",
      "failed",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260627",
      "factor",
      "succeeded",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260628",
      "daily",
      "succeeded",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260628",
      "factor",
      "succeeded",
    );

    const plan = planActiveGenerationMarketWork(generation.id, [
      "20260625",
      "20260626",
      "20260627",
      "20260628",
    ]);

    expect(plan.ready).toBe(false);
    expect(plan.items).toEqual([
      {
        generationId: generation.id,
        tradeDate: "20260625",
        itemKind: "daily",
        currentStatus: "pending",
      },
      {
        generationId: generation.id,
        tradeDate: "20260625",
        itemKind: "factor",
        currentStatus: "pending",
      },
      {
        generationId: generation.id,
        tradeDate: "20260626",
        itemKind: "factor",
        currentStatus: "failed",
      },
      {
        generationId: generation.id,
        tradeDate: "20260627",
        itemKind: "daily",
        currentStatus: "failed",
      },
    ]);
    expect(readPairedSuccessTradeDates(generation.id, plan.targetTradeDates)).toEqual([
      "20260628",
    ]);
    expect(() =>
      assertActiveGenerationReadyForScreening(
        generation.id,
        plan.targetTradeDates,
      ),
    ).toThrow("active_generation_target_incomplete");

    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260625",
      "daily",
      "succeeded",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260625",
      "factor",
      "succeeded",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260626",
      "factor",
      "succeeded",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260627",
      "daily",
      "succeeded",
    );

    expect(
      planActiveGenerationMarketWork(generation.id, plan.targetTradeDates),
    ).toMatchObject({
      ready: true,
      items: [],
      missingDailyCount: 0,
      missingFactorCount: 0,
    });
    expect(() =>
      assertActiveGenerationReadyForScreening(
        generation.id,
        plan.targetTradeDates,
      ),
    ).not.toThrow();
  });

  it("updates one manifest item without overwriting the paired item status", () => {
    useTempMarketStore();
    const generation = createMarketCacheGeneration({ targetTradeDateCount: 60 });

    ensureMarketGenerationDates(generation.id, ["20260625"]);
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260625",
      "daily",
      "succeeded",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260625",
      "factor",
      "failed",
    );
    updateMarketGenerationDateItemStatus(
      generation.id,
      "20260625",
      "daily",
      "failed",
    );

    expect(readMarketGenerationDates(generation.id)).toEqual([
      expect.objectContaining({
        tradeDate: "20260625",
        dailyStatus: "failed",
        factorStatus: "failed",
      }),
    ]);
  });
});
