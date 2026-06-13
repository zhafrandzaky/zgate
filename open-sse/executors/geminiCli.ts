/**
 * Gemini CLI executor — Cloud Code companion (docs/PROVIDERS.md "gemini-cli").
 *
 * Shares the Gemini OAuth credentials but targets the Cloud Code internal
 * endpoint (`cloudcode-pa.googleapis.com/v1internal`) with a different request
 * envelope, so it is a separate executor from `gemini`. Static model list (no
 * auto-fetch).
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import { extractGeminiUsage, trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const GEMINI_CLI_DEFAULT_BASE = "https://cloudcode-pa.googleapis.com/v1internal";

export class GeminiCliExecutor extends BaseExecutor {
  readonly provider = "gemini-cli";
  readonly format = Format.GeminiCli;

  override get isOAuth(): boolean {
    return true;
  }

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || GEMINI_CLI_DEFAULT_BASE;
    const action = req.stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${trimTrailingSlash(base)}:${action}`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  override extractUsage(body: unknown): NormalizedUsage | null {
    return extractGeminiUsage(body);
  }
}
