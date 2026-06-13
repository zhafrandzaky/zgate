/**
 * Ollama executors (docs/PROVIDERS.md "ollama" / "ollama-local").
 *
 * Native Ollama chat API (`/api/chat`), no auth. Two registered providers share
 * the same logic with different default hosts:
 *   - `ollama`        -> https://ollama.com
 *   - `ollama-local`  -> http://localhost:11434 (user-configurable via baseUrl)
 *
 * Live models come from `resolveOllamaModels` (`GET {baseUrl}/api/tags`).
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import { extractOllamaUsage, trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

export class OllamaExecutor extends BaseExecutor {
  readonly provider: string;
  readonly format = Format.Ollama;
  private readonly defaultBase: string;

  constructor(provider: string, defaultBase: string) {
    super();
    this.provider = provider;
    this.defaultBase = defaultBase;
  }

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || this.defaultBase;
    return `${trimTrailingSlash(base)}/api/chat`;
  }

  buildAuthHeaders(): Record<string, string> {
    return {};
  }

  override extractUsage(body: unknown): NormalizedUsage | null {
    return extractOllamaUsage(body);
  }
}

export const OLLAMA_CLOUD_BASE = "https://ollama.com";
export const OLLAMA_LOCAL_BASE = "http://localhost:11434";
