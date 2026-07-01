import {
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
} from "@/lib/chip/chip-model";
import {
  calculateChipDistributionOnDemand,
  type OnDemandCalculatedChipDistributionResult,
} from "@/lib/chip/chip-model-runner";
import {
  readChipDistributionForDate,
  readChipDistributionStatusesForRun,
  readLatestChipDistributionRun,
} from "@/lib/chip/chip-store";
import type {
  CalculatedChipDistributionStatus,
  ChipDecayCoefficient,
  ChipDistributionLevel,
  ChipDistributionStatusRecord,
  ChipDistributionTargetKind,
  ChipModelUnavailableReason,
} from "@/lib/chip/chip-types";
import { readTushareTokenSecret } from "@/lib/config";
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
import { createTushareClient } from "@/lib/tushare/provider";
import type { TushareErrorCategory } from "@/lib/tushare/types";

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

function buildCalculatedUnavailablePanel({
  targetKind,
  status,
  targetTradeDate,
  seedTradeDate,
  decayCoefficient,
  unavailableReason,
  errorCategory = null,
  errorSummary = null,
}: {
  targetKind: ChipDistributionTargetKind;
  status: CalculatedChipDistributionStatus;
  targetTradeDate: string | null;
  seedTradeDate: string | null;
  decayCoefficient: ChipDecayCoefficient;
  unavailableReason: ChipModelUnavailableReason | null;
  errorCategory?: TushareErrorCategory | null;
  errorSummary?: string | null;
}): ChartCalculatedChipDistributionPanel {
  return {
    targetKind,
    label: targetLabel(targetKind),
    targetTradeDate,
    seedTradeDate,
    status,
    decayCoefficient,
    modelVersion: CHIP_MODEL_VERSION,
    levels: [],
    maxLevel: null,
    unavailableReason,
    errorCategory,
    errorSummary: sanitizeErrorSummary(errorSummary),
  };
}

function buildCalculatedPanelFromOnDemand(
  result: OnDemandCalculatedChipDistributionResult,
): ChartCalculatedChipDistributionPanel {
  if (result.status !== "succeeded") {
    return buildCalculatedUnavailablePanel({
      targetKind: result.targetKind,
      status: result.status,
      targetTradeDate: result.targetTradeDate,
      seedTradeDate: result.seedTradeDate,
      decayCoefficient: result.decayCoefficient,
      unavailableReason: result.unavailableReason,
      errorCategory: result.errorCategory,
      errorSummary: result.errorSummary,
    });
  }

  const levels = result.levels.map(toDistributionLevel);

  if (levels.length === 0) {
    return buildCalculatedUnavailablePanel({
      targetKind: result.targetKind,
      status: "blocked",
      targetTradeDate: result.targetTradeDate,
      seedTradeDate: result.seedTradeDate,
      decayCoefficient: result.decayCoefficient,
      unavailableReason: "missing_trade_data",
      errorCategory: "empty_data",
      errorSummary: "calculated chip distribution produced no levels",
    });
  }

  return {
    targetKind: result.targetKind,
    label: targetLabel(result.targetKind),
    targetTradeDate: result.targetTradeDate,
    seedTradeDate: result.seedTradeDate,
    status: "succeeded",
    decayCoefficient: result.decayCoefficient,
    modelVersion: result.modelVersion,
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

async function buildCalculatedChipDistributions(
  screeningRunId: number,
  sourceMarketGenerationId: number | null,
  tsCode: string,
  latestTradeDate: string,
  bars: ScreeningDailyBar[],
): Promise<ChartCalculatedChipDistributions> {
  const previousTradeDate = findPreviousTradeDate(bars, latestTradeDate);
  const byCoefficient: ChartCalculatedChipDistributions["byCoefficient"] = {};
  const token = readTushareTokenSecret();
  const client = token ? createTushareClient(token) : null;
  const resultsByTarget =
    sourceMarketGenerationId === null
      ? {
          previous: SUPPORTED_CHIP_DECAY_COEFFICIENTS.map((decayCoefficient) =>
            previousTradeDate === null
              ? buildCalculatedMissingPanel({
                  targetKind: "previous",
                  targetTradeDate: null,
                  decayCoefficient,
                })
              : buildCalculatedUnavailablePanel({
                  targetKind: "previous",
                  status: "blocked",
                  targetTradeDate: previousTradeDate,
                  seedTradeDate: null,
                  decayCoefficient,
                  unavailableReason: "missing_trade_data",
                  errorSummary: "missing_source_market_generation",
                }),
          ),
          latest: SUPPORTED_CHIP_DECAY_COEFFICIENTS.map((decayCoefficient) =>
            buildCalculatedUnavailablePanel({
              targetKind: "latest",
              status: "blocked",
              targetTradeDate: latestTradeDate,
              seedTradeDate: null,
              decayCoefficient,
              unavailableReason: "missing_trade_data",
              errorSummary: "missing_source_market_generation",
            }),
          ),
        }
      : {
          previous: (
            await calculateChipDistributionOnDemand({
              generationId: sourceMarketGenerationId,
              tsCode,
              targetKind: "previous",
              targetTradeDate: previousTradeDate,
              client,
            })
          ).map(buildCalculatedPanelFromOnDemand),
          latest: (
            await calculateChipDistributionOnDemand({
              generationId: sourceMarketGenerationId,
              tsCode,
              targetKind: "latest",
              targetTradeDate: latestTradeDate,
              client,
            })
          ).map(buildCalculatedPanelFromOnDemand),
        };

  for (const decayCoefficient of SUPPORTED_CHIP_DECAY_COEFFICIENTS) {
    const previous =
      resultsByTarget.previous.find(
        (panel) => panel.decayCoefficient === decayCoefficient,
      ) ??
      buildCalculatedMissingPanel({
        targetKind: "previous",
        targetTradeDate: previousTradeDate,
        decayCoefficient,
      });
    const latest =
      resultsByTarget.latest.find(
        (panel) => panel.decayCoefficient === decayCoefficient,
      ) ??
      buildCalculatedMissingPanel({
        targetKind: "latest",
        targetTradeDate: latestTradeDate,
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

export async function readLatestChartSnapshot(
  tsCode: string,
): Promise<ChartSnapshot> {
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
    calculatedChipDistributions: await buildCalculatedChipDistributions(
      screeningRunId,
      screeningRun.sourceMarketGenerationId,
      row.tsCode,
      row.latestTradeDate,
      bars,
    ),
  };
}
