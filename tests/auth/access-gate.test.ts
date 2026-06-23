// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "@/proxy";
import {
  createSignedSessionValue,
  SESSION_COOKIE_NAME,
  verifySignedSessionValue,
} from "@/lib/auth/session";

function requestFor(path: string) {
  return new NextRequest(new Request(`http://localhost${path}`));
}

describe("access gate", () => {
  it("redirects unauthenticated workspace requests to login", () => {
    const response = proxy(requestFor("/"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/login");
  });

  it("rejects unauthenticated validation API requests", async () => {
    const response = proxy(requestFor("/api/validation/run"));

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("rejects unauthenticated refresh API requests", async () => {
    const response = proxy(requestFor("/api/refresh/run"));

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("signs sessions and rejects tampered cookie values", () => {
    const now = new Date("2026-06-23T00:00:00.000Z").getTime();
    const cookieValue = createSignedSessionValue("local-password", now);

    expect(verifySignedSessionValue(cookieValue, "local-password", now)).toBe(
      true,
    );
    expect(
      verifySignedSessionValue(`${cookieValue}tampered`, "local-password", now),
    ).toBe(false);
  });

  it("allows middleware to continue when a session cookie is present", () => {
    const request = requestFor("/");
    request.cookies.set(SESSION_COOKIE_NAME, "present");

    const response = proxy(request);

    expect(response?.headers.get("x-middleware-next")).toBe("1");
  });
});
