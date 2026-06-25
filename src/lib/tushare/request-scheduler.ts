import {
  classifyTushareError,
  TushareApiError,
} from "@/lib/tushare/client";
import type {
  ProviderRequestPriority,
  TushareErrorCategory,
} from "@/lib/tushare/types";

const PRIORITY_SCORES: Record<ProviderRequestPriority, number> = {
  validation: 300,
  market: 200,
  chip: 100,
};

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_JITTER_RATIO = 0.2;
const AGING_INTERVAL_MS = 5_000;
const AGING_STEP = 100;
const MAX_PRIORITY_SCORE = 300;

type TimerHandle = ReturnType<typeof setTimeout>;

type QueueItem<T> = {
  affectedInterface: string;
  priority: ProviderRequestPriority;
  signal?: AbortSignal;
  execute: (signal: AbortSignal) => Promise<T>;
  firstEnqueuedAt: number;
  readyAt: number;
  sequence: number;
  attempts: number;
  settled: boolean;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  removeAbortListener?: () => void;
};

export type ProviderRequestSchedulerOptions = {
  maxConcurrency: number;
  requestTimeoutMs: number;
  now?: () => number;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

export type ProviderScheduleInput<T> = {
  affectedInterface: string;
  priority?: ProviderRequestPriority;
  signal?: AbortSignal;
  execute: (signal: AbortSignal) => Promise<T>;
};

export type ProviderRequestSchedulerSnapshot = {
  activeCount: number;
  queuedCount: number;
  configuredConcurrency: number;
  effectiveConcurrency: number;
};

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  const error = new Error("provider request aborted");
  error.name = "AbortError";
  return error;
}

function isRetryable(category: TushareErrorCategory): boolean {
  return category === "rate_limited" || category === "network_or_service";
}

export class ProviderRequestScheduler {
  private readonly configuredConcurrency: number;
  private readonly requestTimeoutMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimer: (
    callback: () => void,
    delayMs: number,
  ) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  private readonly queue: QueueItem<unknown>[] = [];
  private activeCount = 0;
  private effectiveConcurrency: number;
  private sequence = 0;
  private consecutiveRateLimits = 0;
  private consecutiveSuccesses = 0;
  private wakeTimer: TimerHandle | null = null;

  constructor(options: ProviderRequestSchedulerOptions) {
    this.configuredConcurrency = options.maxConcurrency;
    this.effectiveConcurrency = options.maxConcurrency;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.setTimer =
      options.setTimer ??
      ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  getSnapshot(): ProviderRequestSchedulerSnapshot {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.filter((item) => !item.settled).length,
      configuredConcurrency: this.configuredConcurrency,
      effectiveConcurrency: this.effectiveConcurrency,
    };
  }

