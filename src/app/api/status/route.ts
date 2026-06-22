import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readLatestValidationSnapshot } from "@/lib/validation-store";

export async function GET() {
  const session = await getSession();

  if (!session.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(readLatestValidationSnapshot());
}
