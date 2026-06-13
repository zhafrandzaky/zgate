/**
 * Infer a model's kind from its id when no explicit metadata exists.
 *
 * Used by the model-resolution pipeline (docs/ARCHITECTURE.md §12) to tag models
 * fetched live from a provider that doesn't tell us what they are. Explicit
 * capabilities in `config/modelCapabilities.ts` always win; this is the
 * heuristic fallback.
 */

export type ModelKind =
  | "llm"
  | "image"
  | "tts"
  | "embedding"
  | "stt"
  | "webSearch"
  | "webFetch";

const EMBEDDING_RE = /embed/i;
const TTS_RE = /tts|speech|audio|voice/i;
const IMAGE_RE = /image|dall-?e|flux|stable-diffusion/i;

/**
 * Heuristic kind from a model id. Order matters: embedding, then tts, then
 * image, else llm (docs/PROVIDERS.md tagging conventions). Strips a leading
 * `provider/` so both `openai/text-embedding-3-small` and the bare id resolve.
 */
export function inferModelKind(modelId: string): ModelKind {
  const id = stripPrefix(modelId);
  if (EMBEDDING_RE.test(id)) return "embedding";
  if (TTS_RE.test(id)) return "tts";
  if (IMAGE_RE.test(id)) return "image";
  return "llm";
}

function stripPrefix(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}
