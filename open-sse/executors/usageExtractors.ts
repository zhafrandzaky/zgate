/**
 * Provider-specific usage extractors shared across executors.
 *
 * The base executor handles the OpenAI `usage` shape. Gemini-family and Ollama
 * report token counts under different keys, so executors for those formats reuse
 * these helpers. All return `null` on an unrecognized shape — usage tracking then
 * falls back to ZGate's tokenizer estimate (TASK-007) rather than throwing.
 */

import type { NormalizedUsage } from "@/open-sse/executors/base";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Gemini / Vertex / Antigravity `usageMetadata`:
 * `{ promptTokenCount, candidatesTokenCount, totalTokenCount, thoughtsTokenCount? }`.
 * The response may be wrapped in `{ response: { usageMetadata } }` (Antigravity).
 */
export function extractGeminiUsage(body: unknown): NormalizedUsage | null {
  const root = isRecord(body) && isRecord(body.response) ? body.response : body;
  if (!isRecord(root) || !isRecord(root.usageMetadata)) return null;
  const meta = root.usageMetadata;
  const prompt = num(meta.promptTokenCount);
  const completion = num(meta.candidatesTokenCount);
  const total = num(meta.totalTokenCount) || prompt + completion;
  const usage: NormalizedUsage = {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
  if (typeof meta.thoughtsTokenCount === "number") {
    usage.reasoningTokens = meta.thoughtsTokenCount;
  }
  if (typeof meta.cachedContentTokenCount === "number") {
    usage.cachedTokens = meta.cachedContentTokenCount;
  }
  return usage;
}

/**
 * Ollama native chat: `{ prompt_eval_count, eval_count }`. Totals are derived.
 */
export function extractOllamaUsage(body: unknown): NormalizedUsage | null {
  if (!isRecord(body)) return null;
  const prompt = num(body.prompt_eval_count);
  const completion = num(body.eval_count);
  if (prompt === 0 && completion === 0) return null;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
  };
}

/**
 * Anthropic Messages `usage`: `{ input_tokens, output_tokens, cache_read_input_tokens? }`.
 * Used by claude-format executors (anthropic, glm, kimi, minimax, ...).
 */
export function extractAnthropicUsage(body: unknown): NormalizedUsage | null {
  if (!isRecord(body) || !isRecord(body.usage)) return null;
  const usage = body.usage;
  const prompt = num(usage.input_tokens);
  const completion = num(usage.output_tokens);
  if (prompt === 0 && completion === 0) return null;
  const result: NormalizedUsage = {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
  };
  if (typeof usage.cache_read_input_tokens === "number") {
    result.cachedTokens = usage.cache_read_input_tokens;
  }
  return result;
}

/** Trim trailing slash from a base URL before path concatenation. */
export function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Strip a `provider/` prefix from a model id, leaving the bare model name. */
export function stripProviderPrefix(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}
