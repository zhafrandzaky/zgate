/**
 * Response translator: Google Gemini -> OpenAI pivot.
 *
 * Pairs with `request/openai-to-gemini.ts` (and, via the registry, the
 * `gemini-cli` / `vertex` / `antigravity` families). Gemini emits complete
 * `functionCall` parts (no argument fragmentation), so each becomes a fully
 * formed tool_call delta on the stream.
 */

import {
  geminiFinishToOpenAI,
  geminiPartsToResponseMessage,
  isFunctionCallPart,
  isTextPart,
  type GeminiPart,
} from "../helpers/geminiHelper";
import { isRecord } from "../helpers/openaiHelper";
import { geminiFunctionCallToOpenAI } from "../helpers/toolCallHelper";
import { resolveContext } from "../streaming";
import type {
  OpenAIChatResponse,
  OpenAIStreamChunk,
  OpenAIUsage,
  ResponseContext,
  StreamTransformer,
} from "../types";

function mapUsage(raw: unknown): OpenAIUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const prompt = typeof raw.promptTokenCount === "number" ? raw.promptTokenCount : 0;
  const completion = typeof raw.candidatesTokenCount === "number" ? raw.candidatesTokenCount : 0;
  const total = typeof raw.totalTokenCount === "number" ? raw.totalTokenCount : prompt + completion;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
}

function firstCandidateParts(body: unknown): { parts: GeminiPart[]; finishReason: string | null } {
  if (!isRecord(body) || !Array.isArray(body.candidates)) return { parts: [], finishReason: null };
  const candidate = body.candidates[0];
  if (!isRecord(candidate)) return { parts: [], finishReason: null };
  const content = isRecord(candidate.content) ? candidate.content : undefined;
  const parts = content && Array.isArray(content.parts) ? (content.parts as GeminiPart[]) : [];
  const finishReason = typeof candidate.finishReason === "string" ? candidate.finishReason : null;
  return { parts, finishReason };
}

export function translateResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  const { parts, finishReason } = firstCandidateParts(body);
  const message = geminiPartsToResponseMessage(parts);

  const response: OpenAIChatResponse = {
    id: resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason:
          geminiFinishToOpenAI(finishReason) ?? (message.tool_calls ? "tool_calls" : "stop"),
      },
    ],
  };
  const usage = isRecord(body) ? mapUsage(body.usageMetadata) : undefined;
  if (usage) response.usage = usage;
  return response;
}

export function createStreamTransformer(
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  const resolved = resolveContext(ctx);
  let roleSent = false;
  let toolIndex = 0;

  const baseChunk = (
    delta: OpenAIStreamChunk["choices"][number]["delta"],
    finish: OpenAIStreamChunk["choices"][number]["finish_reason"] = null,
  ): OpenAIStreamChunk => ({
    id: resolved.id,
    object: "chat.completion.chunk",
    created: resolved.created,
    model: resolved.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  const withRole = (
    delta: OpenAIStreamChunk["choices"][number]["delta"],
  ): OpenAIStreamChunk["choices"][number]["delta"] => {
    if (roleSent) return delta;
    roleSent = true;
    return { role: "assistant", ...delta };
  };

  return {
    push(event: unknown): OpenAIStreamChunk[] {
      const { parts, finishReason } = firstCandidateParts(event);
      const chunks: OpenAIStreamChunk[] = [];
      let text = "";
      let reasoning = "";

      for (const part of parts) {
        if (isFunctionCallPart(part)) {
          const call = geminiFunctionCallToOpenAI(part);
          chunks.push(
            baseChunk(
              withRole({
                tool_calls: [
                  {
                    index: toolIndex++,
                    id: call.id,
                    type: "function",
                    function: call.function,
                  },
                ],
              }),
            ),
          );
        } else if (isTextPart(part)) {
          if (part.thought) reasoning += part.text;
          else text += part.text;
        }
      }

      if (reasoning.length > 0) chunks.push(baseChunk(withRole({ reasoning_content: reasoning })));
      if (text.length > 0) chunks.push(baseChunk(withRole({ content: text })));

      if (finishReason) {
        const chunk = baseChunk({}, geminiFinishToOpenAI(finishReason) ?? "stop");
        const usage = isRecord(event) ? mapUsage(event.usageMetadata) : undefined;
        if (usage) chunk.usage = usage;
        chunks.push(chunk);
      }

      return chunks;
    },
    end(): OpenAIStreamChunk[] {
      return [];
    },
  };
}
