import { expect, test, describe } from "bun:test";
import {
  generateOtpCode,
  isOtpExpired,
  remainingSeconds,
  attemptsRemaining,
  shouldSuspend,
  computeSuspendedUntil,
  constantTimeEqual,
  OTP_LENGTH,
} from "@/src/lib/otp";

describe("otp pure helpers", () => {
  test("generates a zero-padded 6-digit numeric code", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toHaveLength(OTP_LENGTH);
      expect(/^\d{6}$/.test(code)).toBe(true);
    }
  });

  test("isOtpExpired is true only at or after the expiry instant", () => {
    const now = 1_000_000;
    expect(isOtpExpired(now + 1, now)).toBe(false);
    expect(isOtpExpired(now, now)).toBe(true);
    expect(isOtpExpired(now - 1, now)).toBe(true);
  });

  test("remainingSeconds rounds up and never goes negative", () => {
    const now = 10_000;
    expect(remainingSeconds(now + 60_000, now)).toBe(60);
    expect(remainingSeconds(now + 1_500, now)).toBe(2); // ceil
    expect(remainingSeconds(now - 5_000, now)).toBe(0);
  });

  test("attemptsRemaining clamps at zero", () => {
    expect(attemptsRemaining(0, 3)).toBe(3);
    expect(attemptsRemaining(1, 3)).toBe(2);
    expect(attemptsRemaining(3, 3)).toBe(0);
    expect(attemptsRemaining(5, 3)).toBe(0);
  });

  test("shouldSuspend triggers at the configured threshold", () => {
    expect(shouldSuspend(2, 3)).toBe(false);
    expect(shouldSuspend(3, 3)).toBe(true);
    expect(shouldSuspend(4, 3)).toBe(true);
  });

  test("computeSuspendedUntil adds the suspend window", () => {
    const now = Date.parse("2026-06-13T00:00:00.000Z");
    const until = computeSuspendedUntil(now, 1);
    expect(until.toISOString()).toBe("2026-06-13T01:00:00.000Z");
  });

  test("constantTimeEqual matches equal strings and rejects different ones", () => {
    expect(constantTimeEqual("123456", "123456")).toBe(true);
    expect(constantTimeEqual("123456", "123457")).toBe(false);
    expect(constantTimeEqual("123456", "12345")).toBe(false); // differing length
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