  schedule<T>(input: ProviderScheduleInput<T>): Promise<T> {
    if (input.signal?.aborted) {
      return Promise.reject(createAbortError(input.signal.reason));
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        affectedInterface: input.affectedInterface,
        priority: input.priority ?? "market",
        signal: input.signal,
        execute: input.execute,
        firstEnqueuedAt: this.now(),
        readyAt: this.now(),
        sequence: this.sequence++,
        attempts: 0,
        settled: false,
        resolve,
        reject,
      };

      if (input.signal) {
        const onAbort = () => {
          if (item.settled) {
            return;
          }

          item.settled = true;
          item.reject(createAbortError(input.signal?.reason));
          this.pump();
        };
        input.signal.addEventListener("abort", onAbort, { once: true });
        item.removeAbortListener = () =>
          input.signal?.removeEventListener("abort", onAbort);
      }

      this.queue.push(item as QueueItem<unknown>);
      this.pump();
    });
  }

  private pump(): void {
    this.removeSettledItems();
    this.clearWakeTimer();

    while (this.activeCount < this.effectiveConcurrency) {
      const item = this.takeNextReadyItem();
      if (!item) {
        break;
      }

      this.startAttempt(item);
    }

    this.scheduleNextWakeup();
  }

  private takeNextReadyItem(): QueueItem<unknown> | null {
    const now = this.now();
    let selectedIndex = -1;

    for (let index = 0; index < this.queue.length; index += 1) {
      const candidate = this.queue[index]!;
      if (candidate.settled || candidate.readyAt > now) {
        continue;
      }

      if (
        selectedIndex === -1 ||
        this.compareItems(candidate, this.queue[selectedIndex]!, now) < 0
      ) {
        selectedIndex = index;
      }
    }

    if (selectedIndex === -1) {
      return null;
    }

    return this.queue.splice(selectedIndex, 1)[0]!;
  }

  private compareItems(
    left: QueueItem<unknown>,
    right: QueueItem<unknown>,
    now: number,
  ): number {
    const priorityDifference =
      this.effectivePriority(right, now) - this.effectivePriority(left, now);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const enqueueDifference = left.firstEnqueuedAt - right.firstEnqueuedAt;
    if (enqueueDifference !== 0) {
      return enqueueDifference;
    }

    return left.sequence - right.sequence;
  }

  private effectivePriority(item: QueueItem<unknown>, now: number): number {
    const waitedMs = Math.max(0, now - item.firstEnqueuedAt);
    const agingBoost = Math.floor(waitedMs / AGING_INTERVAL_MS) * AGING_STEP;
    return Math.min(
      MAX_PRIORITY_SCORE,
      PRIORITY_SCORES[item.priority] + agingBoost,
    );
  }

  private startAttempt(item: QueueItem<unknown>): void {
    if (item.settled || item.signal?.aborted) {
      this.rejectItem(item, createAbortError(item.signal?.reason));
      return;
    }

    item.attempts += 1;
    this.activeCount += 1;

    this.executeAttempt(item)
      .then((value) => {
        this.recordSuccess();
        this.resolveItem(item, value);
      })
      .catch((error: unknown) => {
        const category = classifyTushareError(
          error,
          item.affectedInterface,
        ).category;
        this.recordFailure(category);

        if (
          !item.signal?.aborted &&
          isRetryable(category) &&
          item.attempts < MAX_ATTEMPTS
        ) {
          item.readyAt = this.now() + this.retryDelayMs(item.attempts);
          this.queue.push(item);
          return;
        }

        this.rejectItem(item, error);
      })
      .finally(() => {
        this.activeCount -= 1;
        this.pump();
      });
  }

  private executeAttempt(item: QueueItem<unknown>): Promise<unknown> {
    const controller = new AbortController();
    let timeoutHandle: TimerHandle | null = null;
    let removeExternalAbortListener: (() => void) | undefined;

    if (item.signal) {
      const onExternalAbort = () =>
        controller.abort(createAbortError(item.signal?.reason));
      item.signal.addEventListener("abort", onExternalAbort, { once: true });
      removeExternalAbortListener = () =>
        item.signal?.removeEventListener("abort", onExternalAbort);
    }

    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(createAbortError(controller.signal.reason)),
        { once: true },
      );
    });

    timeoutHandle = this.setTimer(() => {
      controller.abort(
        new TushareApiError(
          item.affectedInterface,
          null,
          "network_or_service timeout",
        ),
      );
    }, this.requestTimeoutMs);

    const execution = Promise.resolve().then(() =>
      item.execute(controller.signal),
    );

    return Promise.race([execution, abortPromise]).finally(() => {
      if (timeoutHandle) {
        this.clearTimer(timeoutHandle);
      }
      removeExternalAbortListener?.();
    });
  }

  private retryDelayMs(attemptsCompleted: number): number {
    const baseDelay =
      RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attemptsCompleted - 1);
    const jitterFactor =
      1 - RETRY_JITTER_RATIO + this.random() * RETRY_JITTER_RATIO * 2;
    return Math.round(baseDelay * jitterFactor);
  }

  private recordSuccess(): void {
    this.consecutiveRateLimits = 0;
    this.consecutiveSuccesses += 1;

    if (
      this.consecutiveSuccesses >= 8 &&
      this.effectiveConcurrency < this.configuredConcurrency
    ) {
      this.effectiveConcurrency += 1;
      this.consecutiveSuccesses = 0;
    }
  }

  private recordFailure(category: TushareErrorCategory): void {
    this.consecutiveSuccesses = 0;

    if (category !== "rate_limited") {
      this.consecutiveRateLimits = 0;
      return;
    }

    this.consecutiveRateLimits += 1;
    if (this.consecutiveRateLimits >= 2) {
      this.effectiveConcurrency = Math.max(
        1,
        this.effectiveConcurrency - 1,
      );
      this.consecutiveRateLimits = 0;
    }
  }

  private resolveItem(item: QueueItem<unknown>, value: unknown): void {
    if (item.settled) {
      return;
    }

    item.settled = true;
    item.removeAbortListener?.();
    item.resolve(value);
  }

  private rejectItem(item: QueueItem<unknown>, error: unknown): void {
    if (item.settled) {
      return;
    }

    item.settled = true;
    item.removeAbortListener?.();
    item.reject(error);
  }

  private removeSettledItems(): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index]!.settled) {
        this.queue.splice(index, 1);
      }
    }
  }

  private scheduleNextWakeup(): void {
    if (
      this.activeCount >= this.effectiveConcurrency ||
      this.queue.length === 0
    ) {
      return;
    }

    const nextReadyAt = this.queue.reduce(
      (earliest, item) =>
        item.settled ? earliest : Math.min(earliest, item.readyAt),
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(nextReadyAt)) {
      return;
    }

    const delayMs = Math.max(0, nextReadyAt - this.now());
    this.wakeTimer = this.setTimer(() => {
      this.wakeTimer = null;
      this.pump();
    }, delayMs);
  }

  private clearWakeTimer(): void {
    if (!this.wakeTimer) {
      return;
    }

    this.clearTimer(this.wakeTimer);
    this.wakeTimer = null;
  }
}
