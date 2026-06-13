/**
 * Wire format identifiers for the translation layer.
 *
 * The internal pivot format is always OpenAI Chat Completions (`openai`). Every
 * source format is first normalized to the pivot, then re-encoded to the target
 * provider format (see `docs/ARCHITECTURE.md` §16). The constant doubles as a
 * value namespace (`Format.Claude`) and a string-literal type (`Format`).
 */

export const Format = {
  /** Pivot format. OpenAI Chat Completions (`/v1/chat/completions`). */
  OpenAI: "openai",
  /** OpenAI Responses API (`/v1/responses`, Codex). */
  OpenAIResponses: "openai-responses",
  /** Anthropic Messages API (`/v1/messages`). */
  Claude: "claude",
  /** Google Generative Language API. */
  Gemini: "gemini",
  /** Google Cloud Code companion endpoint (same schema as Gemini). */
  GeminiCli: "gemini-cli",
  /** AWS CodeWhisperer (Kiro). */
  Kiro: "kiro",
  /** Cursor proprietary protocol (protobuf/connect, decoded upstream). */
  Cursor: "cursor",
  /** Ollama native chat API. */
  Ollama: "ollama",
  /** Vertex AI Gemini (same content schema as Gemini). */
  Vertex: "vertex",
  /** CommandCode coding endpoint (Anthropic-compatible variant). */
  CommandCode: "commandcode",
  /** Antigravity IDE backend (Gemini-style envelope). */
  Antigravity: "antigravity",
  /** grok.com web-reverse chat (cookie auth, best-effort). */
  GrokWeb: "grok-web",
  /** perplexity.ai web-reverse ask (cookie auth, best-effort). */
  PerplexityWeb: "perplexity-web",
} as const;

export type Format = (typeof Format)[keyof typeof Format];

const ALL_FORMATS: readonly Format[] = Object.values(Format);

/** True when `value` is a recognized wire format. */
export function isFormat(value: string): value is Format {
  return (ALL_FORMATS as readonly string[]).includes(value);
}

/**
 * Collapse format aliases onto the translator family that implements them.
 *
 * Several formats share an identical request/response schema and reuse a single
 * translator: `gemini-cli` and `vertex` ride on the Gemini translator, and the
 * registry treats them through this canonical mapping.
 */
export function canonicalFormat(format: Format): Format {
  switch (format) {
    case Format.GeminiCli:
      return Format.Gemini;
    default:
      return format;
  }
}
