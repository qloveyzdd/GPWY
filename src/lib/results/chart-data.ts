import {
  readCalculatedChipDistribution,
  readCalculatedChipModelStatusesForRun,
  readLatestCalculatedChipModelRun,
} from "@/lib/chip/chip-model-store";
import {
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
} from "@/lib/chip/chip-model";
import {
  readChipDistributionForDate,
  readChipDistributionStatusesForRun,
  readLatestChipDistributionRun,
} from "@/lib/chip/chip-store";
import type {
  CalculatedChipModelStatusRecord,
  ChipCalculatedDistributionLevel,
  ChipDecayCoefficient,
  ChipDistributionLevel,
  ChipDistributionStatusRecord,
  ChipDistributionTargetKind,
} from "@/lib/chip/chip-types";
import { readDailyBarsForRefreshJob } from "@/lib/refresh/refresh-store";
import { readAdjustedMarketBarsForStock } from "@/lib/refresh/market-data-reader";
import { readLatestResultsSnapshot } from "@/lib/results/results-snapshot";
import type {
  ChartChipDistributionLevel,
  ChartChipDistributionPanel,
  ChartChipDistributions,
  ChartCalculatedChipDistributionPanel,
  ChartCalculatedChipDistributions,
  ChartDailyBar,
  ChartUnavailableReason,
  ChartMovingAveragePoint,
  ChartSnapshot,
} from "@/lib/results/chart-types";
import { calculateMovingAverageSeries } from "@/lib/screening/indicators";
import { readScreeningRunById } from "@/lib/screening/screening-store";
import type { ScreeningDailyBar } from "@/lib/screening/screening-types";

const tokenAssignmentPattern =
  /\b([A-Z_]*(?:TOKEN|SECRET|PASSWORD|KEY)[A-Z_]*)\s*=\s*[^\s,;]+/gi;
const localPathPattern = /[A-Za-z]:\\[^\s,;]+/g;
const headerPattern = /\b(?:authorization|cookie|set-cookie)\s*:\s*[^\s,;]+/gi;
const secretLikePattern = /\b(?:Bearer|Token)\s+[A-Za-z0-9._~+/=-]+/gi;

function toChartBar(bar: ScreeningDailyBar): ChartDailyBar {
  return {
    tradeDate: bar.tradeDate,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    vol: bar.vol,
  };
}

function toDistributionLevel(
  level: Pick<ChipDistributionLevel, "price" | "percent">,
): ChartChipDistributionLevel {
  return {
    price: level.price,
    percent: level.percent,
  };
}

function toChartMaPoint(point: {
  tradeDate: string;
  value: number;
}): ChartMovingAveragePoint {
  return {
    tradeDate: point.tradeDate,
    value: point.value,
  };
}

function sanitizeErrorSummary(summary: string | null) {
  if (summary === null) {
    return null;
  }

  return summary
    .replace(tokenAssignmentPattern, "$1=[redacted]")
    .replace(localPathPattern, "[redacted-path]")
    .replace(headerPattern, "[redacted-header]")
    .replace(secretLikePattern, "[redacted]");
}

function targetLabel(targetKind: ChipDistributionTargetKind) {
  return targetKind === "previous" ? "前一有效交易日" : "最新有效交易日";
}

function findPreviousTradeDate(
  bars: ScreeningDailyBar[],
  latestTradeDate: string,
) {
  const latestIndex = bars.findIndex((bar) => bar.tradeDate === latestTradeDate);

  if (latestIndex <= 0) {
    return null;
  }

  return bars[latestIndex - 1].tradeDate;
}

function findStatus(
  statuses: ChipDistributionStatusRecord[],
  targetKind: ChipDistributionTargetKind,
) {
  return statuses.find((status) => status.targetKind === targetKind);
}

function findCalculatedStatus(
  statuses: CalculatedChipModelStatusRecord[],
  targetKind: ChipDistributionTargetKind,
  decayCoefficient: ChipDecayCoefficient,
) {
  return statuses.find(
    (status) =>
      status.targetKind === targetKind &&
      status.decayCoefficient === decayCoefficient,
  );
}

