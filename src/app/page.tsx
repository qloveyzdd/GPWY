import { redirect } from "next/navigation";

import { StatusWorkspace } from "@/components/status/status-workspace";
import { clearSessionCookie, getSession } from "@/lib/auth/session";
import { readRefreshStatus } from "@/lib/refresh/refresh-runner";
import { readLatestResultsSnapshot } from "@/lib/results/results-snapshot";
import { readLatestValidationSnapshot } from "@/lib/validation-store";

export const dynamic = "force-dynamic";

async function logoutAction() {
  "use server";

  await clearSessionCookie();
  redirect("/login");
}

export default async function Home() {
  const session = await getSession();

  if (!session.authenticated) {
    redirect("/login");
  }

  return (
    <StatusWorkspace
      initialSnapshot={readLatestValidationSnapshot()}
      initialRefreshStatus={readRefreshStatus()}
      initialResultsSnapshot={readLatestResultsSnapshot()}
      logoutAction={logoutAction}
    />
  );
}
