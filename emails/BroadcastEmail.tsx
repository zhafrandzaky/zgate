import * as React from "react";
import EmailLayout from "./components/EmailLayout";
import { brand, fontStack } from "./theme";

/**
 * Admin broadcast email (docs/email/EMAIL.md §5). Reuses EmailLayout with an
 * admin-authored body so the brand header/footer wrap any announcement.
 *
 * `contentHtml` is produced by converting the admin's markdown to HTML in
 * `src/lib/mail.ts`. The source is an ADMIN-only field gated behind the admin
 * role check (AGENTS.md §6); it is trusted server-side content, not end-user
 * input, which is why it is injected directly. Do not feed end-user input here.
 */
export interface BroadcastEmailProps {
  /** Pre-rendered HTML body (markdown already converted by the sender). */
  contentHtml: string;
  /** Subject, reused as the inbox preview line. */
  subject: string;
}

export function BroadcastEmail({ contentHtml, subject }: BroadcastEmailProps) {
  return (
    <EmailLayout preview={subject}>
      <div style={content} dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </EmailLayout>
  );
}

const content: React.CSSProperties = {
  color: brand.text,
  fontFamily: fontStack,
  fontSize: "15px",
  lineHeight: "24px",
};

BroadcastEmail.PreviewProps = {
  subject: "Scheduled maintenance this weekend",
  contentHtml:
    "<h2>Scheduled maintenance</h2><p>We will perform routine maintenance on Saturday. " +
    "The gateway may be briefly unavailable. Thank you for using ZGate.</p>",
} satisfies BroadcastEmailProps;

export default BroadcastEmail;
