/**
 * DeepSeek executor (docs/PROVIDERS.md "deepseek").
 *
 * DeepSeek is OpenAI-wire-compatible with three twists ZGate cares about:
 *
 *  - Thinking toggle: `{ thinking: { type: "enabled" | "disabled" } }` and
 *    `reasoning_effort: "high" | "max"` ride through the pivot verbatim
 *    (see OpenAIChatRequest in translator/types.ts) — the executor does not
 *    rewrite the body, it only forwards it.
 *  - `reasoning_content` arrives strictly separate from `content` (and from
 *    `delta.reasoning_content` while streaming). The translator maps that onto
 *    Anthropic `thinking` blocks for Claude-format clients; the executor's job
 *    is only to surface reasoning tokens in usage.
 *  - Pricing-aware: cost is computed from usage and recorded to
 *    `UsageEntry.costUsd`.
 *
 * Error codes (400/401/402/422/429/500/503) map onto fallback categories per the
 * provider table; the base mapper already matches, this class documents intent.
 */

import { BaseExecutor, Format, FallbackCategory } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

/** USD price per 1,000,000 tokens. */
interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

/** Static pricing from docs/PROVIDERS.md. Cache-hit input is billed via usage. */
const DEEPSEEK_PRICING: Record<string, ModelPrice> = {
  "deepseek-v4-flash": { inputPer1M: 0.14, outputPer1M: 0.28 },
  "deepseek-v4-pro": { inputPer1M: 0.435, outputPer1M: 0.87 },
};

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Compute request cost in USD for a DeepSeek model + usage. Returns 0 for
 * unknown models so cost accounting never throws on a new/aliased model id.
 */
export function deepseekCostUsd(model: string, usage: NormalizedUsage): number {
  const price = DEEPSEEK_PRICING[stripProviderPrefix(model)];
  if (!price) return 0;
  const inputCost = (usage.promptTokens / TOKENS_PER_MILLION) * price.inputPer1M;
  const outputCost = (usage.completionTokens / TOKENS_PER_MILLION) * price.outputPer1M;
  return inputCost + outputCost;
}

function stripProviderPrefix(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

export class DeepSeekExecutor extends BaseExecutor {
  readonly provider = "deepseek";
  readonly format = Format.OpenAI;

  buildUrl(): string {
    return DEEPSEEK_ENDPOINT;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.apiKey ?? req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  /**
   * DeepSeek error semantics (docs/PROVIDERS.md):
   *  400 invalid request — no retry, fallback
   *  401 key wrong/expired — mark error, fallback
   *  402 balance exhausted — skip connection, fallback + WS notify
   *  422 invalid semantic param — no retry, fallback
   *  429 rate limit — round-robin + exponential backoff
   *  500 server error — retry once -> fallback
   *  503 overloaded — fallback immediately
   */
  override mapError(status: number, body?: unknown): FallbackCategory {
    return super.mapError(status, body);
  }

  /** Surface reasoning tokens alongside the standard OpenAI usage fields. */
  override extractUsage(body: unknown): NormalizedUsage | null {
    return super.extractUsage(body);
  }
}

export { DEEPSEEK_PRICING };
