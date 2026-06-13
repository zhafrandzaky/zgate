/**
 * Subject lines, kept in one pure module so `src/lib/mail.ts` and the template
 * tests share a single source of truth (docs/email/EMAIL.md §2). No env import —
 * stays unit-testable without app secrets.
 *
 * The OTP/reset subjects intentionally embed the code: it surfaces in the mail
 * client preview line, which users expect for verification mail.
 */
import { brand } from "./theme";

/** Fallback `From` when `EMAIL_FROM` is unset (preview/test only — prod uses env). */
export const EMAIL_FROM_FALLBACK = `${brand.name} <noreply@zgate.ziron.dev>`;

export const subjects = {
  otp: (code: string): string => `Your ${brand.name} verification code: ${code}`,
  passwordReset: (code: string): string => `Reset your ${brand.name} password: ${code}`,
  welcome: (): string => `Welcome to ${brand.name}!`,
  ban: (): string => `Your ${brand.name} account has been suspended`,
  unban: (): string => `Your ${brand.name} account has been restored`,
} as const;
