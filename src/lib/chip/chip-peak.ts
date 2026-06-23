import type {
  ChipDistributionRow,
  ChipPeakExtraction,
} from "@/lib/chip/chip-types";
import type { TushareDataTable } from "@/lib/tushare/types";

function mapRow(fields: string[], row: unknown[]) {
  return Object.fromEntries(fields.map((field, index) => [field, row[index]]));
}

function requiredString(value: unknown, errorCode: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(errorCode);
}

function requiredNumber(value: unknown, errorCode: string) {
  if (value === null || value === undefined || value === "") {
    throw new Error(errorCode);
  }

  const numberValue = Number(value);

  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  throw new Error(errorCode);
}

export function mapCyqChipsTable(
  table: TushareDataTable,
): ChipDistributionRow[] {
  return table.items.map((row) => {
    const mapped = mapRow(table.fields, row);

    return {
      tsCode: requiredString(mapped.ts_code, "invalid_chip_ts_code"),
      tradeDate: requiredString(mapped.trade_date, "invalid_chip_trade_date"),
      price: requiredNumber(mapped.price, "invalid_chip_price"),
      percent: requiredNumber(mapped.percent, "invalid_chip_percent"),
    };
  });
}

export function extractChipPeak(
  rows: ChipDistributionRow[],
): ChipPeakExtraction {
  if (!rows.length) {
    throw new Error("empty_chip_distribution");
  }

  const latestTradeDate = rows.reduce(
    (latest, row) => (row.tradeDate > latest ? row.tradeDate : latest),
    rows[0].tradeDate,
  );
  const latestRows = rows.filter((row) => row.tradeDate === latestTradeDate);
  const peak = latestRows.reduce((currentPeak, row) => {
    if (row.percent > currentPeak.percent) {
      return row;
    }

    if (row.percent === currentPeak.percent && row.price < currentPeak.price) {
      return row;
    }

    return currentPeak;
  }, latestRows[0]);

  return {
    tsCode: peak.tsCode,
    tradeDate: peak.tradeDate,
    chipPeakPrice: peak.price,
    peakPercent: peak.percent,
    source: "cyq_chips_highest_percent",
  };
}