function maxDistributionLevel(levels: ChartChipDistributionLevel[]) {
  return [...levels].sort((left, right) => {
    const percentDiff = right.percent - left.percent;

    if (percentDiff !== 0) {
      return percentDiff;
    }

    return left.price - right.price;
  })[0] ?? null;
}

function buildMissingPanel(
  targetKind: ChipDistributionTargetKind,
  tradeDate: string | null,
): ChartChipDistributionPanel {
  return {
    targetKind,
    label: targetLabel(targetKind),
    tradeDate,
    status: "missing",
    levels: [],
    maxLevel: null,
    errorCategory: null,
    errorSummary:
      targetKind === "previous" && tradeDate === null
        ? "previous_trade_date_missing"
        : null,
  };
}

function buildDistributionPanel(
  targetKind: ChipDistributionTargetKind,
  status: ChipDistributionStatusRecord | undefined,
  fallbackTradeDate: string | null,
): ChartChipDistributionPanel {
  if (!status) {
    return buildMissingPanel(targetKind, fallbackTradeDate);
  }

  if (status.status !== "succeeded" || status.tradeDate === null) {
    return {
      targetKind,
      label: targetLabel(targetKind),
      tradeDate: status.tradeDate ?? fallbackTradeDate,
      status: status.status,
      levels: [],
      maxLevel: null,
      errorCategory: status.errorCategory,
      errorSummary: sanitizeErrorSummary(status.errorSummary),
    };
  }

  const levels = readChipDistributionForDate(
    status.tsCode,
    status.tradeDate,
  ).map(toDistributionLevel);

  if (levels.length === 0) {
    return {
      targetKind,
      label: targetLabel(targetKind),
      tradeDate: status.tradeDate,
      status: "blocked",
      levels: [],
      maxLevel: null,
      errorCategory: "empty_data",
      errorSummary: "chip distribution cache has no levels for target date",
    };
  }

  return {
    targetKind,
    label: targetLabel(targetKind),
    tradeDate: status.tradeDate,
    status: "succeeded",
    levels,
    maxLevel: maxDistributionLevel(levels),
    errorCategory: null,
    errorSummary: null,
  };
}

function buildCalculatedMissingPanel({
  targetKind,
  targetTradeDate,
  decayCoefficient,
}: {
  targetKind: ChipDistributionTargetKind;
  targetTradeDate: string | null;
  decayCoefficient: ChipDecayCoefficient;
}): ChartCalculatedChipDistributionPanel {
  return {
    targetKind,
    label: targetLabel(targetKind),
    targetTradeDate,
    seedTradeDate: null,
    status: "missing",
    decayCoefficient,
    modelVersion: CHIP_MODEL_VERSION,
    levels: [],
    maxLevel: null,
    unavailableReason: "missing_trade_data",
    errorCategory: null,
    errorSummary:
      targetKind === "previous" && targetTradeDate === null
        ? "previous_trade_date_missing"
        : null,
  };
}

