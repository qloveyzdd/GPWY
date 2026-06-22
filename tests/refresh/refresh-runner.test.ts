// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readRefreshStatus,
  startManualRefresh,
} from "@/lib/refresh/refresh-runner";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempRefreshStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-refresh-runner-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

describe("refresh runner", () => {
  it("runs an injected worker and records a succeeded job", async () => {
    useTempRefreshStore();

    const result = await startManualRefresh({
      now: new Date("2026-06-23T00:00:00.000Z"),
      waitForCompletion: true,
      worker: async () => ({
        totalStocks: 2,
        successCount: 2,
        failedCount: 0,
      }),
    });
    const status = readRefreshStatus();

    expect(result.started).toBe(true);
    expect(result.job.status).toBe("succeeded");
    expect(status.activeJob).toBeNull();
    expect(status.latestJob?.status).toBe("succeeded");
    expect(status.latestSuccessfulJob?.successCount).toBe(2);
    expect(status.lastSuccessfulFinishedAt).toBeTruthy();
  });

  it("returns the active job without starting a duplicate worker", async () => {
    useTempRefreshStore();
    let finishWorker:
      | ((value: { totalStocks: number; successCount: number; failedCount: number }) => void)
      | undefined;
    const worker = vi.fn(
      () =>
        new Promise<{
          totalStocks: number;
          successCount: number;
          failedCount: number;
        }>((resolve) => {
          finishWorker = resolve;
        }),
    );

    const first = await startManualRefresh({
      now: new Date("2026-06-23T00:00:00.000Z"),
      worker,
    });
    const second = await startManualRefresh({
      now: new Date("2026-06-23T00:01:00.000Z"),
      worker,
    });

    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(worker).toHaveBeenCalledTimes(1);

    finishWorker?.({ totalStocks: 1, successCount: 1, failedCount: 0 });
    await vi.waitFor(() => {
      expect(readRefreshStatus().activeJob).toBeNull();
    });
  });

  it("stores sanitized failures from the worker", async () => {
    useTempRefreshStore();

    const result = await startManualRefresh({
      waitForCompletion: true,
      worker: async () => {
        throw new Error(
          "token=very-secret-token failed at C:\\server\\private\\worker.ts",
        );
      },
    });
    const latestJob = readRefreshStatus().latestJob;
    const serialized = JSON.stringify(latestJob);

    expect(result.started).toBe(true);
    expect(result.job.status).toBe("failed");
    expect(latestJob?.status).toBe("failed");
    expect(serialized).not.toContain("very-secret-token");
    expect(serialized).not.toContain("C:\\server\\private");
  });
});
