import type { NextRequest } from "next/server";
import { prisma } from "@/src/lib/db";
import { verifyUserToken, SESSION_COOKIE } from "@/src/lib/auth";
import { ok, fail, ApiErrorCode } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — current user from the session cookie. Re-reads the DB so a
 * banned/deleted account is rejected even while a valid JWT lingers
 * (docs/api/API.md §1).
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifyUserToken(token) : null;
  if (!payload) {
    return fail(401, ApiErrorCode.unauthorized, "Not authenticated.");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isBanned: true, createdAt: true },
    });
    if (!user) {
      return fail(401, ApiErrorCode.unauthorized, "Not authenticated.");
    }
    if (user.isBanned) {
      return fail(403, ApiErrorCode.forbidden, "This account has been suspended.", {
        code: "banned",
      });
    }

    return ok({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[auth/me] error:", (error as Error).message);
    return fail(500, ApiErrorCode.internal_error, "Could not load the current user.");
  }
}
