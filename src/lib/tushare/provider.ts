import { TushareClient } from "@/lib/tushare/client";
import { TinysharePythonClient } from "@/lib/tushare/tinyshare-client";
import type { TushareClientLike } from "@/lib/tushare/types";

export type TushareProviderName = "rest" | "tinyshare";

export function resolveTushareProvider(
  env: Partial<Record<string, string | undefined>> = process.env,
): TushareProviderName {
  return env.TUSHARE_PROVIDER === "tinyshare" ? "tinyshare" : "rest";
}

export function createTushareClient(
  token: string,
  env: Partial<Record<string, string | undefined>> = process.env,
): TushareClientLike {
  if (resolveTushareProvider(env) === "tinyshare") {
    return new TinysharePythonClient({
      token,
      pythonPath: env.PYTHON_BIN,
    });
  }

  return new TushareClient({ token });
}
