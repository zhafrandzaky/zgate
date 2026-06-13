import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { issueOtp } from "@/src/lib/otp";
import { sendOtpEmail } from "@/src/lib/mail";
import { env } from "@/src/lib/env";
import { checkRateLimit, rateLimitKeys, RATE_LIMITS } from "@/src/lib/rateLimit";
import { ok, fail, ApiErrorCode, getClientIp } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

/**
 * POST /api/auth/register — create an unverified user and email a 6-digit OTP.
 * Rate limited to 3 attempts/hour per IP (docs/api/API.md §1).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(
    rateLimitKeys.register(ip),
    RATE_LIMITS.register.limit,
    RATE_LIMITS.register.windowSeconds,
  );
  if (!limit.allowed) {
    return fail(
      429,
      ApiErrorCode.rate_limited,
      "Too many registration attempts. Try again later.",
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

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, ApiErrorCode.invalid_request, "Invalid email or password (min 8 characters).");
  }
  const { email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return fail(409, ApiErrorCode.conflict, "Email is already registered.");
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, isVerified: false },
      select: { id: true },
    });

    const code = await issueOtp(user.id, "REGISTER");
    await sendOtpEmail({ to: email, code, expiryMinutes: env.OTP_EXPIRY_MINUTES });

    return ok({ userId: user.id, otpSent: true });
  } catch (error) {
    console.error("[auth/register] error:", (error as Error).message);
    return fail(500, ApiErrorCode.internal_error, "Could not complete registration.");
  }
}
