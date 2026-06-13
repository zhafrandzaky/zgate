import { randomUUID } from "node:crypto";
import { redis } from "@/src/lib/redis";

/**
 * Redis sliding-window rate limiter (docs/api/API.md §5, AGENTS.md §6).
 *
 * Each limited bucket is a Redis sorted set whose members are individual request
 * timestamps. On every check we drop entries older than the window, count what
 * remains, and admit the request only if the count is below the limit. The
 * decision math (`slidingWindowDecision`) is pure and unit-tested; Redis just
 * supplies the timestamp set.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Configured ceiling for the window. */
  limit: number;
  /** Requests still permitted in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window frees a slot (for `Retry-After`); 0 when allowed. */
  retryAfterSeconds: number;
}

/**
 * Pure decision given the timestamps already inside the window. `count` is the
 * number of requests in `[now - windowMs, now]` BEFORE admitting the current one.
 * `oldestMs` is the earliest such timestamp (or null when the window is empty).
 */
export function slidingWindowDecision(
  count: number,
  oldestMs: number | null,
  nowMs: number,
  windowMs: number,
  limit: number,
): RateLimitDecision {
  if (count >= limit) {
    const freesAt = (oldestMs ?? nowMs) + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((freesAt - nowMs) / 1000));
    return { allowed: false, limit, remaining: 0, retryAfterSeconds };
  }
  // The current request consumes one slot once admitted.
  const remaining = Math.max(0, limit - count - 1);
  return { allowed: true, limit, remaining, retryAfterSeconds: 0 };
}

/**
 * Check (and, when allowed, record) one request against a sliding window.
 * Fails OPEN: if Redis is unavailable the request is allowed rather than
 * locking every user out (docs/ARCHITECTURE.md §17).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  try {
    await redis.zremrangebyscore(key, 0, windowStart);
    const count = await redis.zcard(key);
    const oldest = count > 0 ? await redis.zrange(key, 0, 0, "WITHSCORES") : [];
    const oldestMs = oldest.length >= 2 ? Number(oldest[1]) : null;

    const decision = slidingWindowDecision(count, oldestMs, now, windowMs, limit);
    if (decision.allowed) {
      await redis.zadd(key, now, `${now}:${randomUUID()}`);
      await redis.expire(key, windowSeconds);
    }
    return decision;
  } catch (error) {
    console.error("[rateLimit] redis error, failing open:", (error as Error).message);
    return { allowed: true, limit, remaining: limit - 1, retryAfterSeconds: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configured limits & key builders
// ─────────────────────────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  apiPerMinute: 60,
  apiPerHour: 1000,
  login: { limit: 5, windowSeconds: 15 * 60 },
  register: { limit: 3, windowSeconds: 60 * 60 },
} as const;

export const rateLimitKeys = {
  apiMinute: (userId: string) => `rl:api:${userId}:minute`,
  apiHour: (userId: string) => `rl:api:${userId}:hour`,
  login: (ip: string) => `rl:auth:login:${ip}`,
  register: (ip: string) => `rl:auth:register:${ip}`,
} as const;

export interface UserApiLimits {
  perMinute: number;
  perHour: number;
}

const overrideKey = (userId: string) => `rl:override:${userId}`;

/**
 * Per-user API limit overrides (admin-configurable, UI in TASK-017). Storage is
 * prepared here; falls back to the global defaults when no override is set.
 */
export async function getUserApiLimits(userId: string): Promise<UserApiLimits> {
  try {
    const raw = await redis.get(overrideKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserApiLimits>;
      return {
        perMinute: parsed.perMinute ?? RATE_LIMITS.apiPerMinute,
        perHour: parsed.perHour ?? RATE_LIMITS.apiPerHour,
      };
    }
  } catch {
    // fall through to defaults
  }
  return { perMinute: RATE_LIMITS.apiPerMinute, perHour: RATE_LIMITS.apiPerHour };
}

export async function setUserApiLimits(userId: string, limits: UserApiLimits): Promise<void> {
  await redis.set(overrideKey(userId), JSON.stringify(limits));
}

export async function clearUserApiLimits(userId: string): Promise<void> {
  await redis.del(overrideKey(userId));
}

/** Build the `X-RateLimit-*` headers for `/v1/*` responses (docs/api/API.md §5). */
export function rateLimitHeaders(
  minute: RateLimitDecision,
  hour: RateLimitDecision,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit-Minute": String(minute.limit),
    "X-RateLimit-Remaining-Minute": String(minute.remaining),
    "X-RateLimit-Limit-Hour": String(hour.limit),
    "X-RateLimit-Remaining-Hour": String(hour.remaining),
  };
  const retryAfter = Math.max(minute.retryAfterSeconds, hour.retryAfterSeconds);
  if (retryAfter > 0) headers["Retry-After"] = String(retryAfter);
  return headers;
}
