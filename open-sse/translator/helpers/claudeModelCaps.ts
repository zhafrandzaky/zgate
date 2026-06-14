/**
 * Per-generation capability detection for Anthropic Claude models.
 *
 * The Anthropic Messages request surface changed across model generations, and
 * sending a parameter a model no longer accepts is a hard 400 — not a silently
 * ignored field. This module classifies a model id so the request encoder emits
 * the right `thinking` shape and only the sampling params the model still allows.
 *
 * Sources (verified for this fix):
 *  - Anthropic model migration guide (claude-api skill, shared/model-migration.md):
 *    • Opus 4.7 / 4.8 and Fable 5: `thinking:{type:"enabled",budget_tokens}` is
 *      REMOVED → 400. `temperature`/`top_p`/`top_k` are REMOVED → 400. Use
 *      `thinking:{type:"adaptive"}` + `output_config:{effort}`. `xhigh` effort
 *      added on 4.7; `max` on Opus 4.5+/Sonnet 4.6.
 *    • Opus 4.6 / Sonnet 4.6: `budget_tokens` DEPRECATED (still works) — adaptive
 *      recommended; sampling params still accepted; effort GA (`max` supported).
 *    • Opus 4.5 / Sonnet 4.5 / Haiku 4.5 / Claude 3.x: legacy
 *      `thinking:{type:"enabled",budget_tokens}`; sampling accepted; effort errors
 *      on Sonnet 4.5 / Haiku 4.5.
 *
 * Non-Claude Anthropic-Messages-compatible backends (glm / kimi / minimax /
 * agentrouter / commandcode, etc.) are classified `other` and keep the legacy
 * behavior — they are not the real Claude API and we must not assume the newer
 * restrictions apply.
 */

export type ClaudeThinkingStyle =
  | "adaptive-only" // Opus 4.7/4.8, Fable 5/Mythos 5: adaptive only, no sampling
  | "adaptive-pref" // Opus 4.6, Sonnet 4.6: adaptive preferred, sampling ok
  | "legacy-budget" // Opus 4.5/Sonnet 4.5/Haiku 4.5/Claude 3.x: enabled+budget
  | "other"; // non-Claude anthropic-compatible backends

function normalize(model: string): string {
  // Treat "4.7" and "4-7" as equivalent so both id conventions match.
  return model.toLowerCase().replace(/\./g, "-");
}

/** Whether a model id denotes a genuine Anthropic Claude model. */
function isClaudeModel(norm: string): boolean {
  return norm.includes("claude") || norm.includes("fable") || norm.includes("mythos");
}

export function classifyClaudeModel(model: string): ClaudeThinkingStyle {
  const norm = normalize(model);

  // Fable 5 / Mythos 5 and Opus 4.7 / 4.8 — adaptive only, sampling removed.
  if (
    norm.includes("fable") ||
    norm.includes("mythos") ||
    norm.includes("opus-4-7") ||
    norm.includes("opus-4-8")
  ) {
    return "adaptive-only";
  }

  // Opus 4.6 / Sonnet 4.6 — adaptive preferred, sampling still accepted.
  if (norm.includes("opus-4-6") || norm.includes("sonnet-4-6")) {
    return "adaptive-pref";
  }

  // Older genuine Claude models — legacy budget thinking.
  if (isClaudeModel(norm)) {
    return "legacy-budget";
  }

  return "other";
}

/** Sampling (`temperature`/`top_p`/`top_k`) is rejected on Opus 4.7/4.8 & Fable. */
export function claudeSupportsSampling(model: string): boolean {
  return classifyClaudeModel(model) !== "adaptive-only";
}

/** Whether the model supports the modern adaptive thinking + effort surface. */
export function claudeSupportsAdaptive(model: string): boolean {
  const style = classifyClaudeModel(model);
  return style === "adaptive-only" || style === "adaptive-pref";
}

/**
 * `output_config.effort` is GA on Opus 4.5+, Sonnet 4.6 and Fable 5; it errors on
 * Sonnet 4.5 / Haiku 4.5 / Claude 3.x. We only emit it for the adaptive tiers,
 * which are exactly the models where it is safe.
 */
export function claudeSupportsEffort(model: string): boolean {
  return claudeSupportsAdaptive(model);
}

/**
 * Clamp a desired effort to what the model accepts. `xhigh` exists on Opus 4.7+
 * (adaptive-only); `max` on Opus 4.6+/Sonnet 4.6 (both adaptive tiers). Anything
 * else collapses to `high`.
 */
export function clampClaudeEffort(effort: string, model: string): string {
  const style = classifyClaudeModel(model);
  const value = effort.toLowerCase();
  if (value === "low" || value === "medium" || value === "high") return value;
  if (value === "xhigh") return style === "adaptive-only" ? "xhigh" : "high";
  if (value === "max") return "max"; // supported on both adaptive tiers
  return "high";
}
