import { Column, Row, Section, Text } from "@react-email/components";
import * as React from "react";
import EmailLayout from "./components/EmailLayout";
import { CtaButton, EmailHeading, EmailText } from "./components/ui";
import { baseUrl, brand, monoStack } from "./theme";

/**
 * Welcome email — sent after OTP verification (docs/email/EMAIL.md §2). Walks the
 * new user through the three setup steps and shows how to point a tool at the
 * gateway, with a CTA into the providers page.
 */
export interface WelcomeEmailProps {
  /** Recipient's email address, used in the greeting. */
  userName?: string;
}

const STEPS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: "Connect your first AI provider",
    detail: "Bring your own key (BYOK) for OpenAI, Anthropic, Google, and more.",
  },
  {
    title: "Create a combo",
    detail: "Group providers so requests fall back automatically when one is down.",
  },
  {
    title: "Generate an API key",
    detail: "One ZGate key routes to every provider you connected.",
  },
];

export function WelcomeEmail({ userName }: WelcomeEmailProps) {
  const apiBase = `${baseUrl()}/v1`;
  const providersUrl = `${baseUrl()}/dashboard/providers`;

  const greeting = userName ? `Hi ${userName},` : "Hi,";

  return (
    <EmailLayout preview={`Welcome to ${brand.name} — your account is ready.`}>
      <EmailHeading>{`Welcome to ${brand.name}`}</EmailHeading>
      <EmailText>
        {`${greeting} your account is verified and ready. Here is how to get your first request flowing in three steps.`}
      </EmailText>

      <Section style={{ margin: "4px 0 20px" }}>
        {STEPS.map((step, index) => (
          <Row key={step.title} style={stepRow}>
            <Column style={stepNumberCol}>
              <Text style={stepNumber}>{index + 1}</Text>
            </Column>
            <Column>
              <Text style={stepTitle}>{step.title}</Text>
              <Text style={stepDetail}>{step.detail}</Text>
            </Column>
          </Row>
        ))}
      </Section>

      <EmailText muted>
        {`Then point any tool at the gateway. For example, to use ${brand.name} with Claude Code:`}
      </EmailText>

      <Section style={snippetBox}>
        <Text style={snippetText}>
          {`export ANTHROPIC_BASE_URL=${apiBase}`}
          <br />
          {`export ANTHROPIC_API_KEY=zg-your-api-key`}
        </Text>
      </Section>

      <CtaButton href={providersUrl}>Go to Dashboard</CtaButton>
    </EmailLayout>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const stepRow: React.CSSProperties = {
  marginBottom: "12px",
};

const stepNumberCol: React.CSSProperties = {
  width: "40px",
  verticalAlign: "top",
};

const stepNumber: React.CSSProperties = {
  backgroundColor: brand.accentSoftBg,
  border: `1px solid ${brand.accentBorder}`,
  color: brand.accentText,
  borderRadius: "9999px",
  width: "28px",
  height: "28px",
  lineHeight: "28px",
  textAlign: "center",
  fontSize: "14px",
  fontWeight: 700,
  margin: 0,
};

const stepTitle: React.CSSProperties = {
  color: brand.text,
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "22px",
  margin: "0 0 2px",
};

const stepDetail: React.CSSProperties = {
  color: brand.textMuted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: 0,
};

const snippetBox: React.CSSProperties = {
  backgroundColor: brand.pageBg,
  border: `1px solid ${brand.border}`,
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "0 0 20px",
};

const snippetText: React.CSSProperties = {
  color: brand.accentText,
  fontFamily: monoStack,
  fontSize: "13px",
  lineHeight: "22px",
  margin: 0,
};

WelcomeEmail.PreviewProps = {
  userName: "user@example.com",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
