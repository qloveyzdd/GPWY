export type ScreeningDailyBar = {
  tsCode: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
};

export type MovingAveragePoint = {
  tradeDate: string;
  value: number;
};