function buildCalculatedPanel({
  targetKind,
  status,
  fallbackTargetTradeDate,
  decayCoefficient,
}: {
  targetKind: ChipDistributionTargetKind;
  status: CalculatedChipModelStatusRecord | undefined;
  fallbackTargetTradeDate: string | null;
  decayCoefficient: ChipDecayCoefficient;
}): ChartCalculatedChipDistributionPanel {
  if (!status) {
    return buildCalculatedMissingPanel({
      targetKind,
      targetTradeDate: fallbackTargetTradeDate,
      decayCoefficient,
    });
  }

  const base = {
    targetKind,
    label: targetLabel(targetKind),
    targetTradeDate: status.targetTradeDate ?? fallbackTargetTradeDate,
    seedTradeDate: status.seedTradeDate,
    decayCoefficient,
    modelVersion: status.modelVersion,
  };

  if (
    status.status !== "succeeded" ||
    status.targetTradeDate === null ||
    status.seedTradeDate === null
  ) {
    return {
      ...base,
      status: status.status,
      levels: [],
      maxLevel: null,
      unavailableReason: status.unavailableReason,
      errorCategory: status.errorCategory,
      errorSummary: sanitizeErrorSummary(status.errorSummary),
    };
  }

  const levels = readCalculatedChipDistribution({
    tsCode: status.tsCode,
    targetTradeDate: status.targetTradeDate,
    seedTradeDate: status.seedTradeDate,
    decayCoefficient,
    modelVersion: status.modelVersion,
  }).map((level: ChipCalculatedDistributionLevel) =>
    toDistributionLevel(level),
  );

  if (levels.length === 0) {
    return {
      ...base,
      status: "blocked",
      levels: [],
      maxLevel: null,
      unavailableReason: "missing_trade_data",
      errorCategory: "empty_data",
      errorSummary: "calculated chip distribution cache has no levels",
    };
  }

  return {
    ...base,
    status: "succeeded",
    levels,
    maxLevel: maxDistributionLevel(levels),
    unavailableReason: null,
    errorCategory: null,
    errorSummary: null,
  };
}

function withSharedScale(panels: {
  previous: ChartChipDistributionPanel;
  latest: ChartChipDistributionPanel;
}): ChartChipDistributions {
  const successfulLevels = [panels.previous, panels.latest]
    .filter((panel) => panel.status === "succeeded")
    .flatMap((panel) => panel.levels);
  const priceLevels = Array.from(
    new Set(successfulLevels.map((level) => level.price)),
  ).sort((left, right) => left - right);
  const maxPercent = successfulLevels.reduce(
    (max, level) => Math.max(max, level.percent),
    0,
  );

  return {
    previous: panels.previous,
    latest: panels.latest,
    scale: {
      priceLevels,
      maxPercent,
    },
  };
}

function calculatedWithSharedScale(
  decayCoefficient: ChipDecayCoefficient,
  panels: {
    previous: ChartCalculatedChipDistributionPanel;
    latest: ChartCalculatedChipDistributionPanel;
  },
) {
  const successfulLevels = [panels.previous, panels.latest]
    .filter((panel) => panel.status === "succeeded")
    .flatMap((panel) => panel.levels);
  const priceLevels = Array.from(
    new Set(successfulLevels.map((level) => level.price)),
  ).sort((left, right) => left - right);
  const maxPercent = successfulLevels.reduce(
    (max, level) => Math.max(max, level.percent),
    0,
  );

  return {
    decayCoefficient,
    previous: panels.previous,
    latest: panels.latest,
    scale: {
      priceLevels,
      maxPercent,
    },
  };
}

function buildChipDistributions(
  screeningRunId: number,
  tsCode: string,
  latestTradeDate: string,
  bars: ScreeningDailyBar[],
): ChartChipDistributions {
  const distributionRun = readLatestChipDistributionRun(screeningRunId);
  const statuses =
    distributionRun?.screeningRunId === screeningRunId
      ? readChipDistributionStatusesForRun(distributionRun.id).filter(
          (status) => status.tsCode === tsCode,
        )
      : [];
  const previousTradeDate = findPreviousTradeDate(bars, latestTradeDate);
  const previous = buildDistributionPanel(
    "previous",
    findStatus(statuses, "previous"),
    previousTradeDate,
  );
  const latest = buildDistributionPanel(
    "latest",
    findStatus(statuses, "latest"),
    latestTradeDate,
  );

  return withSharedScale({ previous, latest });
}

