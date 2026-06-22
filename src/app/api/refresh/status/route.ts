import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readRefreshStatus } from "@/lib/refresh/refresh-runner";

export async function GET() {
  const session = await getSession();

  if (!session.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(readRefreshStatus());
}
