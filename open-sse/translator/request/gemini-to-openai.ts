/**
 * Request translator: Google Gemini (client) -> OpenAI pivot.
 *
 * Inbound side for Gemini-format clients. Pairs with `response/openai-to-gemini.ts`,
 * which re-encodes the pivot response back to Gemini for the client.
 */

import {
  geminiToOpenAI,
  type GeminiContent,
  type GeminiPart,
  type GeminiPayload,
} from "../helpers/geminiHelper";
import { isRecord } from "../helpers/openaiHelper";
import { geminiToolsToOpenAI, type GeminiFunctionDeclaration } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest } from "../types";

function coerceContents(raw: unknown): GeminiContent[] {
  if (!Array.isArray(raw)) return [];
  const contents: GeminiContent[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !Array.isArray(entry.parts)) continue;
    const role = entry.role === "model" ? "model" : "user";
    contents.push({ role, parts: entry.parts as unknown as GeminiPart[] });
  }
  return contents;
}

function coerceSystemInstruction(raw: unknown): GeminiPayload["systemInstruction"] {
  if (!isRecord(raw) || !Array.isArray(raw.parts)) return undefined;
  const parts = raw.parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? { text: part.text } : null))
    .filter((p): p is { text: string } => p !== null);
  return parts.length > 0 ? { parts } : undefined;
}

function collectFunctionDeclarations(raw: unknown): GeminiFunctionDeclaration[] {
  if (!Array.isArray(raw)) return [];
  const decls: GeminiFunctionDeclaration[] = [];
  for (const tool of raw) {
    if (isRecord(tool) && Array.isArray(tool.functionDeclarations)) {
      for (const decl of tool.functionDeclarations) {
        if (isRecord(decl) && typeof decl.name === "string") {
          decls.push(decl as unknown as GeminiFunctionDeclaration);
        }
      }
    }
  }
  return decls;
}

export function requestToOpenAI(body: unknown): OpenAIChatRequest {
  if (!isRecord(body)) return { model: "", messages: [] };

  const payload: GeminiPayload = { contents: coerceContents(body.contents) };
  const system = coerceSystemInstruction(body.systemInstruction);
  if (system) payload.systemInstruction = system;

  const request: OpenAIChatRequest = {
    model: typeof body.model === "string" ? body.model : "",
    messages: geminiToOpenAI(payload),
  };

  const decls = collectFunctionDeclarations(body.tools);
  if (decls.length > 0) request.tools = geminiToolsToOpenAI(decls);

  if (isRecord(body.generationConfig)) {
    const gc = body.generationConfig;
    if (typeof gc.maxOutputTokens === "number") request.max_tokens = gc.maxOutputTokens;
    if (typeof gc.temperature === "number") request.temperature = gc.temperature;
    if (typeof gc.topP === "number") request.top_p = gc.topP;
    if (typeof gc.topK === "number") request.top_k = gc.topK;
    if (Array.isArray(gc.stopSequences)) {
      request.stop = gc.stopSequences.filter((s): s is string => typeof s === "string");
    }
  }

  return request;
}
