import { describe, expect, test } from "bun:test";
import { render } from "@react-email/components";
import { cleanPlainText } from "./plaintext";
import OtpEmail from "./OtpEmail";

// Escape-sequence forms of the padding characters React Email's <Preview> emits.
const ZERO_WIDTH = /[​-\u200F⁠͏﻿]/;
const WHITESPACE_ONLY_LINE = /^[ \t ]+$/;

describe("cleanPlainText", () => {
  test("strips zero-width and non-breaking-space preview padding", () => {
    const padded = "Header line\n‌  ‍ \n\nReal body.";
    expect(cleanPlainText(padded)).toBe("Header line\n\nReal body.");
  });

  test("collapses runs of blank lines to a single blank line", () => {
    expect(cleanPlainText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  test("real OTP render has no leftover whitespace-only or zero-width lines", async () => {
    const raw = await render(<OtpEmail code="318204" expiryMinutes={10} />, {
      plainText: true,
    });
    const cleaned = cleanPlainText(raw);

    expect(cleaned).toContain("318204");
    expect(cleaned).toContain("This code expires in 10 minutes.");
    expect(cleaned.split("\n").some((line) => WHITESPACE_ONLY_LINE.test(line))).toBe(false);
    expect(ZERO_WIDTH.test(cleaned)).toBe(false);
    expect(cleaned.includes("\n\n\n")).toBe(false);
  });
});
