/**
 * Email design tokens (TASK-003, docs/email/EMAIL.md).
 *
 * Email clients strip <style> blocks and do not load CSS custom properties, so
 * the oklch token system in UI-UX-DESIGN.md cannot be reused here. These are the
 * inline-safe hex equivalents of the ZGate brand: a dark surface with an indigo
 * accent and the cream logo color. Templates import these instead of hardcoding
 * colors (DRY) so the whole suite stays visually consistent.
 *
 * This module intentionally has no imports — it must stay loadable by the
 * `email dev` preview server and by `bun test` without app env/secrets.
 */

export const brand = {
  name: "ZGate",

  // Logo / wordmark
  logoCream: "#f9f4da",

  // Dark surfaces (primary theme per EMAIL.md design spec)
  pageBg: "#0a0a0a",
  cardBg: "#141414",
  raisedBg: "#1c1c1c",
  border: "#2a2a2a",

  // Text
  text: "#fafafa",
  textMuted: "#a1a1aa",
  textFaint: "#71717a",

  // Indigo accent (code highlight box, CTAs)
  accent: "#6366f1",
  accentHover: "#4f46e5",
  accentSoftBg: "#181631",
  accentBorder: "#312e81",
  accentText: "#c7d2fe",

  // Status
  danger: "#f87171",
  dangerBg: "#1f1414",
  dangerBorder: "#3f1d1d",
  success: "#34d399",
  successText: "#a7f3d0",
} as const;

/** System font stacks — email clients do not load webfonts reliably. */
export const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const monoStack =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export const SUPPORT_EMAIL = "support@zgate.ziron.dev";

/**
 * Absolute base URL for links/assets. Emails are rendered server-side; relative
 * URLs are invalid in mail clients, so every link must be absolute. Reads the
 * public env var directly (no `@/src/lib/env` import) so previews/tests work
 * without the full validated env.
 */
export function baseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  return (fromEnv && fromEnv.replace(/\/$/, "")) || "https://zgate.ziron.dev";
}
