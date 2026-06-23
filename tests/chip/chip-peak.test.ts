// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  extractChipPeak,
  mapCyqChipsTable,
} from "@/lib/chip/chip-peak";
import type { TushareDataTable } from "@/lib/tushare/types";

function table(items: unknown[][]): TushareDataTable {
  return {
    fields: ["ts_code", "trade_date", "price", "percent"],
    items,
  };
}

describe("chip peak extraction", () => {
  it("maps official cyq_chips rows to typed distribution rows", () => {
    const rows = mapCyqChipsTable(
      table([["000001.SZ", "20260211", 12.4, 3.21]]),
    );

    expect(rows).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260211",
        price: 12.4,
        percent: 3.21,
      },
    ]);
  });

  it("extracts the highest-percent price from the latest trade date", () => {
    const peak = extractChipPeak(
      mapCyqChipsTable(
        table([
          ["000001.SZ", "20260210", 10, 8],
          ["000001.SZ", "20260211", 9.8, 2],
          ["000001.SZ", "20260211", 10.2, 6],
          ["000001.SZ", "20260211", 10.4, 4],
        ]),
      ),
    );

    expect(peak).toEqual({
      tsCode: "000001.SZ",
      tradeDate: "20260211",
      chipPeakPrice: 10.2,
      peakPercent: 6,
      source: "cyq_chips_highest_percent",
    });
  });

  it("uses lower price as deterministic tie-break", () => {
    const peak = extractChipPeak(
      mapCyqChipsTable(
        table([
          ["000001.SZ", "20260211", 10.4, 6],
          ["000001.SZ", "20260211", 10.2, 6],
        ]),
      ),
    );

    expect(peak.chipPeakPrice).toBe(10.2);
  });

  it("fails on empty official rows instead of estimating", () => {
    expect(() => extractChipPeak([])).toThrow("empty_chip_distribution");
    expect(() => mapCyqChipsTable(table([["000001.SZ", "20260211", null, 1]])))
      .toThrow("invalid_chip_price");
  });
});
