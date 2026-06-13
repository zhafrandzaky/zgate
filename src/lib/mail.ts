import { createElement, type ReactElement } from "react";
import { render } from "@react-email/components";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { marked } from "marked";
import { env } from "@/src/lib/env";
import { subjects } from "@/emails/subjects";
import { cleanPlainText } from "@/emails/plaintext";
import OtpEmail from "@/emails/OtpEmail";
import WelcomeEmail from "@/emails/WelcomeEmail";
import BanNotificationEmail from "@/emails/BanNotificationEmail";
import PasswordResetEmail from "@/emails/PasswordResetEmail";
import BroadcastEmail from "@/emails/BroadcastEmail";

/**
 * Email transport (TASK-003, docs/email/EMAIL.md). React Email templates are
 * rendered to HTML + a plain-text fallback, then dispatched via Resend in
 * production or Nodemailer→Mailpit in development. The public `send*` helpers
 * keep the signatures the auth routes already call (sendOtpEmail/sendWelcomeEmail
 * are drop-in replacements for the previous stub).
 *
 * Transports are created lazily so importing this module during build/lint never
 * opens a connection.
 */

const DEFAULT_OTP_EXPIRY_MINUTES = 10;

// ── Transport (lazy singletons) ──────────────────────────────────────────────

let resendClient: Resend | undefined;
let smtpTransport: Transporter | undefined;

/** Resend in production (when a key is configured); SMTP/Mailpit otherwise. */
function shouldUseResend(): boolean {
  return env.NODE_ENV === "production" && Boolean(env.RESEND_API_KEY);
}

function getResend(): Resend {
  if (!resendClient) {
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is required to send email in production.");
    }
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

function getSmtpTransport(): Transporter {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.SMTP_HOST ?? "localhost",
      port: env.SMTP_PORT ?? 1025,
      secure: false,
      // Mailpit accepts any/no auth (MP_SMTP_AUTH_ACCEPT_ANY in docker-compose).
    });
  }
  return smtpTransport;
}

interface SendArgs {
  to: string;
  subject: string;
  element: ReactElement;
}

/** Render a template and send it through the active transport. */
async function dispatch({ to, subject, element }: SendArgs): Promise<void> {
  const [html, rawText] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  const text = cleanPlainText(rawText);

  if (shouldUseResend()) {
    const { error } = await getResend().emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      throw new Error(`Resend rejected email to ${to}: ${error.message}`);
    }
    return;
  }

  await getSmtpTransport().sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
}

// ── Public helpers ───────────────────────────────────────────────────────────

export interface OtpEmailParams {
  to: string;
  code: string;
  expiryMinutes: number;
}

export async function sendOtpEmail(params: OtpEmailParams): Promise<void> {
  const expiryMinutes = params.expiryMinutes || DEFAULT_OTP_EXPIRY_MINUTES;
  await dispatch({
    to: params.to,
    subject: subjects.otp(params.code),
    element: createElement(OtpEmail, {
      code: params.code,
      expiryMinutes,
      userName: params.to,
    }),
  });
}

export interface PasswordResetEmailParams {
  to: string;
  code: string;
  expiryMinutes: number;
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  const expiryMinutes = params.expiryMinutes || DEFAULT_OTP_EXPIRY_MINUTES;
  await dispatch({
    to: params.to,
    subject: subjects.passwordReset(params.code),
    element: createElement(PasswordResetEmail, {
      code: params.code,
      expiryMinutes,
      userName: params.to,
    }),
  });
}

export async function sendWelcomeEmail(to: string, userName?: string): Promise<void> {
  await dispatch({
    to,
    subject: subjects.welcome(),
    element: createElement(WelcomeEmail, { userName: userName ?? to }),
  });
}

export async function sendBanEmail(
  to: string,
  reason: string,
  bannedAt?: Date,
): Promise<void> {
  await dispatch({
    to,
    subject: subjects.ban(),
    element: createElement(BanNotificationEmail, {
      userName: to,
      variant: "banned",
      reason,
      bannedAt: bannedAt?.toISOString(),
    }),
  });
}

export async function sendUnbanEmail(to: string): Promise<void> {
  await dispatch({
    to,
    subject: subjects.unban(),
    element: createElement(BanNotificationEmail, { userName: to, variant: "restored" }),
  });
}

export interface BroadcastResult {
  sent: number;
  failed: number;
}

/**
 * Send an admin broadcast to many recipients. Each message is addressed
 * individually so recipients never see each other's addresses. The body is
 * admin-authored markdown converted to HTML (trusted, admin-gated content).
 * Returns a sent/failed tally; individual failures never abort the batch.
 */
export async function sendBroadcastEmail(
  recipients: string[],
  subject: string,
  markdownBody: string,
): Promise<BroadcastResult> {
  const contentHtml = await marked.parse(markdownBody);

  const results = await Promise.allSettled(
    recipients.map((to) =>
      dispatch({
        to,
        subject,
        element: createElement(BroadcastEmail, { subject, contentHtml }),
      }),
    ),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent, failed: results.length - sent };
}
