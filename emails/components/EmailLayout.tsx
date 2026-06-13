import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { baseUrl, brand, fontStack, SUPPORT_EMAIL } from "../theme";

/**
 * Base layout for every ZGate email: dark card on a dark page, brand header,
 * shared footer (docs/email/EMAIL.md). Reusable with arbitrary `children` so the
 * admin broadcast template can drop converted markdown straight in.
 *
 * Brand mark note: the header uses a typographic "ZGate" wordmark rather than an
 * embedded image. Gmail/Outlook block inline SVG and there is no hosted raster
 * asset yet; a styled wordmark renders identically in every client and matches
 * the email "text only, no lucide-react" rule in AGENTS.md.
 */
export interface EmailLayoutProps {
  /** Inbox preview/snippet line (hidden in the body). */
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  const dashboardUrl = `${baseUrl()}/dashboard`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Link href={baseUrl()} style={wordmarkLink}>
              <span style={wordmarkZ}>Z</span>
              <span style={wordmarkRest}>Gate</span>
            </Link>
          </Section>

          <Section style={card}>{children}</Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              {brand.name} — your AI gateway.{" "}
              <Link href={dashboardUrl} style={footerLink}>
                Dashboard
              </Link>{" "}
              &middot;{" "}
              <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>
                Support
              </Link>
            </Text>
            <Text style={footerFaint}>
              You received this email because an action occurred on your {brand.name} account.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default EmailLayout;

// ── Inline styles (email clients strip <style> blocks) ───────────────────────

const body: React.CSSProperties = {
  backgroundColor: brand.pageBg,
  color: brand.text,
  fontFamily: fontStack,
  margin: 0,
  padding: "32px 0",
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  padding: "0 16px",
};

const header: React.CSSProperties = {
  padding: "8px 0 20px",
  textAlign: "center",
};

const wordmarkLink: React.CSSProperties = {
  textDecoration: "none",
  fontSize: "28px",
  fontWeight: 700,
  letterSpacing: "-0.5px",
};

const wordmarkZ: React.CSSProperties = {
  color: brand.accent,
};

const wordmarkRest: React.CSSProperties = {
  color: brand.logoCream,
};

const card: React.CSSProperties = {
  backgroundColor: brand.cardBg,
  border: `1px solid ${brand.border}`,
  borderRadius: "12px",
  padding: "32px",
};

const divider: React.CSSProperties = {
  borderColor: brand.border,
  margin: "28px 0 16px",
};

const footer: React.CSSProperties = {
  padding: "0 8px",
};

const footerText: React.CSSProperties = {
  color: brand.textMuted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 6px",
};

const footerFaint: React.CSSProperties = {
  color: brand.textFaint,
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
};

const footerLink: React.CSSProperties = {
  color: brand.accentText,
  textDecoration: "none",
};
