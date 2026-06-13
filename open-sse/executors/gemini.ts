/**
 * Gemini executor — Google Generative Language API (docs/PROVIDERS.md "gemini").
 *
 * Two credential modes:
 *  - OAuth (Google account): `authorization: Bearer <accessToken>`.
 *  - API key: appended as the `key` query parameter (Google convention).
 *
 * The model id is part of the URL path, and the action differs for streaming
 * (`:streamGenerateContent?alt=sse`) vs non-streaming (`:generateContent`).
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import {
  extractGeminiUsage,
  stripProviderPrefix,
  trimTrailingSlash,
} from "@/open-sse/executors/usageExtractors";

const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiExecutor extends BaseExecutor {
  readonly provider = "gemini";
  readonly format = Format.Gemini;

  override get isOAuth(): boolean {
    return true;
  }

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || GEMINI_DEFAULT_BASE;
    const model = stripProviderPrefix(req.model);
    const action = req.stream ? "streamGenerateContent?alt=sse" : "generateContent";
    let url = `${trimTrailingSlash(base)}/${model}:${action}`;
    // API-key auth uses a query param rather than a header.
    if (!req.connection.credentials.accessToken && req.connection.credentials.apiKey) {
      url += `${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(req.connection.credentials.apiKey)}`;
    }
    return url;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  override extractUsage(body: unknown): NormalizedUsage | null {
    return extractGeminiUsage(body);
  }
}
