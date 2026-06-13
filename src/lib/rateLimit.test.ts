import { expect, test, describe } from "bun:test";
import {
  slidingWindowDecision,
  rateLimitHeaders,
  RATE_LIMITS,
  rateLimitKeys,
} from "@/src/lib/rateLimit";

const WINDOW_MS = 60_000;
const NOW = 1_000_000;

describe("slidingWindowDecision", () => {
  test("allows when the window is empty", () => {
    const decision = slidingWindowDecision(0, null, NOW, WINDOW_MS, 5);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(4); // current request consumes one slot
    expect(decision.retryAfterSeconds).toBe(0);
  });

  test("allows while below the limit and reports remaining slots", () => {
    const decision = slidingWindowDecision(3, NOW - 10_000, NOW, WINDOW_MS, 5);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(1);
  });

  test("blocks at the limit with a Retry-After until the oldest entry ages out", () => {
    const oldest = NOW - 20_000; // frees at NOW + 40s
    const decision = slidingWindowDecision(5, oldest, NOW, WINDOW_MS, 5);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterSeconds).toBe(40);
  });

  test("retryAfter is at least one second when blocked", () => {
    const oldest = NOW - WINDOW_MS; // frees exactly now
    const decision = slidingWindowDecision(5, oldest, NOW, WINDOW_MS, 5);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  test("blocks over the limit even without an oldest timestamp", () => {
    const decision = slidingWindowDecision(10, null, NOW, WINDOW_MS, 5);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(60);
  });
});

describe("rateLimitHeaders", () => {
  test("emits X-RateLimit-* and Retry-After only when blocked", () => {
    const minuteOk = slidingWindowDecision(1, NOW - 1000, NOW, WINDOW_MS, RATE_LIMITS.apiPerMinute);
    const hourOk = slidingWindowDecision(1, NOW - 1000, NOW, 3_600_000, RATE_LIMITS.apiPerHour);
    const headers = rateLimitHeaders(minuteOk, hourOk);

    expect(headers["X-RateLimit-Limit-Minute"]).toBe("60");
    expect(headers["X-RateLimit-Limit-Hour"]).toBe("1000");
    expect(headers["Retry-After"]).toBeUndefined();

    const minuteBlocked = slidingWindowDecision(
      60,
      NOW - 30_000,
      NOW,
      WINDOW_MS,
      RATE_LIMITS.apiPerMinute,
    );
    const blockedHeaders = rateLimitHeaders(minuteBlocked, hourOk);
    expect(blockedHeaders["Retry-After"]).toBe("30");
    expect(blockedHeaders["X-RateLimit-Remaining-Minute"]).toBe("0");
  });
});

describe("rateLimitKeys", () => {
  test("namespaces keys per scope", () => {
    expect(rateLimitKeys.apiMinute("u1")).toBe("rl:api:u1:minute");
    expect(rateLimitKeys.apiHour("u1")).toBe("rl:api:u1:hour");
    expect(rateLimitKeys.login("1.2.3.4")).toBe("rl:auth:login:1.2.3.4");
    expect(rateLimitKeys.register("1.2.3.4")).toBe("rl:auth:register:1.2.3.4");
  });
});
