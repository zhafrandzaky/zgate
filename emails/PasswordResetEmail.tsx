import { Text } from "@react-email/components";
import * as React from "react";
import EmailLayout from "./components/EmailLayout";
import { EmailHeading, EmailText, NoticeBox, OtpCodeDisplay } from "./components/ui";
import { brand } from "./theme";

/**
 * Password reset code email (docs/email/EMAIL.md §1, OtpType RESET). Mirrors the
 * OTP layout with reset-specific copy. Wired up when the reset flow ships.
 */
export interface PasswordResetEmailProps {
  code: string;
  expiryMinutes?: number;
  userName?: string;
}

export function PasswordResetEmail({
  code,
  expiryMinutes = 10,
  userName,
}: PasswordResetEmailProps) {
  const greeting = userName ? `Hi ${userName},` : "Hi,";
  const unit = expiryMinutes === 1 ? "minute" : "minutes";

  return (
    <EmailLayout preview={`Reset your ${brand.name} password: ${code}`}>
      <EmailHeading>Reset your password</EmailHeading>
      <EmailText>
        {`${greeting} we received a request to reset your ${brand.name} password. Enter the code below to continue.`}
      </EmailText>

      <OtpCodeDisplay code={code} />

      <EmailText muted>{`This code expires in ${expiryMinutes} ${unit}.`}</EmailText>

      <NoticeBox tone="warning">
        <Text style={warningText}>
          If you did not request a password reset, ignore this email and your password will stay
          the same. Do not share this code with anyone.
        </Text>
      </NoticeBox>
    </EmailLayout>
  );
}

const warningText: React.CSSProperties = {
  color: brand.textMuted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: 0,
};

PasswordResetEmail.PreviewProps = {
  code: "904512",
  expiryMinutes: 10,
  userName: "user@example.com",
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;
