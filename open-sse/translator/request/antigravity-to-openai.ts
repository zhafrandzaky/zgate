/**
 * Request translator: Antigravity (client) -> OpenAI pivot.
 *
 * Antigravity (the IDE backend) wraps a Gemini-style request in a Cloud Code
 * companion envelope (`{ model, project, request: { contents, ... } }`) and
 * routes models to different Google/Anthropic/OpenAI backends. The inner payload
 * is Gemini-schema, so this unwraps the envelope and delegates to the Gemini
 * normalizer. Pairs with `response/openai-to-antigravity.ts`.
 */

import { isRecord } from "../helpers/openaiHelper";
import { requestToOpenAI as geminiRequestToOpenAI } from "./gemini-to-openai";
import type { OpenAIChatRequest } from "../types";

/** Unwrap the `{ request: ... }` Cloud Code envelope if present. */
export function unwrapEnvelope(body: unknown): { inner: unknown; model?: string } {
  if (isRecord(body) && isRecord(body.request)) {
    return {
      inner: body.request,
      model: typeof body.model === "string" ? body.model : undefined,
    };
  }
  return { inner: body };
}

export function requestToOpenAI(body: unknown): OpenAIChatRequest {
  const { inner, model } = unwrapEnvelope(body);
  const request = geminiRequestToOpenAI(inner);
  if (model && !request.model) request.model = model;
  return request;
}
