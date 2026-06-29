import { readTushareTokenSecret } from "@/lib/config";
import {
  runFullMarketRebuild,
} from "@/lib/refresh/full-rebuild-runner";
import type { RefreshStageSnapshot } from "@/lib/refresh/refresh-types";
import { createTushareClient } from "@/lib/tushare/provider";

function printHelp() {
  console.log(`Usage: npm run rebuild:market -- [--help]

Server-only operation command. Rebuilds the normalized market cache by creating
a new building generation and activating it only after validation passes.

Notes:
- Run only from the server shell with environment variables already configured.
- The command reads the provider token from the server environment; never pass
  tokens on the command line.
- A full rebuild can take hours depending on provider limits and market size.
- Failure keeps the previous active cache and previous screening results usable.
- The web UI intentionally exposes no full-rebuild entry point.`);
}

function safeStage(stage: RefreshStageSnapshot) {
  return {
    type: "stage",
    stage: stage.stage,
    label: stage.label,
    status: stage.status,
    total: stage.total,
    completed: stage.completed,
    failed: stage.failed,
    durationMs: stage.durationMs,
    retryCount: stage.retryCount,
    errorSummary: stage.errorSummary,
  };
}

function printStage(stage: RefreshStageSnapshot) {
  console.log(JSON.stringify(safeStage(stage)));
}

function sanitizeCliError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/TUSHARE_TOKEN|REFRESH_DB_PATH/g, "[redacted-config]")
    .replace(/(token|authorization|cookie|headers?)\s*[:=]\s*[^,\s"}]+/gi, "$1=[redacted]")
    .replace(/[A-Z]:[\\/][^,\s"}]+|\/(?:Users|home|var|tmp)\/[^,\s"}]+/g, "[redacted-path]")
    .replace(/\b[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*\b/gi, "[redacted]")
    .slice(0, 240);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const token = readTushareTokenSecret();

  if (!token) {
    throw new Error("missing_config:TUSHARE_TOKEN");
  }

  const client = createTushareClient(token);
  const rebuild = await runFullMarketRebuild({
    client,
    onStage: printStage,
  });

  console.log(
    JSON.stringify({
      type: "summary",
      generationId: rebuild.result.generationId,
      stockCount: rebuild.result.stockCount,
      tradeDateCount: rebuild.result.tradeDateCount,
      dailyQuoteCount: rebuild.result.dailyQuoteCount,
      adjustmentFactorCount: rebuild.result.adjustmentFactorCount,
      operationStatus: rebuild.snapshot.latestOperation?.status ?? null,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      type: "error",
      errorSummary: sanitizeCliError(error),
    }),
  );
  process.exitCode = 1;
});
