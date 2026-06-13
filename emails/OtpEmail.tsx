import { Text } from "@react-email/components";
import * as React from "react";
import EmailLayout from "./components/EmailLayout";
import { EmailHeading, EmailText, NoticeBox, OtpCodeDisplay } from "./components/ui";
import { brand } from "./theme";

/**
 * OTP verification email — sent on registration (docs/email/EMAIL.md §1).
 * Large wide-tracked code, expiry countdown, and a do-not-share warning.
 */
export interface OtpEmailProps {
  code: string;
  expiryMinutes?: number;
  /** Recipient's email address, used in the greeting. */
  userName?: string;
}

export function OtpEmail({ code, expiryMinutes = 10, userName }: OtpEmailProps) {
  const greeting = userName ? `Hi ${userName},` : "Hi,";
  const unit = expiryMinutes === 1 ? "minute" : "minutes";

  return (
    <EmailLayout preview={`Your ${brand.name} verification code: ${code}`}>
      <EmailHeading>Verify your email</EmailHeading>
      <EmailText>
        {`${greeting} use the code below to finish setting up your ${brand.name} account.`}
      </EmailText>

      <OtpCodeDisplay code={code} />

      <EmailText muted>{`This code expires in ${expiryMinutes} ${unit}.`}</EmailText>

      <NoticeBox tone="warning">
        <Text style={warningText}>
          Do not share this code with anyone. {brand.name} staff will never ask you for it.
        </Text>
      </NoticeBox>

      <EmailText muted>
        If you did not request this code, you can safely ignore this email.
      </EmailText>
    </EmailLayout>
  );
}

const warningText: React.CSSProperties = {
  color: brand.textMuted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: 0,
};

OtpEmail.PreviewProps = {
  code: "318204",
  expiryMinutes: 10,
  userName: "user@example.com",
} satisfies OtpEmailProps;

export default OtpEmail;
