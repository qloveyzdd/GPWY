import { createInterface } from "node:readline";

const lines = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let initialized = false;
let active = 0;

function emit(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleQuery(message) {
  const mode = message.params?.mode ?? "echo";
  if (mode === "exit") {
    process.exit(23);
  }
  if (mode === "malformed") {
    process.stdout.write("not-json\n");
    return;
  }

  active += 1;
  const observedActive = active;
  if (mode === "delay") {
    await new Promise((resolve) =>
      setTimeout(resolve, Number(message.params?.delay_ms ?? 100)),
    );
  }

  emit({
    type: "result",
    request_id: message.request_id,
    ok: true,
    data: {
      fields: ["pid", "active", ...message.fields],
      items: [
        [
          process.pid,
          observedActive,
          ...message.fields.map((field) =>
            field === "encoding"
              ? process.env.PYTHONIOENCODING
              : (message.params?.[field] ?? null),
          ),
        ],
      ],
    },
  });
  active -= 1;
}

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (!initialized) {
    if (message.type !== "init") {
      emit({ type: "error", category: "unknown", message: "init required" });
      process.exitCode = 2;
      lines.close();
      return;
    }
    initialized = true;
    emit({ type: "ready" });
    return;
  }

  if (message.type === "shutdown") {
    lines.close();
    process.stdin.pause();
    return;
  }
  if (message.type === "query") {
    void handleQuery(message);
  }
});
