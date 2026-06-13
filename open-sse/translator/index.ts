/**
 * Translator registry.
 *
 * Two directions, one pivot (OpenAI Chat Completions). The chat core (TASK-007)
 * uses these entry points:
 *
 *   client request  --decodeRequest-->  pivot  --encodeRequest-->  provider
 *   provider response --decodeResponse--> pivot --encodeResponse--> client
 *
 * Streaming mirrors this with stateful per-stream transformers. Formats that
 * share a schema (gemini-cli/vertex ride on gemini) collapse via
 * `canonicalFormat`, so every provider/client format resolves to exactly one
 * translator pair.
 */

import { Format, canonicalFormat, isFormat } from "./formats";
import { normalizeRequest } from "./helpers/openaiHelper";
import { resolveContext } from "./streaming";
import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
  ResponseContext,
  StreamTransformer,
} from "./types";

// Request encoders: OpenAI pivot -> provider format.
import * as reqClaude from "./request/openai-to-claude";
import * as reqGemini from "./request/openai-to-gemini";
import * as reqKiro from "./request/openai-to-kiro";
import * as reqCursor from "./request/openai-to-cursor";
import * as reqOllama from "./request/openai-to-ollama";
import * as reqVertex from "./request/openai-to-vertex";
import * as reqCommandCode from "./request/openai-to-commandcode";
import * as reqResponses from "./request/openai-responses";
// Request decoders: client format -> OpenAI pivot.
import * as reqFromClaude from "./request/claude-to-openai";
import * as reqFromGemini from "./request/gemini-to-openai";
import * as reqFromAntigravity from "./request/antigravity-to-openai";

// Response decoders: provider format -> OpenAI pivot.
import * as resClaude from "./response/claude-to-openai";
import * as resGemini from "./response/gemini-to-openai";
import * as resKiro from "./response/kiro-to-openai";
import * as resCursor from "./response/cursor-to-openai";
import * as resOllama from "./response/ollama-to-openai";
import * as resVertex from "./response/vertex-to-openai";
import * as resCommandCode from "./response/commandcode-to-openai";
import * as resResponses from "./response/openai-responses";
// Response encoders: OpenAI pivot -> client format.
import * as resToClaude from "./response/openai-to-claude";
import * as resToGemini from "./response/openai-to-gemini";
import * as resToAntigravity from "./response/openai-to-antigravity";

// ----------------------------------------------------------------------------
// Translator contracts
// ----------------------------------------------------------------------------

/** Pivot <-> provider: used when ZGate talks to an upstream provider. */
export interface ProviderTranslator {
  format: Format;
  /** OpenAI pivot request -> provider request body. */
  encodeRequest(req: OpenAIChatRequest): unknown;
  /** provider response -> OpenAI pivot response (non-streaming). */
  decodeResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse;
  /** provider SSE -> OpenAI pivot SSE (stateful per stream). */
  decodeStream(ctx: ResponseContext): StreamTransformer<OpenAIStreamChunk>;
}

/** Client <-> pivot: used for ZGate's own request surfaces. */
export interface ClientTranslator {
  format: Format;
  /** client request -> OpenAI pivot request. */
  decodeRequest(body: unknown): OpenAIChatRequest;
  /** OpenAI pivot response -> client response (non-streaming). */
  encodeResponse(res: OpenAIChatResponse, ctx: ResponseContext): unknown;
  /** OpenAI pivot SSE -> client SSE (stateful per stream). */
  encodeStream(ctx: ResponseContext): StreamTransformer<unknown>;
}

// ----------------------------------------------------------------------------
// OpenAI identity (the pivot is its own translation)
// ----------------------------------------------------------------------------

function passthroughResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  if (
    body !== null &&
    typeof body === "object" &&
    Array.isArray((body as { choices?: unknown }).choices)
  ) {
    return body as OpenAIChatResponse;
  }
  return {
    id: resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: "stop" }],
  };
}

function identityStream<T>(): StreamTransformer<T> {
  return {
    push(chunk: unknown): T[] {
      return chunk == null ? [] : [chunk as T];
    },
    end(): T[] {
      return [];
    },
  };
}

