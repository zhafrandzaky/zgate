import { Text } from "@react-email/components";
import * as React from "react";
import EmailLayout from "./components/EmailLayout";
import { CtaButton, EmailHeading, EmailText, NoticeBox } from "./components/ui";
import { baseUrl, brand, SUPPORT_EMAIL } from "./theme";

/**
 * Account suspension / restoration email (docs/email/EMAIL.md §3-4). One template
 * covers both states via `variant`: the suspended variant shows the admin reason,
 * the restored variant confirms access and links back to the dashboard.
 */
export type BanVariant = "banned" | "restored";

export interface BanNotificationEmailProps {
  /** Recipient's email address, used in the greeting. */
  userName?: string;
  variant?: BanVariant;
  /** Admin-provided reason — required for the banned variant. */
  reason?: string;
  /** ISO timestamp of the ban, shown for context. */
  bannedAt?: string;
}

export function BanNotificationEmail({
  userName,
  variant = "banned",
  reason,
  bannedAt,
}: BanNotificationEmailProps) {
  if (variant === "restored") {
    return <RestoredBody userName={userName} />;
  }
  return <BannedBody userName={userName} reason={reason} bannedAt={bannedAt} />;
}

function BannedBody({
  userName,
  reason,
  bannedAt,
}: Pick<BanNotificationEmailProps, "userName" | "reason" | "bannedAt">) {
  return (
    <EmailLayout preview={`Your ${brand.name} account has been suspended.`}>
      <EmailHeading>Your account has been suspended</EmailHeading>
      <EmailText>
        {userName ? `Hi ${userName},` : "Hi,"} your {brand.name} account has been suspended by an
        administrator.
      </EmailText>

      <NoticeBox tone="danger">
        <Text style={labelText}>Reason</Text>
        <Text style={reasonText}>{reason || "No reason was provided."}</Text>
        {bannedAt ? <Text style={metaText}>Suspended at {formatTimestamp(bannedAt)}</Text> : null}
      </NoticeBox>

      <EmailText muted>
        While suspended, you cannot use the {brand.name} API or sign in to the dashboard.
      </EmailText>
      <EmailText muted>
        If you believe this is a mistake, reply to this email or contact us at {SUPPORT_EMAIL}.
      </EmailText>
    </EmailLayout>
  );
}

function RestoredBody({ userName }: Pick<BanNotificationEmailProps, "userName">) {
  return (
    <EmailLayout preview={`Your ${brand.name} account has been restored.`}>
      <EmailHeading>Your account has been restored</EmailHeading>
      <EmailText>
        {userName ? `Hi ${userName},` : "Hi,"} good news — your {brand.name} account has been
        restored.
      </EmailText>

      <NoticeBox tone="info">
        <Text style={restoredText}>You can now use the dashboard and API again.</Text>
      </NoticeBox>

      <CtaButton href={`${baseUrl()}/dashboard`}>Go to Dashboard</CtaButton>
    </EmailLayout>
  );
}

/** Render the ban timestamp as a stable, locale-independent UTC string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const labelText: React.CSSProperties = {
  color: brand.textMuted,
  fontSize: "12px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  margin: "0 0 4px",
};

const reasonText: React.CSSProperties = {
  color: brand.text,
  fontSize: "15px",
  lineHeight: "22px",
  margin: 0,
};

const metaText: React.CSSProperties = {
  color: brand.textFaint,
  fontSize: "12px",
  lineHeight: "18px",
  margin: "8px 0 0",
};

const restoredText: React.CSSProperties = {
  color: brand.successText,
  fontSize: "14px",
  lineHeight: "22px",
  margin: 0,
};

BanNotificationEmail.PreviewProps = {
  userName: "user@example.com",
  variant: "banned",
  reason: "Repeated violations of the acceptable use policy.",
  bannedAt: "2026-06-13T09:30:00.000Z",
} satisfies BanNotificationEmailProps;

export default BanNotificationEmail;
