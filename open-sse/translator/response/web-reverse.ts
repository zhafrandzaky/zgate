/**
 * Response translators: web-reverse chat -> OpenAI pivot (grok.com / perplexity).
 *
 * Best-effort stubs (see `request/web-reverse.ts`). Both surfaces stream private
 * JSON shapes with no published schema, so the decoders defensively pull a text
 * token out of the known-likely field paths and forward it as OpenAI content.
 * No tool-calling, no usage — these are fallback providers (docs/PROVIDERS.md:
 * "best effort — jadikan fallback"). Refine once the live wire formats are
 * captured.
 *
 * Observed-likely shapes:
 *   grok-web : { result: { response: { token: "<delta>" } } }
 *              final: { result: { response: { modelResponse: { message: "..." } } } }
 *   perplexity: { text: "<delta or json>" } | { answer: "..." }
 */

import { isRecord } from "../helpers/openaiHelper";
import { resolveContext } from "../streaming";
import type {
  OpenAIChatResponse,
  OpenAIResponseMessage,
  OpenAIStreamChunk,
  ResponseContext,
  StreamTransformer,
} from "../types";

/** Extract an incremental text token from a grok-web event, if present. */
function grokToken(event: unknown): string {
  if (!isRecord(event)) return "";
  const result = isRecord(event.result) ? event.result : undefined;
  const response = result && isRecord(result.response) ? result.response : undefined;
  if (response && typeof response.token === "string") return response.token;
  if (response && isRecord(response.modelResponse)) {
    const msg = response.modelResponse.message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

/** Extract a text fragment from a perplexity-web event, if present. */
function perplexityText(event: unknown): string {
  if (!isRecord(event)) return "";
  if (typeof event.answer === "string") return event.answer;
  if (typeof event.text === "string") return event.text;
  return "";
}

function buildResponse(text: string, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  const message: OpenAIResponseMessage = {
    role: "assistant",
    content: text.length > 0 ? text : null,
  };
  return {
    id: resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [{ index: 0, message, finish_reason: "stop" }],
  };
}

function makeTransformer(
  ctx: ResponseContext,
  extract: (event: unknown) => string,
): StreamTransformer<OpenAIStreamChunk> {
  const resolved = resolveContext(ctx);
  let roleSent = false;
  const chunk = (
    delta: OpenAIStreamChunk["choices"][number]["delta"],
    finish: OpenAIStreamChunk["choices"][number]["finish_reason"] = null,
  ): OpenAIStreamChunk => ({
    id: resolved.id,
    object: "chat.completion.chunk",
    created: resolved.created,
    model: resolved.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  return {
    push(event: unknown): OpenAIStreamChunk[] {
      const text = extract(event);
      if (!text) return [];
      const delta = roleSent ? { content: text } : { role: "assistant" as const, content: text };
      roleSent = true;
      return [chunk(delta)];
    },
    end(): OpenAIStreamChunk[] {
      return [chunk({}, "stop")];
    },
  };
}

// ── grok-web ────────────────────────────────────────────────────────────────

export function grokTranslateResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  return buildResponse(grokToken(body), ctx);
}

export function grokCreateStreamTransformer(
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  return makeTransformer(ctx, grokToken);
}

// ── perplexity-web ────────────────────────────────────────────────────────────

export function perplexityTranslateResponse(
  body: unknown,
  ctx: ResponseContext,
): OpenAIChatResponse {
  return buildResponse(perplexityText(body), ctx);
}

export function perplexityCreateStreamTransformer(
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  return makeTransformer(ctx, perplexityText);
}
