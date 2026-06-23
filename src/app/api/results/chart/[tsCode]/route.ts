import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readLatestChartSnapshot } from "@/lib/results/chart-data";

type RouteContext = {
  params: Promise<{
    tsCode: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getSession();

  if (!session.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { tsCode } = await params;

  return NextResponse.json(readLatestChartSnapshot(decodeURIComponent(tsCode)));
}
