import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { verifyPassword } from "@/src/lib/password";
import {
  signUserToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  USER_TOKEN_TTL_SECONDS,
} from "@/src/lib/auth";
import { checkRateLimit, rateLimitKeys, RATE_LIMITS } from "@/src/lib/rateLimit";
import { ok, fail, ApiErrorCode, getClientIp } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/login — email + password. Verifies the password BEFORE
 * surfacing ban/verification status so neither can be probed without valid
 * credentials. Rate limited to 5 attempts/15min per IP (docs/api/API.md §1).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(
    rateLimitKeys.login(ip),
    RATE_LIMITS.login.limit,
    RATE_LIMITS.login.windowSeconds,
  );
  if (!limit.allowed) {
    return fail(
      429,
      ApiErrorCode.rate_limited,
      "Too many login attempts. Try again later.",
      undefined,
      {
        "Retry-After": String(limit.retryAfterSeconds),
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, ApiErrorCode.invalid_request, "Request body must be valid JSON.");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, ApiErrorCode.invalid_request, "Email and password are required.");
  }
  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
        isVerified: true,
        isBanned: true,
        bannedReason: true,
      },
    });

    const passwordOk = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !passwordOk) {
      return fail(401, ApiErrorCode.unauthorized, "Incorrect email or password.");
    }

    if (user.isBanned) {
      return fail(403, ApiErrorCode.forbidden, "This account has been suspended.", {
        code: "banned",
        bannedReason: user.bannedReason,
      });
    }
    if (!user.isVerified) {
      return fail(403, ApiErrorCode.forbidden, "Please verify your email before signing in.", {
        code: "not_verified",
      });
    }

    const token = await signUserToken({ sub: user.id, email: user.email, role: user.role });

    void prisma.userAuditLog
      .create({
        data: {
          userId: user.id,
          action: "LOGIN",
          ip,
          userAgent: request.headers.get("user-agent") ?? undefined,
        },
      })
      .catch(() => undefined);

    const response = ok({ user: { id: user.id, email: user.email } });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(USER_TOKEN_TTL_SECONDS));
    return response;
  } catch (error) {
    console.error("[auth/login] error:", (error as Error).message);
    return fail(500, ApiErrorCode.internal_error, "Could not complete sign-in.");
  }
}
