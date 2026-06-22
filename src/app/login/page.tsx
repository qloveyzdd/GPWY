import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSessionCookie, verifyPasswordInput } from "@/lib/auth/session";

async function loginAction(formData: FormData) {
  "use server";

  const password = String(formData.get("password") ?? "");

  if (verifyPasswordInput(password)) {
    await createSessionCookie();
    redirect("/");
  }

  redirect("/login?error=1");
}

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-16 sm:py-24">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold leading-[1.2]">
            A 股下降区间筛选
          </h1>
          <p className="text-[16px] leading-[1.5] text-muted-foreground">
            输入访问密码后查看数据源状态。
          </p>
        </div>

        <form action={loginAction} className="mt-8 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-[14px] leading-[1.4] text-foreground"
            >
              访问密码
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={hasError}
              aria-describedby={hasError ? "password-error" : undefined}
              className="min-h-11"
              required
            />
            {hasError ? (
              <p
                id="password-error"
                className="text-[14px] leading-[1.4] text-destructive"
              >
                密码错误，请重新输入。
              </p>
            ) : null}
          </div>

          <Button type="submit" className="min-h-11 w-full">
            进入工作台
          </Button>
        </form>
      </section>
    </main>
  );
}
