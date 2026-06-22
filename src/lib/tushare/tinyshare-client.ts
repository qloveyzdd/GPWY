import { spawn } from "node:child_process";
import path from "node:path";

import { TushareApiError } from "@/lib/tushare/client";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";

type TinyshareBridgeRequest = {
  token: string;
  api_name: string;
  params: Record<string, unknown>;
  fields: string[];
};

type TinyshareBridgeResponse =
  | {
      ok: true;
      data: TushareDataTable;
    }
  | {
      ok: false;
      category: string;
      error_type: string;
      message?: string;
    };

type TinyshareRunner = (
  request: TinyshareBridgeRequest,
) => Promise<TushareDataTable>;

export type TinysharePythonClientOptions = {
  token: string;
  pythonPath?: string;
  scriptPath?: string;
  timeoutMs?: number;
  runner?: TinyshareRunner;
};

export class TinysharePythonClient implements TushareClientLike {
  private readonly token: string;
  private readonly pythonPath: string;
  private readonly scriptPath: string;
  private readonly timeoutMs: number;
  private readonly runner?: TinyshareRunner;

  constructor({
    token,
    pythonPath = process.env.PYTHON_BIN ?? "python",
    scriptPath = path.join(process.cwd(), "scripts", "tinyshare_bridge.py"),
    timeoutMs = 60_000,
    runner,
  }: TinysharePythonClientOptions) {
    this.token = token;
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
    this.timeoutMs = timeoutMs;
    this.runner = runner;
  }

  async query(
    endpoint: TushareEndpoint,
    params: Record<string, unknown> = {},
  ): Promise<TushareDataTable> {
    const request: TinyshareBridgeRequest = {
      token: this.token,
      api_name: endpoint.apiName,
      params,
      fields: endpoint.fields,
    };
    const data = this.runner
      ? await this.runner(request)
      : await this.runBridge(request);

    if (!data.items.length) {
      throw new TushareApiError(endpoint.apiName, 0, "empty data");
    }

    return data;
  }

  private runBridge(request: TinyshareBridgeRequest) {
    return new Promise<TushareDataTable>((resolve, reject) => {
      const child = spawn(this.pythonPath, [this.scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new TushareApiError(request.api_name, null, "network_or_service"));
      }, this.timeoutMs);
      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", () => {
        clearTimeout(timeout);
        reject(new TushareApiError(request.api_name, null, "network_or_service"));
      });
      child.on("close", (code) => {
        clearTimeout(timeout);

        if (code !== 0 && !stdout.trim()) {
          reject(
            new TushareApiError(
              request.api_name,
              code,
              stderr ? "network_or_service" : "unknown",
            ),
          );
          return;
        }

        try {
          const response = JSON.parse(stdout) as TinyshareBridgeResponse;

          if (!response.ok) {
            reject(
              new TushareApiError(
                request.api_name,
                null,
                response.category || response.error_type || "unknown",
              ),
            );
            return;
          }

          resolve(response.data);
        } catch {
          reject(new TushareApiError(request.api_name, null, "unknown"));
        }
      });
      child.stdin.end(JSON.stringify(request));
    });
  }
}
