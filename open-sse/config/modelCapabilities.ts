/**
 * Per-model capability metadata.
 *
 * Capabilities drive request shaping and the `/v1/models` listing: whether a
 * model accepts vision parts, tool calls, a thinking budget, what its context
 * window is, and (for embeddings) its dimensionality. When a model is not listed
 * here, callers fall back to `inferModelKind` (utils/modelKind.ts) and
 * conservative defaults.
 */

import { inferModelKind } from "@/open-sse/utils/modelKind";
import type { ModelKind } from "@/open-sse/utils/modelKind";

export interface ModelCapabilities {
  kind: ModelKind;
  vision?: boolean;
  tools?: boolean;
  thinking?: boolean;
  streaming?: boolean;
  contextWindow?: number;
  maxOutput?: number;
  /** Embedding output dimensionality (embedding kind only). */
  dimensions?: number;
}

/**
 * Explicit capabilities keyed by bare model id. Kept deliberately small: only
 * models whose capabilities ZGate actively depends on (embeddings for the memory
 * system, DeepSeek thinking) are pinned. Everything else resolves heuristically.
 */
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Embeddings — prerequisite for the memory system (TASK-022).
  "text-embedding-3-small": { kind: "embedding", dimensions: 1536, streaming: false },
  "text-embedding-3-large": { kind: "embedding", dimensions: 3072, streaming: false },

  // DeepSeek V4 — thinking toggle + tool calling (docs/PROVIDERS.md "deepseek").
  "deepseek-v4-flash": {
    kind: "llm",
    tools: true,
    thinking: true,
    streaming: true,
    contextWindow: 128_000,
    maxOutput: 8_192,
  },
  "deepseek-v4-pro": {
    kind: "llm",
    tools: true,
    thinking: true,
    streaming: true,
    contextWindow: 128_000,
    maxOutput: 8_192,
  },
};

const DEFAULT_LLM_CAPABILITIES: ModelCapabilities = {
  kind: "llm",
  tools: true,
  streaming: true,
};

function stripPrefix(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}

/**
 * Resolve capabilities for a model id. Explicit entries win; otherwise a kind is
 * inferred and reasonable defaults applied (LLMs get tools+streaming, non-LLM
 * kinds get just their kind). Never throws.
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  const bare = stripPrefix(modelId);
  const explicit = MODEL_CAPABILITIES[bare];
  if (explicit) return explicit;

  const kind = inferModelKind(bare);
  if (kind === "llm") return { ...DEFAULT_LLM_CAPABILITIES };
  return { kind, streaming: false };
}

/** Convenience: the inferred-or-declared kind for a model id. */
export function getModelKind(modelId: string): ModelKind {
  return getModelCapabilities(modelId).kind;
}
