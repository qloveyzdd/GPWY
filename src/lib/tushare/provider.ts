import { getProviderRuntime } from "@/lib/tushare/provider-runtime";
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
  return getProviderRuntime(env).createClient(token);
}