function buildCalculatedChipDistributions(
  screeningRunId: number,
  tsCode: string,
  latestTradeDate: string,
  bars: ScreeningDailyBar[],
): ChartCalculatedChipDistributions {
  const calculatedRun = readLatestCalculatedChipModelRun(screeningRunId);
  const statuses =
    calculatedRun?.screeningRunId === screeningRunId
      ? readCalculatedChipModelStatusesForRun(calculatedRun.id).filter(
          (status) => status.tsCode === tsCode,
        )
      : [];
  const previousTradeDate = findPreviousTradeDate(bars, latestTradeDate);
  const byCoefficient: ChartCalculatedChipDistributions["byCoefficient"] = {};

  for (const decayCoefficient of SUPPORTED_CHIP_DECAY_COEFFICIENTS) {
    const previous = buildCalculatedPanel({
      targetKind: "previous",
      status: findCalculatedStatus(statuses, "previous", decayCoefficient),
      fallbackTargetTradeDate: previousTradeDate,
      decayCoefficient,
    });
    const latest = buildCalculatedPanel({
      targetKind: "latest",
      status: findCalculatedStatus(statuses, "latest", decayCoefficient),
      fallbackTargetTradeDate: latestTradeDate,
      decayCoefficient,
    });

    byCoefficient[String(decayCoefficient)] = calculatedWithSharedScale(
      decayCoefficient,
      { previous, latest },
    );
  }

  return {
    defaultDecayCoefficient: DEFAULT_CHIP_DECAY_COEFFICIENT,
    coefficients: [...SUPPORTED_CHIP_DECAY_COEFFICIENTS],
    byCoefficient,
  };
}

function unavailable(unavailableReason: ChartUnavailableReason): ChartSnapshot {
  if (unavailableReason === "stock_not_in_latest_results") {
    return {
      status: "not_found",
      unavailableReason,
      row: null,
      bars: [],
      ma20Series: [],
      ma60Series: [],
      overlays: null,
    };
  }

  return {
    status: "unavailable",
    unavailableReason,
    row: null,
    bars: [],
    ma20Series: [],
    ma60Series: [],
    overlays: null,
  };
}

export function readLatestChartSnapshot(tsCode: string): ChartSnapshot {
  const normalizedTsCode = tsCode.trim().toUpperCase();
  const resultsSnapshot = readLatestResultsSnapshot();

  if (resultsSnapshot.status === "unavailable") {
    return unavailable("no_screening_run");
  }

  if (resultsSnapshot.status !== "ready") {
    return unavailable("stock_not_in_latest_results");
  }
  const screeningRunId = resultsSnapshot.sourceScreeningRunId;

  if (screeningRunId === null) {
    return unavailable("no_screening_run");
  }

  const screeningRun = readScreeningRunById(
    screeningRunId,
  );

  if (!screeningRun) {
    return unavailable("no_screening_run");
  }

  const row = resultsSnapshot.rows.find(
    (resultRow) => resultRow.tsCode === normalizedTsCode,
  );

  if (!row) {
    return unavailable("stock_not_in_latest_results");
  }

  const bars =
    screeningRun.sourceMarketGenerationId !== null
      ? readAdjustedMarketBarsForStock(
          screeningRun.sourceMarketGenerationId,
          row.tsCode,
        )
      : readDailyBarsForRefreshJob(screeningRun.sourceRefreshJobId)
          .filter((bar) => bar.tsCode === row.tsCode)
          .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate))
          .slice(-60);

  return {
    status: "ready",
    unavailableReason: null,
    row,
    bars: bars.map(toChartBar),
    ma20Series: calculateMovingAverageSeries(bars, 20).map(toChartMaPoint),
    ma60Series: calculateMovingAverageSeries(bars, 60).map(toChartMaPoint),
    overlays: {
      intervalHighPrice: row.intervalHigh,
      intervalHighTradeDate: row.intervalHighTradeDate,
      threshold85Price: row.intervalHigh * 0.85,
    },
    chipDistributions: buildChipDistributions(
      screeningRunId,
      row.tsCode,
      row.latestTradeDate,
      bars,
    ),
    calculatedChipDistributions: buildCalculatedChipDistributions(
      screeningRunId,
      row.tsCode,
      row.latestTradeDate,
      bars,
    ),
  };
}
