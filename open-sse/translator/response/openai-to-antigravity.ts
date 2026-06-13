/**
 * Response translator: OpenAI pivot -> Antigravity (for Antigravity clients).
 *
 * Pairs with `request/antigravity-to-openai.ts`. Antigravity wraps a Gemini
 * response inside a Cloud Code envelope (`{ response: <gemini> }`), so this
 * delegates to the Gemini encoder and wraps each result.
 */

import {
  createStreamTransformer as geminiStreamTransformer,
  translateResponse as geminiTranslateResponse,
  type GeminiResponse,
} from "./openai-to-gemini";
import type { OpenAIChatResponse, ResponseContext, StreamTransformer } from "../types";

export interface AntigravityResponse {
  response: GeminiResponse;
}

export function translateResponse(
  res: OpenAIChatResponse,
  ctx: ResponseContext,
): AntigravityResponse {
  return { response: geminiTranslateResponse(res, ctx) };
}

export function createStreamTransformer(ctx: ResponseContext): StreamTransformer<unknown> {
  const inner = geminiStreamTransformer(ctx);
  return {
    push(chunk: unknown): unknown[] {
      return inner.push(chunk).map((event) => ({ response: event }));
    },
    end(): unknown[] {
      return inner.end().map((event) => ({ response: event }));
    },
  };
}
