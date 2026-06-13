import { env } from "@/src/lib/env";

/**
 * Mail interface — STUB.
 *
 * The real implementation (React Email templates + Resend/SMTP transport) lands
 * in TASK-003 (docs/email/EMAIL.md). This stub exists so the auth flow can be
 * built and run now: in non-production it logs the OTP to the server console so a
 * developer can complete verification locally; in production it is a no-op until
 * TASK-003 replaces it. Keep this signature stable so TASK-003 is a drop-in swap.
 */

export interface OtpEmailParams {
  to: string;
  code: string;
  expiryMinutes: number;
}

export async function sendOtpEmail(params: OtpEmailParams): Promise<void> {
  if (env.NODE_ENV !== "production") {
    // Dev-only convenience until TASK-003 wires real email transport.
    console.info(
      `[mail:stub] OTP for ${params.to}: ${params.code} (expires in ${params.expiryMinutes}m)`,
    );
  }
}

export async function sendWelcomeEmail(to: string): Promise<void> {
  if (env.NODE_ENV !== "production") {
    // Dev-only convenience until TASK-003 wires real email transport.
    console.info(`[mail:stub] welcome email queued for ${to}`);
  }
}
