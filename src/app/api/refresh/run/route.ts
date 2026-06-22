import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { startManualRefresh } from "@/lib/refresh/refresh-runner";

export async function POST() {
  const session = await getSession();

  if (!session.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await startManualRefresh();

  return NextResponse.json(result, { status: result.started ? 202 : 200 });
}