// ----------------------------------------------------------------------------
// Antigravity provider direction (compose Gemini encode/decode + envelope)
// ----------------------------------------------------------------------------

function antigravityEncodeRequest(req: OpenAIChatRequest): unknown {
  return { model: req.model, request: reqGemini.requestFromOpenAI(req) };
}

function antigravityDecodeResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const inner =
    body !== null && typeof body === "object" && "response" in body
      ? (body as { response: unknown }).response
      : body;
  return resGemini.translateResponse(inner, ctx);
}

function antigravityDecodeStream(ctx: ResponseContext): StreamTransformer<OpenAIStreamChunk> {
  const inner = resGemini.createStreamTransformer(ctx);
  return {
    push(chunk: unknown): OpenAIStreamChunk[] {
      const unwrapped =
        chunk !== null && typeof chunk === "object" && "response" in chunk
          ? (chunk as { response: unknown }).response
          : chunk;
      return inner.push(unwrapped);
    },
    end(): OpenAIStreamChunk[] {
      return inner.end();
    },
  };
}

// ----------------------------------------------------------------------------
// Registries
// ----------------------------------------------------------------------------

const providerTranslators: Record<Format, ProviderTranslator> = {
  [Format.OpenAI]: {
    format: Format.OpenAI,
    encodeRequest: (req) => req,
    decodeResponse: passthroughResponse,
    decodeStream: () => identityStream<OpenAIStreamChunk>(),
  },
  [Format.OpenAIResponses]: {
    format: Format.OpenAIResponses,
    encodeRequest: reqResponses.requestFromOpenAI,
    decodeResponse: resResponses.translateResponse,
    decodeStream: resResponses.createStreamTransformer,
  },
  [Format.Claude]: {
    format: Format.Claude,
    encodeRequest: reqClaude.requestFromOpenAI,
    decodeResponse: resClaude.translateResponse,
    decodeStream: resClaude.createStreamTransformer,
  },
  [Format.Gemini]: {
    format: Format.Gemini,
    encodeRequest: reqGemini.requestFromOpenAI,
    decodeResponse: resGemini.translateResponse,
    decodeStream: resGemini.createStreamTransformer,
  },
  [Format.GeminiCli]: {
    format: Format.Gemini,
    encodeRequest: reqGemini.requestFromOpenAI,
    decodeResponse: resGemini.translateResponse,
    decodeStream: resGemini.createStreamTransformer,
  },
  [Format.Kiro]: {
    format: Format.Kiro,
    encodeRequest: reqKiro.requestFromOpenAI,
    decodeResponse: resKiro.translateResponse,
    decodeStream: resKiro.createStreamTransformer,
  },
  [Format.Cursor]: {
    format: Format.Cursor,
    encodeRequest: reqCursor.requestFromOpenAI,
    decodeResponse: resCursor.translateResponse,
    decodeStream: resCursor.createStreamTransformer,
  },
  [Format.Ollama]: {
    format: Format.Ollama,
    encodeRequest: reqOllama.requestFromOpenAI,
    decodeResponse: resOllama.translateResponse,
    decodeStream: resOllama.createStreamTransformer,
  },
  [Format.Vertex]: {
    format: Format.Vertex,
    encodeRequest: reqVertex.requestFromOpenAI,
    decodeResponse: resVertex.translateResponse,
    decodeStream: resVertex.createStreamTransformer,
  },
  [Format.CommandCode]: {
    format: Format.CommandCode,
    encodeRequest: reqCommandCode.requestFromOpenAI,
    decodeResponse: resCommandCode.translateResponse,
    decodeStream: resCommandCode.createStreamTransformer,
  },
  [Format.Antigravity]: {
    format: Format.Antigravity,
    encodeRequest: antigravityEncodeRequest,
    decodeResponse: antigravityDecodeResponse,
    decodeStream: antigravityDecodeStream,
  },
};

