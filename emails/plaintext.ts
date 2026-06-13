/**
 * Plain-text post-processing for rendered emails. React Email's <Preview>
 * injects a run of zero-width and non-breaking-space characters after the
 * preview line to pad the inbox snippet. That is correctly hidden in the HTML
 * part but leaks into the plain-text part as junk lines. This strips the padding
 * and collapses the leftover blank lines so the text/plain fallback stays clean.
 *
 * Pure (no imports) so it stays unit-testable without app env/secrets.
 */
export function cleanPlainText(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u2060\u034F\uFEFF]/g, "") // zero-width formatting chars
    .replace(/^[ \t\u00A0]+$/gm, "") // whitespace-only lines (incl. non-breaking space)
    .replace(/\n{3,}/g, "\n\n") // collapse the resulting blank-line runs
    .trim();
}
