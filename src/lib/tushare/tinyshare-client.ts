import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import path from "node:path";
import {
  createInterface,
  type Interface as ReadLineInterface,
} from "node:readline";

import { TushareApiError } from "@/lib/tushare/client";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
  TushareQueryOptions,
} from "@/lib/tushare/types";

type TinyshareBridgeRequest = {
  token: string;
  api_name: string;
  params: Record<string, unknown>;
  fields: string[];
};

type TinyshareBridgeResult =
  | {
      type: "result";
      request_id: string;
      ok: true;
      data: TushareDataTable;
    }
  | {
      type: "result";
      request_id: string;
      ok: false;
      category?: string;
      error_type?: string;
    };

type TinyshareBridgeError = {
  type: "error";
  category?: string;
  error_type?: string;
};

type TinyshareRunner = (
  request: TinyshareBridgeRequest,
) => Promise<TushareDataTable>;

type PendingRequest = {
  id: string;
  endpoint: TushareEndpoint;
  params: Record<string, unknown>;
  signal?: AbortSignal;
  resolve: (data: TushareDataTable) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  timeout?: ReturnType<typeof setTimeout>;
  removeAbortListener?: () => void;
};

type WorkerState =
  | "new"
  | "starting"
  | "idle"
  | "busy"
  | "disabled"
  | "closed";

type WorkerSlot = {
  index: number;
  state: WorkerState;
  child: ChildProcessWithoutNullStreams | null;
  lines: ReadLineInterface | null;
  current: PendingRequest | null;
  consecutiveFailures: number;
  stderrTail: string;
  startupTimeout: ReturnType<typeof setTimeout> | null;
};

export type TinysharePythonClientOptions = {
  token: string;
  pythonPath?: string;
  scriptPath?: string;
  timeoutMs?: number;
  startupTimeoutMs?: number;
  workerCount?: number;
  restartBudget?: number;
  runner?: TinyshareRunner;
};

const STDERR_TAIL_LIMIT = 2_048;
const CLOSE_GRACE_MS = 250;

export class TinysharePythonClient implements TushareClientLike {
  private readonly token: string;
  private readonly pythonPath: string;
  private readonly scriptPath: string;
  private readonly timeoutMs: number;
  private readonly startupTimeoutMs: number;
  private readonly restartBudget: number;
  private readonly runner?: TinyshareRunner;
  private readonly slots: WorkerSlot[];
  private readonly queue: PendingRequest[] = [];

  private requestSequence = 0;
  private closed = false;
  private closePromise: Promise<void> | null = null;

  constructor({
    token,
    pythonPath = process.env.PYTHON_BIN ?? "python",
    scriptPath = path.join(process.cwd(), "scripts", "tinyshare_bridge.py"),
    timeoutMs = 60_000,
    startupTimeoutMs = timeoutMs,
    workerCount = 2,
    restartBudget = 3,
    runner,
  }: TinysharePythonClientOptions) {
    this.token = token;
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
    this.timeoutMs = timeoutMs;
    this.startupTimeoutMs = startupTimeoutMs;
    this.restartBudget = restartBudget;
    this.runner = runner;
    this.slots = Array.from({ length: workerCount }, (_, index) => ({
      index,
      state: "new",
      child: null,
      lines: null,
      current: null,
      consecutiveFailures: 0,
      stderrTail: "",
      startupTimeout: null,
    }));
  }

  async query(
    endpoint: TushareEndpoint,
    params: Record<string, unknown> = {},
    options: TushareQueryOptions = {},
  ): Promise<TushareDataTable> {
    const data = this.runner
      ? await this.runner({
          token: this.token,
          api_name: endpoint.apiName,
          params,
          fields: endpoint.fields,
        })
      : await this.enqueue(endpoint, params, options.signal);

    if (!data.items.length) {
      throw new TushareApiError(endpoint.apiName, 0, "empty data");
    }

    return data;
  }

  close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closed = true;
    this.rejectQueuedAsUnavailable();

