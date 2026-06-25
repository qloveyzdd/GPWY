// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { TushareApiError } from "@/lib/tushare/client";
import { ProviderRequestScheduler } from "@/lib/tushare/request-scheduler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("ProviderRequestScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never starts more executors than the configured concurrency", async () => {
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 2,
      requestTimeoutMs: 60_000,
    });
    const gates = Array.from({ length: 5 }, () => deferred<number>());
    let active = 0;
    let peak = 0;

    const requests = gates.map((gate, index) =>
      scheduler.schedule({
        affectedInterface: `daily-${index}`,
        execute: async () => {
          active += 1;
          peak = Math.max(peak, active);
          const result = await gate.promise;
          active -= 1;
          return result;
        },
      }),
    );

    await flushMicrotasks();
    expect(peak).toBe(2);
    expect(scheduler.getSnapshot()).toMatchObject({
      activeCount: 2,
      queuedCount: 3,
      configuredConcurrency: 2,
      effectiveConcurrency: 2,
    });

    for (let index = 0; index < gates.length; index += 1) {
      gates[index]!.resolve(index);
      await flushMicrotasks();
    }

    await expect(Promise.all(requests)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("retries transient failures at most three times with released slots", async () => {
    vi.useFakeTimers();
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 1,
      requestTimeoutMs: 60_000,
      random: () => 0.5,
    });
    let transientAttempts = 0;
    const order: string[] = [];

    const transient = scheduler.schedule({
      affectedInterface: "daily",
      execute: async () => {
        transientAttempts += 1;
        order.push(`transient-${transientAttempts}`);
        throw new TypeError("fetch failed");
      },
    });
    const transientResult = transient.catch((error: unknown) => error);
    const healthy = scheduler.schedule({
      affectedInterface: "stock_basic",
      execute: async () => {
        order.push("healthy");
        return "ok";
      },
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["transient-1", "healthy"]);
    expect(scheduler.getSnapshot().activeCount).toBe(0);
    await expect(healthy).resolves.toBe("ok");

    await vi.advanceTimersByTimeAsync(999);
    expect(transientAttempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transientAttempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(transientAttempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(transientResult).resolves.toMatchObject({
      message: "fetch failed",
    });
    expect(transientAttempts).toBe(3);
  });

  it.each([
    new TushareApiError("daily", null, "permission denied"),
    new TushareApiError("daily", 0, "empty data"),
    new Error("unexpected payload"),
  ])("does not retry definitive failure %#", async (error) => {
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 2,
      requestTimeoutMs: 60_000,
    });
    const execute = vi.fn(async () => {
      throw error;
    });

    await expect(
      scheduler.schedule({
        affectedInterface: "daily",
        execute,
      }),
    ).rejects.toBe(error);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("aborts the active executor when an attempt times out", async () => {
    vi.useFakeTimers();
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 1,
      requestTimeoutMs: 1_000,
      random: () => 0.5,
    });
    const observedSignals: AbortSignal[] = [];

    const request = scheduler.schedule({
      affectedInterface: "daily",
      execute: (signal) =>
        new Promise((_, reject) => {
          observedSignals.push(signal);
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    });
    const requestResult = request.catch((error: unknown) => error);
    await flushMicrotasks();

    expect(observedSignals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(observedSignals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(requestResult).resolves.toMatchObject({
      message: "network_or_service timeout",
    });
    expect(observedSignals).toHaveLength(3);
    expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it("decreases after two rate limits and recovers one slot after eight successes", async () => {
    vi.useFakeTimers();
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 3,
      requestTimeoutMs: 60_000,
      random: () => 0.5,
    });
    let attempts = 0;
    const recovering = scheduler.schedule({
      affectedInterface: "daily",
      execute: async () => {
        attempts += 1;
        if (attempts <= 2) {
          throw new Error("rate limit exceeded");
        }
        return "recovered";
      },
    });

    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(scheduler.getSnapshot().effectiveConcurrency).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(recovering).resolves.toBe("recovered");

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        scheduler.schedule({
          affectedInterface: `daily-${index}`,
          execute: async () => index,
        }),
      ),
    );

    expect(scheduler.getSnapshot().effectiveConcurrency).toBe(3);
  });

  it("lets an aged chip request run before newly queued validation work", async () => {
    vi.useFakeTimers();
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 1,
      requestTimeoutMs: 60_000,
    });
    const blocker = deferred<void>();
    const order: string[] = [];

    const blockingRequest = scheduler.schedule({
      affectedInterface: "daily",
      priority: "validation",
      execute: async () => blocker.promise,
    });
    const chipRequest = scheduler.schedule({
      affectedInterface: "cyq_chips",
      priority: "chip",
      execute: async () => {
        order.push("chip");
        return "chip";
      },
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const validationRequest = scheduler.schedule({
      affectedInterface: "stock_basic",
      priority: "validation",
      execute: async () => {
        order.push("validation");
        return "validation";
      },
    });

    blocker.resolve();
    await blockingRequest;
    await expect(chipRequest).resolves.toBe("chip");
    await expect(validationRequest).resolves.toBe("validation");
    expect(order).toEqual(["chip", "validation"]);
  });
});
