import { describe, expect, test } from "bun:test";
import { render } from "@react-email/components";
import OtpEmail from "./OtpEmail";
import PasswordResetEmail from "./PasswordResetEmail";
import WelcomeEmail from "./WelcomeEmail";
import BanNotificationEmail from "./BanNotificationEmail";
import BroadcastEmail from "./BroadcastEmail";
import { subjects } from "./subjects";

/**
 * Templates are rendered to real HTML so we assert on output, not markup
 * internals (per common/testing.md). Every template is also checked for emoji to
 * enforce the AGENTS.md "no emoji in emails" rule.
 */

// Matches any emoji/pictographic glyph; the allowed unicode punctuation
// (arrow / bullet / em dash) is not Extended_Pictographic, so it passes.
const EMOJI = /\p{Extended_Pictographic}/u;

describe("email subjects", () => {
  test("otp and reset subjects embed the code", () => {
    expect(subjects.otp("123456")).toBe("Your ZGate verification code: 123456");
    expect(subjects.passwordReset("654321")).toBe("Reset your ZGate password: 654321");
  });

  test("static subjects match the spec", () => {
    expect(subjects.welcome()).toBe("Welcome to ZGate!");
    expect(subjects.ban()).toBe("Your ZGate account has been suspended");
    expect(subjects.unban()).toBe("Your ZGate account has been restored");
  });
});

describe("OtpEmail", () => {
  test("shows the code, expiry, and do-not-share warning", async () => {
    const html = await render(<OtpEmail code="318204" expiryMinutes={10} />);
    expect(html).toContain("318204");
    expect(html).toContain("expires in 10 minutes");
    expect(html).toContain("Do not share this code");
  });

  test("plain-text fallback contains the code", async () => {
    const text = await render(<OtpEmail code="318204" expiryMinutes={10} />, {
      plainText: true,
    });
    expect(text).toContain("318204");
  });

  test("no emoji", async () => {
    const html = await render(<OtpEmail code="318204" expiryMinutes={10} />);
    expect(EMOJI.test(html)).toBe(false);
  });
});

describe("PasswordResetEmail", () => {
  test("shows reset copy and the code", async () => {
    const html = await render(<PasswordResetEmail code="904512" expiryMinutes={10} />);
    expect(html).toContain("Reset your password");
    expect(html).toContain("904512");
    expect(EMOJI.test(html)).toBe(false);
  });
});

describe("WelcomeEmail", () => {
  test("lists the setup steps, gateway URL, and CTA", async () => {
    const html = await render(<WelcomeEmail userName="user@example.com" />);
    expect(html).toContain("Welcome to ZGate");
    expect(html).toContain("Connect your first AI provider");
    expect(html).toContain("Create a combo");
    expect(html).toContain("Generate an API key");
    expect(html).toContain("/v1");
    expect(html).toContain("Go to Dashboard");
    expect(EMOJI.test(html)).toBe(false);
  });
});

describe("BanNotificationEmail", () => {
  test("banned variant shows the reason and suspension copy", async () => {
    const html = await render(
      <BanNotificationEmail
        userName="user@example.com"
        variant="banned"
        reason="Abuse of the acceptable use policy."
      />,
    );
    expect(html).toContain("has been suspended");
    expect(html).toContain("Abuse of the acceptable use policy.");
    expect(EMOJI.test(html)).toBe(false);
  });

  test("restored variant confirms access and links to the dashboard", async () => {
    const html = await render(
      <BanNotificationEmail userName="user@example.com" variant="restored" />,
    );
    expect(html).toContain("has been restored");
    expect(html).toContain("Go to Dashboard");
    expect(EMOJI.test(html)).toBe(false);
  });
});

describe("BroadcastEmail", () => {
  test("wraps admin content in the branded layout", async () => {
    const html = await render(
      <BroadcastEmail subject="Maintenance notice" contentHtml="<p>Scheduled maintenance.</p>" />,
    );
    expect(html).toContain("Scheduled maintenance.");
    expect(html).toContain("ZGate");
    expect(EMOJI.test(html)).toBe(false);
  });
});
