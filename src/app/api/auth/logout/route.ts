import { SESSION_COOKIE, sessionCookieOptions } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout — clear the user session cookie (docs/api/API.md §1).
 * Idempotent: succeeds whether or not a session was present.
 */
export function POST() {
  const response = ok({ loggedOut: true });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
