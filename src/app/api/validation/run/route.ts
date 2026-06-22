import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  createConfigValidationSnapshot,
  loadServerConfig,
} from "@/lib/config";
import { writeValidationSnapshot } from "@/lib/validation-store";

export async function POST() {
  const session = await getSession();

  if (!session.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = createConfigValidationSnapshot(loadServerConfig());
  writeValidationSnapshot(snapshot);

  return NextResponse.json(snapshot);
}
