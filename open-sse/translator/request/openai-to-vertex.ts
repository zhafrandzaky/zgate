/**
 * Request translator: OpenAI pivot -> Vertex AI Gemini.
 *
 * Pairs with `response/vertex-to-openai.ts`. The Vertex Gemini request body is
 * the same `contents`/`generationConfig` schema as the public Gemini API; the
 * dynamic per-model/region URL and SA-JSON auth are the executor's concern
 * (`VertexExecutor`, TASK-006), so the body translation simply reuses the Gemini
 * encoder.
 */

import {
  requestFromOpenAI as geminiRequestFromOpenAI,
  type GeminiRequest,
} from "./openai-to-gemini";
import type { OpenAIChatRequest } from "../types";

export type VertexRequest = GeminiRequest;

export function requestFromOpenAI(req: OpenAIChatRequest): VertexRequest {
  return geminiRequestFromOpenAI(req);
}
