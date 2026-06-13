/**
 * Antigravity executor (docs/PROVIDERS.md "antigravity").
 *
 * OAuth (Google / Antigravity IDE). Models route to two backends — the daily
 * Cloud Code host and a sandbox host — selected per model. The wire format is
 * `antigravity` (a Gemini-style envelope), so usage is read from the unwrapped
 * Gemini `usageMetadata`.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import { extractGeminiUsage, trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const DAILY_BASE = "https://daily-cloudcode-pa.googleapis.com";
const SANDBOX_BASE = "https://sandbox-cloudcode-pa.googleapis.com";

function routesToSandbox(model: string, psd: Record<string, unknown>): boolean {
  const list = psd.sandboxModels;
  if (Array.isArray(list) && list.includes(model)) return true;
  return model.includes("sandbox");
}

export class AntigravityExecutor extends BaseExecutor {
  readonly provider = "antigravity";
  readonly format = Format.Antigravity;

  override get isOAuth(): boolean {
    return true;
  }

  buildUrl(req: ExecutorRequest): string {
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const sandbox = routesToSandbox(req.model, psd);
    const configured = req.connection.baseUrl?.trim();
    const base = sandbox
      ? (typeof psd.sandboxUrl === "string" ? psd.sandboxUrl : SANDBOX_BASE)
      : (configured || DAILY_BASE);
    const action = req.stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${trimTrailingSlash(base)}/v1internal:${action}`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  override extractUsage(body: unknown): NormalizedUsage | null {
    return extractGeminiUsage(body);
  }
}
