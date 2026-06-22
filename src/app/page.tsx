import { redirect } from "next/navigation";

import { StatusWorkspace } from "@/components/status/status-workspace";
import { clearSessionCookie, getSession } from "@/lib/auth/session";
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
      logoutAction={logoutAction}
    />
  );
}
