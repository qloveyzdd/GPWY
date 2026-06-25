import { readProviderRuntimeConfig } from "@/lib/config";
import { TushareClient } from "@/lib/tushare/client";
import { ProviderRequestScheduler } from "@/lib/tushare/request-scheduler";
import { ScheduledTushareClient } from "@/lib/tushare/scheduled-client";
import { TinysharePythonClient } from "@/lib/tushare/tinyshare-client";
import type { TushareClientLike } from "@/lib/tushare/types";

export type ProviderRuntimeName = "rest" | "tinyshare";

type RuntimeRegistry = {
  runtime?: ProviderRuntime;
  signature?: string;
  beforeExitRegistered?: boolean;
};

const REGISTRY_KEY = "__gpwyProviderRuntimeRegistry";

function registry(): RuntimeRegistry {
  const root = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: RuntimeRegistry;
  };
  root[REGISTRY_KEY] ??= {};
  return root[REGISTRY_KEY];
}

function resolveProvider(
  env: Partial<Record<string, string | undefined>>,
): ProviderRuntimeName {
  return env.TUSHARE_PROVIDER === "tinyshare" ? "tinyshare" : "rest";
}

function runtimeSignature(
  env: Partial<Record<string, string | undefined>>,
): string {
  const config = readProviderRuntimeConfig(env);
  return JSON.stringify({
    provider: resolveProvider(env),
    maxConcurrency: config.maxConcurrency,
    requestTimeoutMs: config.requestTimeoutMs,
    tinyshareWorkerCount: config.tinyshareWorkerCount,
    pythonPath: env.PYTHON_BIN ?? "python",
    scriptPath: env.TINYSHARE_SCRIPT_PATH ?? "",
  });
}

export class ProviderRuntime {
  readonly provider: ProviderRuntimeName;
  readonly scheduler: ProviderRequestScheduler;

  private readonly env: Partial<Record<string, string | undefined>>;
  private readonly requestTimeoutMs: number;
  private readonly tinyshareWorkerCount: number;
  private readonly rawClients = new Map<string, TushareClientLike>();
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    env: Partial<Record<string, string | undefined>> = process.env,
  ) {
    const config = readProviderRuntimeConfig(env);
    this.provider = resolveProvider(env);
    this.env = { ...env };
    this.requestTimeoutMs = config.requestTimeoutMs;
    this.tinyshareWorkerCount = config.tinyshareWorkerCount;
    const schedulerConcurrency =
      this.provider === "tinyshare"
        ? Math.min(config.maxConcurrency, config.tinyshareWorkerCount)
        : config.maxConcurrency;
    this.scheduler = new ProviderRequestScheduler({
      maxConcurrency: schedulerConcurrency,
      requestTimeoutMs: config.requestTimeoutMs,
    });
  }

  createClient(token: string): TushareClientLike {
    if (this.closed) {
      throw new Error("provider_runtime_closed");
    }

    let rawClient = this.rawClients.get(token);
    if (!rawClient) {
      rawClient =
        this.provider === "tinyshare"
          ? new TinysharePythonClient({
              token,
              pythonPath: this.env.PYTHON_BIN,
              scriptPath: this.env.TINYSHARE_SCRIPT_PATH,
              timeoutMs: this.requestTimeoutMs,
              workerCount: this.tinyshareWorkerCount,
            })
          : new TushareClient({ token });
      this.rawClients.set(token, rawClient);
    }

    return new ScheduledTushareClient(rawClient, this.scheduler);
  }

  getSnapshot() {
    return {
      provider: this.provider,
      workerCount:
        this.provider === "tinyshare" ? this.tinyshareWorkerCount : 0,
      scheduler: this.scheduler.getSnapshot(),
      closed: this.closed,
    };
  }

  close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closed = true;
    const closeableClients = [...this.rawClients.values()].filter(
      (
        client,
      ): client is TushareClientLike & { close: () => Promise<void> } =>
        "close" in client && typeof client.close === "function",
    );
    this.rawClients.clear();
    this.closePromise = Promise.all(
      closeableClients.map((client) => client.close()),
    ).then(() => undefined);
    return this.closePromise;
  }
}

export function getProviderRuntime(
  env: Partial<Record<string, string | undefined>> = process.env,
): ProviderRuntime {
  const state = registry();
  const signature = runtimeSignature(env);

  if (state.runtime) {
    if (state.signature !== signature) {
      throw new Error("provider_runtime_config_mismatch");
    }
    return state.runtime;
  }

  state.runtime = new ProviderRuntime(env);
  state.signature = signature;
  if (!state.beforeExitRegistered) {
    process.once("beforeExit", () => {
      void registry().runtime?.close();
    });
    state.beforeExitRegistered = true;
  }
  return state.runtime;
}

export async function resetProviderRuntimeForTests(): Promise<void> {
  const state = registry();
  await state.runtime?.close();
  state.runtime = undefined;
  state.signature = undefined;
}
