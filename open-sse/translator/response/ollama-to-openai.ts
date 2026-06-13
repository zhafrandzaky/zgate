/**
 * Response translator: Ollama `/api/chat` -> OpenAI pivot.
 *
 * Pairs with `request/openai-to-ollama.ts`. Ollama streams newline-delimited
 * JSON objects rather than SSE; the executor parses each line and feeds the
 * object here. Tool-call arguments arrive as objects and are re-stringified to
 * the OpenAI wire form.
 */

import { isRecord } from "../helpers/openaiHelper";
import { stringifyArguments } from "../helpers/toolCallHelper";
import { resolveContext } from "../streaming";
import type {
  OpenAIChatResponse,
  OpenAIResponseMessage,
  OpenAIStreamChunk,
  OpenAIToolCall,
  OpenAIUsage,
  ResponseContext,
  StreamTransformer,
} from "../types";

function mapUsage(raw: Record<string, unknown>): OpenAIUsage | undefined {
  const prompt = typeof raw.prompt_eval_count === "number" ? raw.prompt_eval_count : undefined;
  const completion = typeof raw.eval_count === "number" ? raw.eval_count : undefined;
  if (prompt === undefined && completion === undefined) return undefined;
  const p = prompt ?? 0;
  const c = completion ?? 0;
  return { prompt_tokens: p, completion_tokens: c, total_tokens: p + c };
}

function mapToolCalls(raw: unknown, startIndex = 0): OpenAIToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: OpenAIToolCall[] = [];
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isRecord(entry.function)) return;
    calls.push({
      index: startIndex + i,
      id: `call_${startIndex + i}`,
      type: "function",
      function: {
        name: typeof entry.function.name === "string" ? entry.function.name : "",
        arguments: stringifyArguments(entry.function.arguments),
      },
    });
  });
  return calls;
}

export function translateResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  const message: OpenAIResponseMessage = { role: "assistant", content: null };

  if (isRecord(body) && isRecord(body.message)) {
    const msg = body.message;
    if (typeof msg.content === "string" && msg.content.length > 0) message.content = msg.content;
    const toolCalls = mapToolCalls(msg.tool_calls).map((c) => ({
      id: c.id,
      type: c.type,
      function: c.function,
    }));
    if (toolCalls.length > 0) message.tool_calls = toolCalls;
  }

  const response: OpenAIChatResponse = {
    id: resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: message.tool_calls ? "tool_calls" : "stop",
      },
    ],
  };
  const usage = isRecord(body) ? mapUsage(body) : undefined;
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
      if (!isRecord(event)) return [];
      const chunks: OpenAIStreamChunk[] = [];

      if (isRecord(event.message)) {
        const msg = event.message;
        const toolCalls = mapToolCalls(msg.tool_calls, toolIndex);
        if (toolCalls.length > 0) {
          toolIndex += toolCalls.length;
          chunks.push(baseChunk(withRole({ tool_calls: toolCalls })));
        }
        if (typeof msg.content === "string" && msg.content.length > 0) {
          chunks.push(baseChunk(withRole({ content: msg.content })));
        }
      }

      if (event.done === true) {
        const chunk = baseChunk({}, toolIndex > 0 ? "tool_calls" : "stop");
        const usage = mapUsage(event);
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
