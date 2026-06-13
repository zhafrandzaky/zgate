/**
 * Normalization and clamping for the various output-token limit fields.
 *
 * OpenAI uses `max_tokens` (legacy) and `max_completion_tokens`; Anthropic uses
 * `max_tokens` (required); Gemini uses `maxOutputTokens`. This helper presents a
 * single canonical reader plus a clamp against per-model ceilings so a request
 * authored for one provider never asks another to exceed its hard limit.
 */

/** Fallback ceiling when a model is unknown. Generous, but bounded. */
const DEFAULT_MAX_OUTPUT = 8192;

/** Anthropic Messages requires `max_tokens`; use this when the caller omits it. */
export const CLAUDE_DEFAULT_MAX_TOKENS = 4096;

/**
 * Known output-token ceilings, matched by substring against the model id.
 * Ordered most-specific first; the first hit wins.
 */
const MODEL_MAX_OUTPUT: ReadonlyArray<readonly [pattern: string, limit: number]> = [
  ["claude-opus-4", 32000],
  ["claude-sonnet-4", 64000],
  ["claude-haiku-4", 32000],
  ["claude-3-5", 8192],
  ["claude", 8192],
  ["gpt-5", 128000],
  ["gpt-4.1", 32768],
  ["gpt-4o", 16384],
  ["gpt-4", 8192],
  ["o3", 100000],
  ["o1", 100000],
  ["gemini-3", 65536],
  ["gemini-2.5", 65536],
  ["gemini-2", 8192],
  ["gemini", 8192],
  ["deepseek-v4", 8192],
  ["deepseek-r1", 65536],
  ["deepseek", 8192],
  ["qwen3", 32768],
  ["kimi", 16384],
  ["glm", 16384],
];

/** Resolve the output-token ceiling for a model id. */
export function getModelMaxOutput(model: string): number {
  const normalized = model.toLowerCase();
  for (const [pattern, limit] of MODEL_MAX_OUTPUT) {
    if (normalized.includes(pattern)) return limit;
  }
  return DEFAULT_MAX_OUTPUT;
}

type MaxTokenSource = {
  max_tokens?: number | null;
  max_completion_tokens?: number | null;
  maxOutputTokens?: number | null;
  max_output_tokens?: number | null;
};

/**
 * Read whichever output-token field is present, in priority order, returning
 * `undefined` when none is set or all are non-positive.
 */
export function readMaxTokens(source: MaxTokenSource): number | undefined {
  const candidates = [
    source.max_completion_tokens,
    source.max_tokens,
    source.maxOutputTokens,
    source.max_output_tokens,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && value > 0) return value;
  }
  return undefined;
}

/** Clamp a requested limit to `[1, modelCeiling]`. */
export function clampMaxTokens(requested: number, model: string): number {
  const ceiling = getModelMaxOutput(model);
  if (requested < 1) return 1;
  return Math.min(requested, ceiling);
}

/**
 * Resolve the effective output-token limit for a target model: read the source
 * value, clamp it, and fall back to `fallback` (then the model ceiling) when the
 * source omitted it but the target format requires a value.
 */
export function resolveMaxTokens(
  source: MaxTokenSource,
  model: string,
  fallback?: number,
): number | undefined {
  const requested = readMaxTokens(source);
  if (requested !== undefined) return clampMaxTokens(requested, model);
  if (fallback !== undefined) return clampMaxTokens(fallback, model);
  return undefined;
}
