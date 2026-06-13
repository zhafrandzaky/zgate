/**
 * Response translator: Cursor -> OpenAI pivot.
 *
 * Pairs with `request/openai-to-cursor.ts`. The `CursorExecutor` (TASK-006)
 * decodes Cursor's protobuf/Connect frames into normalized JSON events; this
 * translator consumes those normalized events (`{ text }`, `{ toolCall }`,
 * `{ done }`) and never touches protobuf itself.
 */

import { isRecord } from "../helpers/openaiHelper";
import { stringifyArguments } from "../helpers/toolCallHelper";
import { resolveContext } from "../streaming";
import type {
  OpenAIChatResponse,
  OpenAIResponseMessage,
  OpenAIStreamChunk,
  OpenAIToolCall,
  ResponseContext,
  StreamTransformer,
} from "../types";

function readToolCall(raw: unknown, index: number): OpenAIToolCall | null {
  if (!isRecord(raw)) return null;
  return {
    index,
    id: typeof raw.id === "string" ? raw.id : `call_${index}`,
    type: "function",
    function: {
      name: typeof raw.name === "string" ? raw.name : "",
      arguments:
        typeof raw.args === "string" ? raw.args : stringifyArguments(raw.args ?? raw.input),
    },
  };
}

export function translateResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  let text = "";
  const toolCalls: OpenAIToolCall[] = [];

  if (isRecord(body)) {
    if (typeof body.text === "string") text = body.text;
    if (Array.isArray(body.toolCalls)) {
      body.toolCalls.forEach((tc, i) => {
        const call = readToolCall(tc, i);
        if (call) toolCalls.push({ id: call.id, type: call.type, function: call.function });
      });
    }
  }

  const message: OpenAIResponseMessage = {
    role: "assistant",
    content: text.length > 0 ? text : null,
  };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  return {
    id: resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [{ index: 0, message, finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop" }],
  };
}

export function createStreamTransformer(
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  const resolved = resolveContext(ctx);
  let roleSent = false;
  let toolIndex = 0;
  let sawToolCall = false;

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

      if (typeof event.text === "string" && event.text.length > 0) {
        chunks.push(baseChunk(withRole({ content: event.text })));
      }
      if (isRecord(event.toolCall)) {
        const call = readToolCall(event.toolCall, toolIndex++);
        if (call) {
          sawToolCall = true;
          chunks.push(baseChunk(withRole({ tool_calls: [call] })));
        }
      }
      if (event.done === true) {
        chunks.push(baseChunk({}, sawToolCall ? "tool_calls" : "stop"));
      }
      return chunks;
    },
    end(): OpenAIStreamChunk[] {
      return [];
    },
  };
}
