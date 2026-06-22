import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { runBasicValidation } from "@/lib/validation/run-basic-validation";

export async function POST() {
  const session = await getSession();

  if (!session.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await runBasicValidation();

  return NextResponse.json(snapshot);
}
