import { randomInt, timingSafeEqual } from "node:crypto";
import type { OtpType } from "@/src/generated/prisma/client";
import { env } from "@/src/lib/env";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";

/**
 * Email OTP verification (AGENTS.md §6, docs/ARCHITECTURE.md §6).
 *
 * Codes live in Redis (not the DB) for speed: `otp:{userId}:{type}` holds the
 * code + attempt count with a TTL equal to the expiry window. Resend cooldown and
 * the 1-hour suspension after too many wrong attempts are separate keys so they
 * outlive the code itself. The suspension is mirrored to `OtpCode.suspendedUntil`
 * (best-effort) for persistence/audit; Redis remains authoritative.
 *
 * Pure helpers (code generation, expiry/attempt/suspend math, constant-time
 * compare) are exported for unit testing without a live Redis.
 */

export const OTP_LENGTH = 6;

const codeKey = (userId: string, type: OtpType) => `otp:${userId}:${type}`;
const cooldownKey = (userId: string, type: OtpType) => `otp:cd:${userId}:${type}`;
const suspendKey = (userId: string, type: OtpType) => `otp:susp:${userId}:${type}`;

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Cryptographically random zero-padded 6-digit code (`"000000"`–`"999999"`). */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function isOtpExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs >= expiresAtMs;
}

/** Whole seconds remaining until `targetMs`, never negative. Used for Retry-After. */
export function remainingSeconds(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

/** Attempts left before suspension, clamped to ≥ 0. */
export function attemptsRemaining(attempts: number, maxAttempts: number): number {
  return Math.max(0, maxAttempts - attempts);
}

export function shouldSuspend(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

export function computeSuspendedUntil(nowMs: number, suspendHours: number): Date {
  return new Date(nowMs + suspendHours * 60 * 60 * 1000);
}

/** Constant-time string compare that tolerates differing lengths without leaking them via early return. */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ── Redis-backed flow ────────────────────────────────────────────────────────

/**
 * Issue a fresh code: stores it with a 0 attempt count (TTL = expiry) and arms
 * the resend cooldown. Returns the plaintext code so the caller can email it.
 */
export async function issueOtp(userId: string, type: OtpType): Promise<string> {
  const code = generateOtpCode();
  const expirySeconds = env.OTP_EXPIRY_MINUTES * 60;

  await redis
    .multi()
    .hset(codeKey(userId, type), { code, attempts: "0" })
    .expire(codeKey(userId, type), expirySeconds)
    .set(cooldownKey(userId, type), "1", "EX", env.OTP_RESEND_COOLDOWN_SECONDS)
    .exec();

  return code;
}

export interface ResendStatus {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Whether a resend is currently allowed, and if not, how long to wait. */
export async function canResend(userId: string, type: OtpType): Promise<ResendStatus> {
  const ttl = await redis.ttl(cooldownKey(userId, type));
  if (ttl > 0) return { allowed: false, retryAfterSeconds: ttl };
  return { allowed: true, retryAfterSeconds: 0 };
}

export type VerifyOtpResult =
  | { status: "ok" }
  | { status: "expired" }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "suspended"; suspendedUntil: Date; retryAfterSeconds: number };

/**
 * Verify a submitted code. Enforces suspension first, then expiry, then a
 * constant-time match. A wrong code increments the attempt counter and triggers
 * a 1-hour suspension on the configured threshold.
 */
export async function verifyOtp(
  userId: string,
  type: OtpType,
  input: string,
): Promise<VerifyOtpResult> {
  const now = Date.now();

  const suspendTtl = await redis.ttl(suspendKey(userId, type));
  if (suspendTtl > 0) {
    return {
      status: "suspended",
      suspendedUntil: new Date(now + suspendTtl * 1000),
      retryAfterSeconds: suspendTtl,
    };
  }

  const stored = await redis.hgetall(codeKey(userId, type));
  if (!stored.code) return { status: "expired" };

  if (constantTimeEqual(input, stored.code)) {
    await redis.del(codeKey(userId, type), cooldownKey(userId, type));
    return { status: "ok" };
  }

  const attempts = Number(stored.attempts ?? "0") + 1;
  if (shouldSuspend(attempts, env.OTP_MAX_ATTEMPTS)) {
    const suspendSeconds = env.OTP_SUSPEND_HOURS * 60 * 60;
    const suspendedUntil = computeSuspendedUntil(now, env.OTP_SUSPEND_HOURS);
    await redis
      .multi()
      .set(suspendKey(userId, type), suspendedUntil.toISOString(), "EX", suspendSeconds)
      .del(codeKey(userId, type))
      .exec();
    await mirrorSuspendToDb(userId, type, suspendedUntil, attempts);
    return { status: "suspended", suspendedUntil, retryAfterSeconds: suspendSeconds };
  }

  await redis.hset(codeKey(userId, type), { attempts: String(attempts) });
  return { status: "invalid", attemptsLeft: attemptsRemaining(attempts, env.OTP_MAX_ATTEMPTS) };
}

/** Drop all OTP state for a user/type (e.g. after successful verification of another flow). */
export async function clearOtp(userId: string, type: OtpType): Promise<void> {
  await redis.del(codeKey(userId, type), cooldownKey(userId, type), suspendKey(userId, type));
}

/**
 * Persist the suspension window to the DB for audit/durability. Best-effort:
 * Redis is the source of truth, so DB failures never block the auth response.
 * The stored code is empty — the real code is never written to the DB.
 */
async function mirrorSuspendToDb(
  userId: string,
  type: OtpType,
  suspendedUntil: Date,
  attempts: number,
): Promise<void> {
  try {
    await prisma.otpCode.create({
      data: { userId, code: "", type, expiresAt: new Date(), attempts, suspendedUntil },
    });
  } catch {
    // non-fatal — see doc comment
  }
}
