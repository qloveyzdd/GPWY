// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  readMarketDailyQuotes,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
  upsertMarketStocks,
} from "@/lib/refresh/market-data-store";
import {
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
      close: (2.5 * 2) / 61,
      vol: 1002,
    });
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
});
