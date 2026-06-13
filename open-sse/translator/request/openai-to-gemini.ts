/**
 * Request translator: OpenAI pivot -> Google Gemini (Generative Language).
 *
 * Pairs with `response/gemini-to-openai.ts`. Reused (via the registry) by the
 * `gemini-cli`, `vertex`, and `antigravity` families which share the schema.
 */

import { openAIToGemini, type GeminiContent, type GeminiPayload } from "../helpers/geminiHelper";
import { readMaxTokens } from "../helpers/maxTokensHelper";
import { openAIToolsToGemini, type GeminiFunctionDeclaration } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest, OpenAIToolChoice } from "../types";

export interface GeminiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingConfig?: { includeThoughts: boolean };
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: { functionDeclarations: GeminiFunctionDeclaration[] }[];
  toolConfig?: { functionCallingConfig: { mode: "AUTO" | "ANY" | "NONE" } };
  generationConfig?: GeminiGenerationConfig;
}

function mapToolMode(choice: OpenAIToolChoice | undefined): "AUTO" | "ANY" | "NONE" | undefined {
  if (choice === undefined) return undefined;
  if (choice === "auto") return "AUTO";
  if (choice === "required") return "ANY";
  if (choice === "none") return "NONE";
  if (typeof choice === "object") return "ANY";
  return undefined;
}

export function requestFromOpenAI(req: OpenAIChatRequest): GeminiRequest {
  const payload: GeminiPayload = openAIToGemini(req.messages);
  const out: GeminiRequest = { contents: payload.contents };

  if (payload.systemInstruction) {
    out.systemInstruction = {
      parts: payload.systemInstruction.parts.map((part) => ({ text: part.text })),
    };
  }

  if (req.tools && req.tools.length > 0) {
    out.tools = [{ functionDeclarations: openAIToolsToGemini(req.tools) }];
    const mode = mapToolMode(req.tool_choice);
    if (mode) out.toolConfig = { functionCallingConfig: { mode } };
  }

  const generationConfig: GeminiGenerationConfig = {};
  const maxTokens = readMaxTokens(req);
  if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;
  if (typeof req.temperature === "number") generationConfig.temperature = req.temperature;
  if (typeof req.top_p === "number") generationConfig.topP = req.top_p;
  if (typeof req.top_k === "number") generationConfig.topK = req.top_k;
  if (typeof req.stop === "string") generationConfig.stopSequences = [req.stop];
  else if (Array.isArray(req.stop)) generationConfig.stopSequences = req.stop;
  if (req.thinking?.type === "enabled" || req.reasoning_effort) {
    generationConfig.thinkingConfig = { includeThoughts: true };
  }
  if (Object.keys(generationConfig).length > 0) out.generationConfig = generationConfig;

  return out;
}
