/**
 * Response translator: AWS CodeWhisperer (Kiro) -> OpenAI pivot.
 *
 * Pairs with `request/openai-to-kiro.ts`. CodeWhisperer emits an event stream of
 * `assistantResponseEvent` (text) and `toolUseEvent` (tool invocation, whose
 * `input` arrives as incremental JSON fragments terminated by `stop`). The
 * executor decodes the AWS event framing and feeds the parsed objects here.
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

interface KiroAggregate {
  content: string;
  toolCalls: OpenAIToolCall[];
}

function aggregate(body: unknown): KiroAggregate {
  const result: KiroAggregate = { content: "", toolCalls: [] };
  if (!isRecord(body)) return result;

  if (typeof body.content === "string") result.content = body.content;
  if (Array.isArray(body.toolUses)) {
    body.toolUses.forEach((tool, i) => {
      if (!isRecord(tool)) return;
      result.toolCalls.push({
        id: typeof tool.toolUseId === "string" ? tool.toolUseId : `call_${i}`,
        type: "function",
        function: {
          name: typeof tool.name === "string" ? tool.name : "",
          arguments: stringifyArguments(tool.input),
        },
      });
    });
  }
  return result;
}

export function translateResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  const agg = aggregate(body);
  const message: OpenAIResponseMessage = {
    role: "assistant",
    content: agg.content.length > 0 ? agg.content : null,
  };
  if (agg.toolCalls.length > 0) message.tool_calls = agg.toolCalls;

  return {
    id: resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: agg.toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
  };
}

export function createStreamTransformer(
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  const resolved = resolveContext(ctx);
  let roleSent = false;
  const toolIndexById = new Map<string, number>();
  let nextToolIndex = 0;

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

      if (isRecord(event.assistantResponseEvent)) {
        const content = event.assistantResponseEvent.content;
        if (typeof content === "string" && content.length > 0) {
          return [baseChunk(withRole({ content }))];
        }
        return [];
      }

      if (isRecord(event.toolUseEvent)) {
        const tool = event.toolUseEvent;
        const id = typeof tool.toolUseId === "string" ? tool.toolUseId : `tool_${nextToolIndex}`;
        let index = toolIndexById.get(id);
        const chunks: OpenAIStreamChunk[] = [];
        if (index === undefined) {
          index = nextToolIndex++;
          toolIndexById.set(id, index);
          chunks.push(
            baseChunk(
              withRole({
                tool_calls: [
                  {
                    index,
                    id,
                    type: "function",
                    function: {
                      name: typeof tool.name === "string" ? tool.name : "",
                      arguments: "",
                    },
                  },
                ],
              }),
            ),
          );
        }
        if (typeof tool.input === "string" && tool.input.length > 0) {
          chunks.push(
            baseChunk({
              tool_calls: [
                { index, id: "", type: "function", function: { name: "", arguments: tool.input } },
              ],
            }),
          );
        }
        return chunks;
      }

      return [];
    },
    end(): OpenAIStreamChunk[] {
      return [baseChunk({}, nextToolIndex > 0 ? "tool_calls" : "stop")];
    },
  };
}