    this.closePromise = Promise.all(
      this.slots.map((slot) => this.closeSlot(slot)),
    ).then(() => undefined);
    return this.closePromise;
  }

  private enqueue(
    endpoint: TushareEndpoint,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<TushareDataTable> {
    if (this.closed || this.allSlotsDisabled()) {
      return Promise.reject(this.poolUnavailableError(endpoint.apiName));
    }
    if (signal?.aborted) {
      return Promise.reject(this.networkError(endpoint.apiName));
    }

    return new Promise<TushareDataTable>((resolve, reject) => {
      const request: PendingRequest = {
        id: `${process.pid}-${this.requestSequence++}`,
        endpoint,
        params,
        signal,
        resolve,
        reject,
        settled: false,
      };

      if (signal) {
        const onAbort = () => {
          const activeSlot = this.slots.find(
            (slot) => slot.current === request,
          );
          if (activeSlot?.child) {
            this.failSlot(activeSlot, activeSlot.child);
            return;
          }

          this.settleRequest(
            request,
            "reject",
            this.networkError(endpoint.apiName),
          );
          this.removeQueuedRequest(request);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        request.removeAbortListener = () =>
          signal.removeEventListener("abort", onAbort);
      }

      this.queue.push(request);
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.closed) {
      this.rejectQueuedAsUnavailable();
      return;
    }
    if (this.allSlotsDisabled()) {
      this.rejectQueuedAsUnavailable();
      return;
    }

    for (const slot of this.slots) {
      if (slot.state === "new" && this.hasQueuedRequests()) {
        this.startWorker(slot);
      }
      if (slot.state !== "idle") {
        continue;
      }

      const request = this.takeNextRequest();
      if (!request) {
        break;
      }
      this.assign(slot, request);
    }
  }

  private startWorker(slot: WorkerSlot): void {
    if (this.closed || slot.state !== "new") {
      return;
    }

    slot.state = "starting";
    slot.stderrTail = "";
    const child = spawn(this.pythonPath, [this.scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    slot.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    slot.lines = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    slot.startupTimeout = setTimeout(
      () => this.failSlot(slot, child),
      this.startupTimeoutMs,
    );

    slot.lines.on("line", (line) => this.handleWorkerLine(slot, child, line));
    child.stderr.on("data", (chunk: string) => {
      slot.stderrTail = `${slot.stderrTail}${chunk}`.slice(-STDERR_TAIL_LIMIT);
    });
    child.once("error", () => this.failSlot(slot, child));
    child.once("close", () => this.failSlot(slot, child));

    try {
      child.stdin.write(
        `${JSON.stringify({ type: "init", token: this.token })}\n`,
      );
    } catch {
      this.failSlot(slot, child);
    }
  }

  private handleWorkerLine(
    slot: WorkerSlot,
    child: ChildProcessWithoutNullStreams,
    line: string,
  ): void {
    if (slot.child !== child || this.closed) {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.failSlot(slot, child);
      return;
    }

    if (slot.state === "starting") {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "ready"
      ) {
        if (slot.startupTimeout) {
          clearTimeout(slot.startupTimeout);
          slot.startupTimeout = null;
        }
        slot.state = "idle";
        this.dispatch();
        return;
      }

      if (this.isBridgeError(message)) {
        const category =
          message.category || message.error_type || "unknown";
        if (
          category === "rate_limited" ||
          category === "network_or_service"
        ) {
          this.rejectNextQueued(category);
          this.failSlot(slot, child);
        } else {
          this.disablePool(category);
        }
        return;
      }

      this.failSlot(slot, child);
      return;
    }

    if (slot.state !== "busy" || !slot.current) {
      this.failSlot(slot, child);
      return;
    }

    const request = slot.current;
    if (!this.isBridgeResult(message) || message.request_id !== request.id) {
      this.failSlot(slot, child);
      return;
    }

    slot.current = null;
    slot.state = "idle";
    slot.consecutiveFailures = 0;

    if (message.ok) {
      this.settleRequest(request, "resolve", message.data);
    } else {
      this.settleRequest(
        request,
        "reject",
        new TushareApiError(
          request.endpoint.apiName,
          null,
          message.category || message.error_type || "unknown",
        ),
      );
    }
    this.dispatch();
  }

  private assign(slot: WorkerSlot, request: PendingRequest): void {
    if (!slot.child || slot.state !== "idle") {
      this.queue.unshift(request);
      return;
    }

    slot.state = "busy";
    slot.current = request;
    request.timeout = setTimeout(
      () => this.failSlot(slot, slot.child),
      this.timeoutMs,
    );

    try {
      slot.child.stdin.write(
        `${JSON.stringify({
          type: "query",
          request_id: request.id,
          api_name: request.endpoint.apiName,
          params: request.params,
          fields: request.endpoint.fields,
        })}\n`,
      );
    } catch {
      this.failSlot(slot, slot.child);
    }
  }

  private failSlot(
    slot: WorkerSlot,
    child: ChildProcessWithoutNullStreams | null,
  ): void {
    if (!child || slot.child !== child) {
      return;
    }

    slot.child = null;
    if (slot.startupTimeout) {
      clearTimeout(slot.startupTimeout);
      slot.startupTimeout = null;
    }
    slot.lines?.close();
    slot.lines = null;
    child.kill();

    const request = slot.current;
    slot.current = null;
    if (request) {
      this.settleRequest(
        request,
        "reject",
        this.networkError(request.endpoint.apiName),
      );
    }

    if (this.closed) {
      slot.state = "closed";
      return;
    }

    slot.consecutiveFailures += 1;
    if (slot.consecutiveFailures >= this.restartBudget) {
      slot.state = "disabled";
    } else {
      slot.state = "new";
    }

    if (this.allSlotsDisabled()) {
      this.rejectQueuedAsUnavailable();
      return;
    }
    this.dispatch();
  }

  private settleRequest(
    request: PendingRequest,
    outcome: "resolve" | "reject",
    value: TushareDataTable | unknown,
  ): void {
    if (request.settled) {
      return;
    }

    request.settled = true;
    if (request.timeout) {
      clearTimeout(request.timeout);
      request.timeout = undefined;
    }
    request.removeAbortListener?.();
    if (outcome === "resolve") {
      request.resolve(value as TushareDataTable);
    } else {
      request.reject(value);
    }
  }

  private takeNextRequest(): PendingRequest | null {
    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      if (!request.settled) {
        return request;
      }
    }
    return null;
  }

  private hasQueuedRequests(): boolean {
    return this.queue.some((request) => !request.settled);
  }

  private removeQueuedRequest(request: PendingRequest): void {
    const index = this.queue.indexOf(request);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  private allSlotsDisabled(): boolean {
    return this.slots.every(
      (slot) => slot.state === "disabled" || slot.state === "closed",
    );
  }

  private rejectQueuedAsUnavailable(): void {
    for (const request of this.queue.splice(0)) {
      this.settleRequest(
        request,
        "reject",
        this.poolUnavailableError(request.endpoint.apiName),
      );
    }
  }

  private rejectNextQueued(category: string): void {
    const request = this.takeNextRequest();
    if (!request) {
      return;
    }

    this.settleRequest(
      request,
      "reject",
      new TushareApiError(request.endpoint.apiName, null, category),
    );
  }

  private disablePool(category: string): void {
    for (const slot of this.slots) {
      if (slot.startupTimeout) {
        clearTimeout(slot.startupTimeout);
        slot.startupTimeout = null;
      }
      const child = slot.child;
      slot.child = null;
      slot.lines?.close();
      slot.lines = null;
      slot.state = "disabled";
      child?.kill();
      const request = slot.current;
      slot.current = null;
      if (request) {
        this.settleRequest(
          request,
          "reject",
          new TushareApiError(request.endpoint.apiName, null, category),
        );
      }
    }

    for (const request of this.queue.splice(0)) {
      this.settleRequest(
        request,
        "reject",
        new TushareApiError(request.endpoint.apiName, null, category),
      );
    }
  }

  private networkError(apiName: string): TushareApiError {
    return new TushareApiError(apiName, null, "network_or_service");
  }

  private poolUnavailableError(apiName: string): TushareApiError {
    return new TushareApiError(
      apiName,
      null,
      "tinyshare_worker_pool_unavailable",
    );
  }

  private isBridgeResult(value: unknown): value is TinyshareBridgeResult {
    return (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      value.type === "result" &&
      "request_id" in value &&
      typeof value.request_id === "string" &&
      "ok" in value &&
      typeof value.ok === "boolean" &&
      (!value.ok ||
        ("data" in value &&
          typeof value.data === "object" &&
          value.data !== null &&
          "fields" in value.data &&
          Array.isArray(value.data.fields) &&
          "items" in value.data &&
          Array.isArray(value.data.items)))
    );
  }

  private isBridgeError(value: unknown): value is TinyshareBridgeError {
    return (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      value.type === "error"
    );
  }

  private closeSlot(slot: WorkerSlot): Promise<void> {
    const request = slot.current;
    slot.current = null;
    if (request) {
      this.settleRequest(
        request,
        "reject",
        this.poolUnavailableError(request.endpoint.apiName),
      );
    }

    slot.state = "closed";
    if (slot.startupTimeout) {
      clearTimeout(slot.startupTimeout);
      slot.startupTimeout = null;
    }
    const child = slot.child;
    slot.child = null;
    slot.lines?.close();
    slot.lines = null;
    if (!child) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };
      const killTimer = setTimeout(() => {
        child.kill();
        finish();
      }, CLOSE_GRACE_MS);

      child.once("close", () => {
        clearTimeout(killTimer);
        finish();
      });
      try {
        child.stdin.end(`${JSON.stringify({ type: "shutdown" })}\n`);
      } catch {
        child.kill();
        clearTimeout(killTimer);
        finish();
      }
    });
  }
}
