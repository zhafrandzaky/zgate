import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { verifyOtp } from "@/src/lib/otp";
import { sendWelcomeEmail } from "@/src/lib/mail";
import {
  signUserToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  USER_TOKEN_TTL_SECONDS,
} from "@/src/lib/auth";
import { ok, fail, ApiErrorCode } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifySchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
});

/**
 * POST /api/auth/verify-otp — confirm a registration code. On success marks the
 * account verified and issues the user session cookie (docs/api/API.md §1).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, ApiErrorCode.invalid_request, "Request body must be valid JSON.");
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, ApiErrorCode.invalid_request, "A valid email and 6-digit code are required.");
  }
  const { email, code } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isVerified: true },
    });
    if (!user) {
      return fail(404, ApiErrorCode.not_found, "No account found for this email.");
    }

    const result = await verifyOtp(user.id, "REGISTER", code);

    switch (result.status) {
      case "suspended":
        return fail(
          429,
          ApiErrorCode.rate_limited,
          "Too many incorrect attempts. Verification is locked for one hour.",
          { suspendedUntil: result.suspendedUntil.toISOString() },
          { "Retry-After": String(result.retryAfterSeconds) },
        );
      case "expired":
        return fail(410, ApiErrorCode.unprocessable, "This code has expired. Request a new one.", {
          code: "expired",
        });
      case "invalid":
        return fail(400, ApiErrorCode.invalid_request, "Incorrect code.", {
          attemptsLeft: result.attemptsLeft,
        });
      case "ok":
        break;
    }

    if (!user.isVerified) {
      await prisma.user.update({ where: { id: user.id }, data: { isVerified: true } });
    }

    const token = await signUserToken({ sub: user.id, email: user.email, role: user.role });
    await sendWelcomeEmail(user.email);

    const response = ok({ verified: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(USER_TOKEN_TTL_SECONDS));
    return response;
  } catch (error) {
    console.error("[auth/verify-otp] error:", (error as Error).message);
    return fail(500, ApiErrorCode.internal_error, "Could not verify the code.");
  }
}
