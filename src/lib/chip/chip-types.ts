export type ChipDistributionRow = {
  tsCode: string;
  tradeDate: string;
  price: number;
  percent: number;
};

export type ChipPeakExtractionSource = "cyq_chips_highest_percent";

export type ChipPeakExtraction = {
  tsCode: string;
  tradeDate: string;
  chipPeakPrice: number;
  peakPercent: number;
  source: ChipPeakExtractionSource;
};
