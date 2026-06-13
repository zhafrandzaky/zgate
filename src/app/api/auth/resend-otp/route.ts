import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { canResend, issueOtp } from "@/src/lib/otp";
import { sendOtpEmail } from "@/src/lib/mail";
import { env } from "@/src/lib/env";
import { ok, fail, ApiErrorCode } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resendSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
});

/**
 * POST /api/auth/resend-otp — re-issue a registration code, enforcing the 60s
 * Redis cooldown (docs/api/API.md §1).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, ApiErrorCode.invalid_request, "Request body must be valid JSON.");
  }

  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, ApiErrorCode.invalid_request, "A valid email is required.");
  }
  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isVerified: true },
    });
    if (!user) {
      return fail(404, ApiErrorCode.not_found, "No account found for this email.");
    }
    if (user.isVerified) {
      return fail(409, ApiErrorCode.conflict, "This account is already verified.");
    }

    const resend = await canResend(user.id, "REGISTER");
    if (!resend.allowed) {
      return fail(
        429,
        ApiErrorCode.rate_limited,
        "Please wait before requesting another code.",
        { retryAfterSeconds: resend.retryAfterSeconds },
        { "Retry-After": String(resend.retryAfterSeconds) },
      );
    }

    const code = await issueOtp(user.id, "REGISTER");
    await sendOtpEmail({ to: email, code, expiryMinutes: env.OTP_EXPIRY_MINUTES });

    return ok({ otpSent: true });
  } catch (error) {
    console.error("[auth/resend-otp] error:", (error as Error).message);
    return fail(500, ApiErrorCode.internal_error, "Could not resend the code.");
  }
}
