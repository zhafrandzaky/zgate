import { SignJWT, jwtVerify } from "jose";
import { env } from "@/src/lib/env";

/**
 * JWT signing / verification for user and admin sessions.
 *
 * Two SEPARATE secrets back two SEPARATE token families (AGENTS.md §6,
 * docs/ARCHITECTURE.md §19): a user token signed with `JWT_SECRET` is never
 * accepted by the admin verifier and vice-versa. This module is intentionally
 * dependency-light (only `jose` + env) so it runs inside the Edge middleware.
 */

const ALG = "HS256";

export const SESSION_COOKIE = "zg_session";
export const ADMIN_SESSION_COOKIE = "zg_admin_session";

/** Token lifetimes. Admin sessions are shorter-lived than user sessions. */
export const USER_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type UserRole = "USER" | "ADMIN";

export interface UserTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AdminTokenPayload {
  sub: string;
  email: string;
  role: "ADMIN";
}

function userSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

function adminSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_ADMIN_SECRET);
}

async function sign(
  secret: Uint8Array,
  payload: Record<string, unknown>,
  subject: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export function signUserToken(payload: UserTokenPayload): Promise<string> {
  return sign(
    userSecret(),
    { email: payload.email, role: payload.role },
    payload.sub,
    USER_TOKEN_TTL_SECONDS,
  );
}

export function signAdminToken(payload: AdminTokenPayload): Promise<string> {
  return sign(
    adminSecret(),
    { email: payload.email, role: "ADMIN" },
    payload.sub,
    ADMIN_TOKEN_TTL_SECONDS,
  );
}

/** Verify a user session token. Returns `null` on any failure (expired, bad signature, wrong secret). */
export async function verifyUserToken(token: string): Promise<UserTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, userSecret(), { algorithms: [ALG] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    const role = payload.role === "ADMIN" ? "ADMIN" : "USER";
    return { sub: payload.sub, email: payload.email, role };
  } catch {
    return null;
  }
}

/** Verify an admin session token. Returns `null` unless the token is valid AND carries the ADMIN role. */
export async function verifyAdminToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, adminSecret(), { algorithms: [ALG] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    if (payload.role !== "ADMIN") return null;
    return { sub: payload.sub, email: payload.email, role: "ADMIN" };
  } catch {
    return null;
  }
}

interface CookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

/** HttpOnly cookie options. `secure` is enabled outside development. */
export function sessionCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
