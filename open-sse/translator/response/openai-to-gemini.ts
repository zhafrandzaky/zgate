/**
 * Response translator: OpenAI pivot -> Google Gemini (for Gemini clients).
 *
 * Pairs with `request/gemini-to-openai.ts`. Re-encodes a pivot Chat Completion
 * (and chunk stream) into Gemini's `candidates` response / streaming shape.
 * Because Gemini `functionCall` parts must carry a *complete* argument object,
 * tool-call argument fragments from the pivot stream are buffered and flushed as
 * whole function calls on the terminal chunk.
 */

import {
  openAIFinishToGemini,
  responseMessageToGeminiParts,
  type GeminiPart,
} from "../helpers/geminiHelper";
import { resolveContext } from "../streaming";
import type {
  OpenAIChatResponse,
  OpenAIStreamChunk,
  ResponseContext,
  StreamTransformer,
} from "../types";

export interface GeminiCandidate {
  content: { role: "model"; parts: GeminiPart[] };
  finishReason?: string;
  index: number;
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export function translateResponse(res: OpenAIChatResponse, ctx: ResponseContext): GeminiResponse {
  void resolveContext(ctx);
  const choice = res.choices[0];
  const message = choice?.message ?? { role: "assistant" as const, content: null };

  const response: GeminiResponse = {
    candidates: [
      {
        content: { role: "model", parts: responseMessageToGeminiParts(message) },
        finishReason: openAIFinishToGemini(choice?.finish_reason ?? "stop"),
        index: 0,
      },
    ],
  };
  if (res.usage) {
    response.usageMetadata = {
      promptTokenCount: res.usage.prompt_tokens,
      candidatesTokenCount: res.usage.completion_tokens,
      totalTokenCount: res.usage.total_tokens,
    };
  }
  return response;
}

type ToolBuffer = { name: string; args: string };

export function createStreamTransformer(ctx: ResponseContext): StreamTransformer<unknown> {
  void resolveContext(ctx);
  const toolsByIndex = new Map<number, ToolBuffer>();
  let promptTokens = 0;
  let completionTokens = 0;

  const candidateChunk = (parts: GeminiPart[], finishReason?: string): GeminiResponse => {
    const candidate: GeminiCandidate = { content: { role: "model", parts }, index: 0 };
    if (finishReason) candidate.finishReason = finishReason;
    const chunk: GeminiResponse = { candidates: [candidate] };
    if (finishReason && (promptTokens > 0 || completionTokens > 0)) {
      chunk.usageMetadata = {
        promptTokenCount: promptTokens,
        candidatesTokenCount: completionTokens,
        totalTokenCount: promptTokens + completionTokens,
      };
    }
    return chunk;
  };

  return {
    push(chunk: unknown): unknown[] {
      const streamChunk = chunk as OpenAIStreamChunk;
      const choice = streamChunk?.choices?.[0];
      if (!choice) return [];
      if (streamChunk.usage) {
        promptTokens = streamChunk.usage.prompt_tokens ?? promptTokens;
        completionTokens = streamChunk.usage.completion_tokens ?? completionTokens;
      }

      const out: unknown[] = [];
      const delta = choice.delta ?? {};

      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        out.push(candidateChunk([{ text: delta.reasoning_content, thought: true }]));
      }
      if (typeof delta.content === "string" && delta.content.length > 0) {
        out.push(candidateChunk([{ text: delta.content }]));
      }
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0;
        const existing = toolsByIndex.get(index) ?? { name: "", args: "" };
        toolsByIndex.set(index, {
          name: call.function.name || existing.name,
          args: existing.args + (call.function.arguments ?? ""),
        });
      }

      if (choice.finish_reason) {
        const parts: GeminiPart[] = [...toolsByIndex.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, buf]) => ({
            functionCall: { name: buf.name, args: safeParse(buf.args) },
          }));
        out.push(candidateChunk(parts, openAIFinishToGemini(choice.finish_reason)));
      }

      return out;
    },
    end(): unknown[] {
      return [];
    },
  };
}

function safeParse(args: string): Record<string, unknown> {
  if (!args) return {};
  try {
    const parsed: unknown = JSON.parse(args);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