const clientTranslators: Record<Format, ClientTranslator> = {
  [Format.OpenAI]: {
    format: Format.OpenAI,
    decodeRequest: normalizeRequest,
    encodeResponse: (res) => res,
    encodeStream: () => identityStream<unknown>(),
  },
  [Format.OpenAIResponses]: {
    format: Format.OpenAIResponses,
    decodeRequest: reqResponses.requestToOpenAI,
    encodeResponse: (res) => res,
    encodeStream: () => identityStream<unknown>(),
  },
  [Format.Claude]: {
    format: Format.Claude,
    decodeRequest: reqFromClaude.requestToOpenAI,
    encodeResponse: resToClaude.translateResponse,
    encodeStream: resToClaude.createStreamTransformer,
  },
  [Format.Gemini]: {
    format: Format.Gemini,
    decodeRequest: reqFromGemini.requestToOpenAI,
    encodeResponse: resToGemini.translateResponse,
    encodeStream: resToGemini.createStreamTransformer,
  },
  [Format.GeminiCli]: {
    format: Format.Gemini,
    decodeRequest: reqFromGemini.requestToOpenAI,
    encodeResponse: resToGemini.translateResponse,
    encodeStream: resToGemini.createStreamTransformer,
  },
  [Format.Antigravity]: {
    format: Format.Antigravity,
    decodeRequest: reqFromAntigravity.requestToOpenAI,
    encodeResponse: resToAntigravity.translateResponse,
    encodeStream: resToAntigravity.createStreamTransformer,
  },
  // The following formats are provider-only; expose an OpenAI-identity client
  // pair so the registry total-maps every Format without throwing.
  [Format.Kiro]: openAIClientFallback(Format.Kiro),
  [Format.Cursor]: openAIClientFallback(Format.Cursor),
  [Format.Ollama]: openAIClientFallback(Format.Ollama),
  [Format.Vertex]: openAIClientFallback(Format.Vertex),
  [Format.CommandCode]: openAIClientFallback(Format.CommandCode),
};

function openAIClientFallback(format: Format): ClientTranslator {
  return {
    format,
    decodeRequest: normalizeRequest,
    encodeResponse: (res) => res,
    encodeStream: () => identityStream<unknown>(),
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export { Format, canonicalFormat, isFormat };
export type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
  ResponseContext,
  StreamTransformer,
};

export function getProviderTranslator(format: Format): ProviderTranslator {
  return providerTranslators[canonicalFormatOrSelf(format)];
}

export function getClientTranslator(format: Format): ClientTranslator {
  return clientTranslators[canonicalFormatOrSelf(format)];
}

/** Canonicalize but keep `gemini-cli`/`vertex` keys that exist in the maps. */
function canonicalFormatOrSelf(format: Format): Format {
  if (format in providerTranslators) return format;
  return canonicalFormat(format);
}

/** OpenAI pivot request -> provider wire body. */
export function encodeProviderRequest(format: Format, req: OpenAIChatRequest): unknown {
  return getProviderTranslator(format).encodeRequest(req);
}

/** provider response -> OpenAI pivot (non-streaming). */
export function decodeProviderResponse(
  format: Format,
  body: unknown,
  ctx: ResponseContext,
): OpenAIChatResponse {
  return getProviderTranslator(format).decodeResponse(body, ctx);
}

/** provider SSE stream -> OpenAI pivot stream transformer. */
export function createProviderStreamDecoder(
  format: Format,
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  return getProviderTranslator(format).decodeStream(ctx);
}

/** client request body -> OpenAI pivot request. */
export function decodeClientRequest(format: Format, body: unknown): OpenAIChatRequest {
  return getClientTranslator(format).decodeRequest(body);
}

/** OpenAI pivot response -> client wire body (non-streaming). */
export function encodeClientResponse(
  format: Format,
  res: OpenAIChatResponse,
  ctx: ResponseContext,
): unknown {
  return getClientTranslator(format).encodeResponse(res, ctx);
}

/** OpenAI pivot stream -> client SSE stream transformer. */
export function createClientStreamEncoder(
  format: Format,
  ctx: ResponseContext,
): StreamTransformer<unknown> {
  return getClientTranslator(format).encodeStream(ctx);
}
