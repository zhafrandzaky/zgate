import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { brand, monoStack } from "../theme";

/**
 * Small inline-styled building blocks shared across templates so the code box,
 * primary CTA, and notice callouts stay consistent and are defined once.
 */

export function EmailHeading({ children }: { children: React.ReactNode }) {
  return <Heading style={headingStyle}>{children}</Heading>;
}

export function EmailText({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return <Text style={muted ? textMuted : textBase}>{children}</Text>;
}

export function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={ctaWrap}>
      <Button href={href} style={ctaStyle}>
        {children}
      </Button>
    </Section>
  );
}

/** Large, wide-tracked 6-digit code box (docs/email/EMAIL.md §1 design spec). */
export function OtpCodeDisplay({ code }: { code: string }) {
  return (
    <Section style={codeBox}>
      <Text style={codeText}>{code}</Text>
    </Section>
  );
}

export type NoticeTone = "warning" | "danger" | "info";

/** Callout box used for OTP warnings, ban reasons, and restore notices. */
export function NoticeBox({
  tone,
  children,
}: {
  tone: NoticeTone;
  children: React.ReactNode;
}) {
  return <Section style={noticeStyles[tone]}>{children}</Section>;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  color: brand.text,
  fontSize: "22px",
  fontWeight: 700,
  lineHeight: "30px",
  margin: "0 0 12px",
};

const textBase: React.CSSProperties = {
  color: brand.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const textMuted: React.CSSProperties = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 16px",
};

const ctaWrap: React.CSSProperties = {
  textAlign: "center",
  margin: "8px 0 4px",
};

const ctaStyle: React.CSSProperties = {
  backgroundColor: brand.accent,
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 28px",
  borderRadius: "8px",
  display: "inline-block",
};

const codeBox: React.CSSProperties = {
  backgroundColor: brand.accentSoftBg,
  border: `1px solid ${brand.accentBorder}`,
  borderRadius: "10px",
  padding: "20px",
  textAlign: "center",
  margin: "8px 0 20px",
};

const codeText: React.CSSProperties = {
  color: brand.logoCream,
  fontFamily: monoStack,
  fontSize: "32px",
  fontWeight: 700,
  letterSpacing: "8px",
  lineHeight: "40px",
  margin: 0,
};

const noticeBase: React.CSSProperties = {
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "0 0 16px",
};

const noticeStyles: Record<NoticeTone, React.CSSProperties> = {
  warning: {
    ...noticeBase,
    backgroundColor: brand.raisedBg,
    border: `1px solid ${brand.border}`,
  },
  danger: {
    ...noticeBase,
    backgroundColor: brand.dangerBg,
    border: `1px solid ${brand.dangerBorder}`,
  },
  info: {
    ...noticeBase,
    backgroundColor: brand.accentSoftBg,
    border: `1px solid ${brand.accentBorder}`,
  },
};
