/**
 * Codex executor — ChatGPT backend Responses API (docs/PROVIDERS.md "codex").
 *
 * OAuth (ChatGPT account). Wire format is `openai-responses`; the translator
 * converts Chat Completions <-> Responses. Each LLM model implicitly gains a
 * `-review` variant (handled at model-resolution time, not here).
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest } from "@/open-sse/executors/base";
import { trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const CODEX_DEFAULT_BASE = "https://chatgpt.com/backend-api/codex";

export class CodexExecutor extends BaseExecutor {
  readonly provider = "codex";
  readonly format = Format.OpenAIResponses;

  override get isOAuth(): boolean {
    return true;
  }

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || CODEX_DEFAULT_BASE;
    return `${trimTrailingSlash(base)}/responses`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.accessToken;
    if (!token) return {};
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "openai-beta": "responses=experimental",
    };
    if (typeof psd.accountId === "string") {
      headers["chatgpt-account-id"] = psd.accountId;
    }
    return headers;
  }
}
