// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  readMarketDailyQuotes,
  upsertMarketDailyBasics,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
  upsertMarketStocks,
} from "@/lib/refresh/market-data-store";
import {
  readAdjustedChipModelBarsForStock,
  readAdjustedMarketBarsForStock,
  readAdjustedMarketData,
} from "@/lib/refresh/market-data-reader";
import type {
  AdjustmentFactorRecord,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempMarketStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-market-reader-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function createActiveGeneration() {
  const generation = createMarketCacheGeneration({ targetTradeDateCount: 60 });

  for (let index = 1; index <= 60; index += 1) {
    upsertMarketGenerationDate(generation.id, {
      tradeDate: `2026${String(index).padStart(4, "0")}`,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }

  return activateMarketCacheGeneration(generation.id);
}

function makeQuotes(tsCode: string, count: number, offset = 0) {
  const quotes: RawDailyQuoteRecord[] = [];
  const factors: AdjustmentFactorRecord[] = [];

  for (let index = 1; index <= count; index += 1) {
    const price = offset + index;
    const tradeDate = `2026${String(index).padStart(4, "0")}`;
    quotes.push({
      tsCode,
      tradeDate,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price + 0.5,
      vol: 1000 + index,
      amount: (price + 0.5) * (1000 + index) * 100 / 1000,
    });
    factors.push({
      tsCode,
      tradeDate,
      adjFactor: index,
    });
  }

  return { quotes, factors };
}

describe("market data reader", () => {
  it("uses each stock's latest factor and returns only its latest 60 bars", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();
    const first = makeQuotes("000001.SZ", 61);
    const second = makeQuotes("000002.SZ", 60, 100);

    upsertMarketStocks([
      {
        tsCode: "000001.SZ",
        name: "Listed One",
        market: "Main",
        listStatus: "L",
      },
      {
        tsCode: "000002.SZ",
        name: "Listed Two",
        market: "Main",
        listStatus: "L",
      },
      {
        tsCode: "000003.SZ",
        name: "Paused",
        market: "Main",
        listStatus: "P",
      },
    ]);
    upsertMarketDailyQuotes(generation.id, [
      ...first.quotes,
      ...second.quotes,
    ]);
    upsertMarketAdjustmentFactors(generation.id, [
      ...first.factors,
      ...second.factors,
    ]);

    const result = readAdjustedMarketData();
    const firstStock = result.stocks.find(
      ({ stock }) => stock.tsCode === "000001.SZ",
    );
    const secondStock = result.stocks.find(
      ({ stock }) => stock.tsCode === "000002.SZ",
    );

    expect(result.generationId).toBe(generation.id);
    expect(result.stocks).toHaveLength(2);
    expect(result.skips).toEqual([]);
    expect(firstStock?.bars).toHaveLength(60);
    expect(firstStock?.bars[0]).toMatchObject({
      tradeDate: "20260002",
      vol: 1002,
    });
    expect(firstStock?.bars[0]?.close).toBeCloseTo((2.5 * 2) / 61, 12);
    expect(firstStock?.bars.at(-1)?.close).toBe(61.5);
    expect(secondStock?.bars[0]?.close).toBeCloseTo(
      (101.5 * 1) / 60,
      8,
    );
    expect(readMarketDailyQuotes(generation.id)[0]?.close).toBe(1.5);
  });

  it("skips a stock when any selected bar lacks a valid factor", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();
    const missing = makeQuotes("000001.SZ", 60);
    const insufficient = makeQuotes("000002.SZ", 59);

    upsertMarketStocks([
      {
        tsCode: "000001.SZ",
        name: "Missing Factor",
        market: "Main",
        listStatus: "L",
      },
      {
        tsCode: "000002.SZ",
        name: "Insufficient Bars",
        market: "Main",
        listStatus: "L",
      },
    ]);
    upsertMarketDailyQuotes(generation.id, [
      ...missing.quotes,
      ...insufficient.quotes,
    ]);
    upsertMarketAdjustmentFactors(generation.id, [
      ...missing.factors.slice(0, -1),
      ...insufficient.factors,
    ]);

    const result = readAdjustedMarketData();

    expect(result.skips).toEqual([
      {
        tsCode: "000001.SZ",
        reason: "missing_adjustment_factor",
        availableBars: 60,
      },
    ]);
    expect(result.stocks).toHaveLength(1);
    expect(result.stocks[0]?.stock.tsCode).toBe("000002.SZ");
    expect(result.stocks[0]?.bars).toHaveLength(59);
  });

  it("uses only the provided target trade-date window when a generation has extra history", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();
    const targetWindow = Array.from({ length: 60 }, (_, index) =>
      `2026${String(index + 1).padStart(4, "0")}`,
    );
    const target = makeQuotes("000001.SZ", 60);
    const extraTradeDate = "20269999";

    upsertMarketGenerationDate(generation.id, {
      tradeDate: extraTradeDate,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
    upsertMarketStocks([
      {
        tsCode: "000001.SZ",
        name: "Listed One",
        market: "Main",
        listStatus: "L",
      },
    ]);
    upsertMarketDailyQuotes(generation.id, [
      ...target.quotes,
      {
        tsCode: "000001.SZ",
        tradeDate: extraTradeDate,
        open: 999,
        high: 1000,
        low: 998,
        close: 999,
        vol: 999,
      },
    ]);
    upsertMarketAdjustmentFactors(generation.id, [
      ...target.factors,
      {
        tsCode: "000001.SZ",
        tradeDate: extraTradeDate,
        adjFactor: 999,
      },
    ]);

    const result = readAdjustedMarketData({
      generationId: generation.id,
      tradeDates: targetWindow,
    });
    const bars = result.stocks[0]?.bars ?? [];

    expect(bars).toHaveLength(60);
    expect(bars[0]?.tradeDate).toBe("20260001");
    expect(bars.at(-1)?.tradeDate).toBe("20260060");
    expect(bars.some((bar) => bar.tradeDate === extraTradeDate)).toBe(false);
  });

  it("reads an exact generation for chart provenance without filtering stock status", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();
    const data = makeQuotes("000003.SZ", 2);

    upsertMarketStocks([
      {
        tsCode: "000003.SZ",
        name: "Delisted Result",
        market: "Main",
        listStatus: "D",
      },
    ]);
    upsertMarketDailyQuotes(generation.id, data.quotes);
    upsertMarketAdjustmentFactors(generation.id, data.factors);

    expect(
      readAdjustedMarketBarsForStock(generation.id, "000003.SZ"),
    ).toHaveLength(2);
    expect(readAdjustedMarketData().stocks).toEqual([]);
  });

  it("reads adjusted chip model bars with average price and free-float turnover", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();

    upsertMarketDailyQuotes(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        open: 10,
        high: 12,
        low: 8,
        close: 11,
        vol: 1000,
        amount: 1100,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260002",
        open: 12,
        high: 14,
        low: 10,
        close: 13,
        vol: 1000,
        amount: 1200,
      },
    ]);
    upsertMarketAdjustmentFactors(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        adjFactor: 2,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260002",
        adjFactor: 4,
      },
    ]);
    upsertMarketDailyBasics(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260002",
        turnoverRate: 2.4,
        turnoverRateFreeFloat: null,
      },
    ]);

    expect(
      readAdjustedChipModelBarsForStock({
        generationId: generation.id,
        tsCode: "000001.SZ",
        startTradeDate: "20260001",
        endTradeDate: "20260002",
      }),
    ).toEqual([
      expect.objectContaining({
        tradeDate: "20260001",
        open: 5,
        high: 6,
        low: 4,
        close: 5.5,
        averagePrice: 5.5,
        turnoverRate: 1.7,
        adjFactor: 2,
      }),
      expect.objectContaining({
        tradeDate: "20260002",
        open: 12,
        high: 14,
        low: 10,
        close: 13,
        averagePrice: 12,
        turnoverRate: 2.4,
        adjFactor: 4,
      }),
    ]);
  });

  it("fills suspended intermediate chip model dates as zero-turnover bars", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();

    upsertMarketDailyQuotes(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        open: 10,
        high: 12,
        low: 8,
        close: 11,
        vol: 1000,
        amount: 1100,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260003",
        open: 12,
        high: 14,
        low: 10,
        close: 13,
        vol: 1200,
        amount: 1440,
      },
    ]);
    upsertMarketAdjustmentFactors(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        adjFactor: 1,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260002",
        adjFactor: 1,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260003",
        adjFactor: 1,
      },
    ]);
    upsertMarketDailyBasics(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260003",
        turnoverRate: 2.4,
        turnoverRateFreeFloat: null,
      },
    ]);

    expect(
      readAdjustedChipModelBarsForStock({
        generationId: generation.id,
        tsCode: "000001.SZ",
        startTradeDate: "20260001",
        endTradeDate: "20260003",
        expectedTradeDates: ["20260001", "20260002", "20260003"],
      }),
    ).toEqual([
      expect.objectContaining({
        tradeDate: "20260001",
        close: 11,
        turnoverRate: 1.7,
      }),
      expect.objectContaining({
        tradeDate: "20260002",
        open: 11,
        high: 11,
        low: 11,
        close: 11,
        vol: 0,
        amount: null,
        averagePrice: 11,
        turnoverRate: 0,
        adjFactor: 1,
      }),
      expect.objectContaining({
        tradeDate: "20260003",
        close: 13,
        turnoverRate: 2.4,
      }),
    ]);
  });

  it("does not fill a suspended target date for chip model bars", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();

    upsertMarketDailyQuotes(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        open: 10,
        high: 12,
        low: 8,
        close: 11,
        vol: 1000,
        amount: 1100,
      },
    ]);
    upsertMarketAdjustmentFactors(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        adjFactor: 1,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260002",
        adjFactor: 1,
      },
    ]);
    upsertMarketDailyBasics(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
    ]);

    expect(() =>
      readAdjustedChipModelBarsForStock({
        generationId: generation.id,
        tsCode: "000001.SZ",
        startTradeDate: "20260001",
        endTradeDate: "20260002",
        expectedTradeDates: ["20260001", "20260002"],
      }),
    ).toThrow("missing_daily_quote");
  });

  it("blocks chip model bars when turnover or adjustment factor is missing", () => {
    useTempMarketStore();
    const generation = createActiveGeneration();

    upsertMarketDailyQuotes(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        open: 10,
        high: 12,
        low: 8,
        close: 11,
        vol: 1000,
        amount: 1100,
      },
    ]);

    expect(() =>
      readAdjustedChipModelBarsForStock({
        generationId: generation.id,
        tsCode: "000001.SZ",
        startTradeDate: "20260001",
        endTradeDate: "20260001",
      }),
    ).toThrow("missing_adjustment_factor");

    upsertMarketAdjustmentFactors(generation.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260001",
        adjFactor: 1,
      },
    ]);

    expect(() =>
      readAdjustedChipModelBarsForStock({
        generationId: generation.id,
        tsCode: "000001.SZ",
        startTradeDate: "20260001",
        endTradeDate: "20260001",
      }),
    ).toThrow("missing_turnover_rate");
  });
});
