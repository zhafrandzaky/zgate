/**
 * Response translator: Anthropic Messages -> OpenAI pivot.
 *
 * Pairs with `request/openai-to-claude.ts`. Handles both the non-streaming
 * Messages response and the Anthropic SSE event stream, mapping `thinking`
 * blocks to `reasoning_content` (kept separate from `content`) and `tool_use`
 * blocks to OpenAI `tool_calls` with a stable per-stream index.
 */

import {
  anthropicContentToResponseMessage,
  anthropicStopToOpenAI,
  type AnthropicContentBlock,
  type AnthropicStopReason,
} from "../helpers/claudeHelper";
import { isRecord } from "../helpers/openaiHelper";
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
  const input = typeof raw.input_tokens === "number" ? raw.input_tokens : 0;
  const output = typeof raw.output_tokens === "number" ? raw.output_tokens : 0;
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
}

export function translateResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  const blocks: AnthropicContentBlock[] =
    isRecord(body) && Array.isArray(body.content)
      ? (body.content as unknown as AnthropicContentBlock[])
      : [];
  const message = anthropicContentToResponseMessage(blocks);
  const stopReason = isRecord(body) ? (body.stop_reason as AnthropicStopReason) : null;

  const response: OpenAIChatResponse = {
    id: isRecord(body) && typeof body.id === "string" ? body.id : resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason:
          anthropicStopToOpenAI(stopReason) ?? (message.tool_calls ? "tool_calls" : "stop"),
      },
    ],
  };
  const usage = isRecord(body) ? mapUsage(body.usage) : undefined;
  if (usage) response.usage = usage;
  return response;
}

export function createStreamTransformer(
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  const resolved = resolveContext(ctx);
  /** Anthropic content-block index -> OpenAI tool_call index. */
  const toolIndexByBlock = new Map<number, number>();
  let nextToolIndex = 0;
  let roleSent = false;
  let usage: OpenAIUsage | undefined;

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
      const type = event.type;

      if (type === "message_start" && isRecord(event.message)) {
        const u = mapUsage(event.message.usage);
        if (u) usage = u;
        return [];
      }

      if (type === "content_block_start" && isRecord(event.content_block)) {
        const block = event.content_block;
        if (block.type === "tool_use") {
          const blockIndex = typeof event.index === "number" ? event.index : 0;
          const toolIndex = nextToolIndex++;
          toolIndexByBlock.set(blockIndex, toolIndex);
          return [
            baseChunk(
              withRole({
                tool_calls: [
                  {
                    index: toolIndex,
                    id: typeof block.id === "string" ? block.id : "",
                    type: "function",
                    function: {
                      name: typeof block.name === "string" ? block.name : "",
                      arguments: "",
                    },
                  },
                ],
              }),
            ),
          ];
        }
        return [];
      }

      if (type === "content_block_delta" && isRecord(event.delta)) {
        const delta = event.delta;
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          return [baseChunk(withRole({ content: delta.text }))];
        }
        if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
          return [baseChunk(withRole({ reasoning_content: delta.thinking }))];
        }
        if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          const blockIndex = typeof event.index === "number" ? event.index : 0;
          const toolIndex = toolIndexByBlock.get(blockIndex) ?? 0;
          return [
            baseChunk({
              tool_calls: [
                {
                  index: toolIndex,
                  id: "",
                  type: "function",
                  function: { name: "", arguments: delta.partial_json },
                },
              ],
            }),
          ];
        }
        return [];
      }

      if (type === "message_delta") {
        const usageDelta = mapUsage(event.usage);
        if (usageDelta) {
          usage = usage
            ? {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usageDelta.completion_tokens,
                total_tokens: usage.prompt_tokens + usageDelta.completion_tokens,
              }
            : usageDelta;
        }
        const stop = isRecord(event.delta)
          ? (event.delta.stop_reason as AnthropicStopReason)
          : null;
        const finish = anthropicStopToOpenAI(stop) ?? "stop";
        const chunk = baseChunk({}, finish);
        if (usage) chunk.usage = usage;
        return [chunk];
      }

      return [];
    },
    end(): OpenAIStreamChunk[] {
      return [];
    },
  };
}
