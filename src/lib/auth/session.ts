import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { readAppPasswordSecret } from "@/lib/config";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/constants";

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };

type SessionPayload = {
  v: 1;
  iat: number;
  exp: number;
};

export type SessionState = {
  authenticated: boolean;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function createSignedSessionValue(
  appPassword: string,
  now = Date.now(),
) {
  const payload: SessionPayload = {
    v: 1,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, appPassword);

  return `${encodedPayload}.${signature}`;
}

export function verifySignedSessionValue(
  cookieValue: string | undefined,
  appPassword: string,
  now = Date.now(),
) {
  if (!cookieValue) {
    return false;
  }

  const [encodedPayload, signature, unexpected] = cookieValue.split(".");

  if (!encodedPayload || !signature || unexpected) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload, appPassword);

  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;

    return payload.v === 1 && payload.exp >= Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function verifyPasswordInput(input: string) {
  const appPassword = readAppPasswordSecret();

  if (!appPassword) {
    return false;
  }

  return safeEqual(input, appPassword);
}

export async function getSession(): Promise<SessionState> {
  const appPassword = readAppPasswordSecret();

  if (!appPassword) {
    return { authenticated: false };
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return {
    authenticated: verifySignedSessionValue(cookieValue, appPassword),
  };
}

export async function createSessionCookie() {
  const appPassword = readAppPasswordSecret();

  if (!appPassword) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: createSignedSessionValue(appPassword),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return true;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
