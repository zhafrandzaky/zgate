/**
 * Canonical pivot types: OpenAI Chat Completions.
 *
 * Every translator either normalizes a source format INTO these types or encodes
 * these types OUT to a provider format. Keeping a single, strongly-typed pivot is
 * what lets tool calls, reasoning content, and image parts survive a round trip
 * across heterogeneous providers without lossy ad-hoc conversions.
 */

// ----------------------------------------------------------------------------
// Request — content parts
// ----------------------------------------------------------------------------

export type OpenAIRole = "system" | "developer" | "user" | "assistant" | "tool";

export interface OpenAITextPart {
  type: "text";
  text: string;
}

export interface OpenAIImageUrlPart {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
}

export interface OpenAIInputAudioPart {
  type: "input_audio";
  input_audio: { data: string; format: string };
}

export type OpenAIContentPart = OpenAITextPart | OpenAIImageUrlPart | OpenAIInputAudioPart;

export type OpenAIContent = string | OpenAIContentPart[] | null;

// ----------------------------------------------------------------------------
// Request — tool calling
// ----------------------------------------------------------------------------

export interface OpenAIFunctionCall {
  name: string;
  /** JSON-encoded argument object. May be a partial fragment during streaming. */
  arguments: string;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: OpenAIFunctionCall;
  /** Present only in streaming deltas, identifying which call a fragment belongs to. */
  index?: number;
}

export interface OpenAIToolFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface OpenAITool {
  type: "function";
  function: OpenAIToolFunction;
}

export type OpenAIToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

// ----------------------------------------------------------------------------
// Request — messages & request envelope
// ----------------------------------------------------------------------------

export interface OpenAIMessage {
  role: OpenAIRole;
  content: OpenAIContent;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  /**
   * DeepSeek / reasoning-model thinking trace. Always kept strictly separate
   * from `content` so it can be mapped to Anthropic `thinking` blocks without
   * leaking into the visible answer (TASK-005 notes).
   */
  reasoning_content?: string | null;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: OpenAIToolChoice;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string | string[];
  stream?: boolean;
  n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  response_format?: Record<string, unknown>;
  reasoning_effort?: string;
  /** DeepSeek thinking toggle, preserved verbatim through the pivot. */
  thinking?: { type: "enabled" | "disabled" };
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Response — non-streaming
// ----------------------------------------------------------------------------

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export type OpenAIFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "function_call"
  | null;

export interface OpenAIResponseMessage {
  role: "assistant";
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIResponseMessage;
  finish_reason: OpenAIFinishReason;
}

export interface OpenAIChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
  system_fingerprint?: string;
}

// ----------------------------------------------------------------------------
// Response — streaming
// ----------------------------------------------------------------------------

export interface OpenAIDelta {
  role?: "assistant";
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIChunkChoice {
  index: number;
  delta: OpenAIDelta;
  finish_reason: OpenAIFinishReason;
}

export interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIChunkChoice[];
  usage?: OpenAIUsage | null;
}

// ----------------------------------------------------------------------------
// Translator context & contracts
// ----------------------------------------------------------------------------

/** Stamps applied to a translated response so IDs/model stay stable per request. */
export interface ResponseContext {
  /** Model id echoed back on the response. */
  model: string;
  /** Completion id; generated when omitted. */
  id?: string;
  /** Unix seconds; defaults to now. */
  created?: number;
}

/**
 * Stateful per-stream transformer. SSE translation is NOT stateless: tool-call
 * arguments and reasoning arrive as fragments that must be assembled against
 * accumulated state, so a fresh instance is created per stream.
 */
export interface StreamTransformer<TOut> {
  /** Feed one parsed input event; returns zero or more output events. */
  push(chunk: unknown): TOut[];
  /** Signal end-of-stream; returns any final flushed events. */
  end(): TOut[];
}
