/**
 * Response translator: OpenAI pivot -> Anthropic Messages (for Claude clients).
 *
 * Pairs with `request/claude-to-openai.ts`. Re-encodes a pivot Chat Completion
 * (and its chunk stream) into the Anthropic Messages response / SSE event shape
 * a Claude-format client expects. Anthropic streams content blocks sequentially
 * (exactly one block open at a time), so the encoder serializes the pivot's
 * interleaved text / reasoning / tool_call deltas into ordered blocks.
 */

import {
  openAIFinishToAnthropic,
  responseMessageToAnthropicContent,
  type AnthropicContentBlock,
} from "../helpers/claudeHelper";
import { generateId, resolveContext } from "../streaming";
import type {
  OpenAIChatResponse,
  OpenAIStreamChunk,
  ResponseContext,
  StreamTransformer,
} from "../types";

export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export function translateResponse(
  res: OpenAIChatResponse,
  ctx: ResponseContext,
): AnthropicResponse {
  const resolved = resolveContext({ ...ctx, id: ctx.id ?? res.id, model: ctx.model || res.model });
  const choice = res.choices[0];
  const message = choice?.message ?? { role: "assistant" as const, content: null };
  return {
    id: resolved.id.startsWith("msg") ? resolved.id : `msg_${resolved.id}`,
    type: "message",
    role: "assistant",
    model: resolved.model,
    content: responseMessageToAnthropicContent(message),
    stop_reason: openAIFinishToAnthropic(choice?.finish_reason ?? null),
    stop_sequence: null,
    usage: {
      input_tokens: res.usage?.prompt_tokens ?? 0,
      output_tokens: res.usage?.completion_tokens ?? 0,
    },
  };
}

type Channel = { kind: "text" | "thinking" | "tool"; toolIndex?: number };

function sameChannel(a: Channel | null, b: Channel): boolean {
  return a !== null && a.kind === b.kind && a.toolIndex === b.toolIndex;
}

export function createStreamTransformer(ctx: ResponseContext): StreamTransformer<unknown> {
  const resolved = resolveContext(ctx);
  const messageId = `msg_${resolved.id}`;
  let started = false;
  let activeChannel: Channel | null = null;
  let activeBlockIndex = -1;
  let nextBlockIndex = 0;
  let finishReason: OpenAIChatResponse["choices"][number]["finish_reason"] = null;
  let outputTokens = 0;
  let inputTokens = 0;

  const start = (events: unknown[]): void => {
    if (started) return;
    started = true;
    events.push({
      type: "message_start",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        model: resolved.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
  };

  const closeActive = (events: unknown[]): void => {
    if (activeBlockIndex >= 0) {
      events.push({ type: "content_block_stop", index: activeBlockIndex });
      activeBlockIndex = -1;
      activeChannel = null;
    }
  };

  const openChannel = (
    channel: Channel,
    events: unknown[],
    toolCall?: { id: string; name: string },
  ): number => {
    if (sameChannel(activeChannel, channel)) return activeBlockIndex;
    closeActive(events);
    const index = nextBlockIndex++;
    activeBlockIndex = index;
    activeChannel = channel;
    if (channel.kind === "text") {
      events.push({
        type: "content_block_start",
        index,
        content_block: { type: "text", text: "" },
      });
    } else if (channel.kind === "thinking") {
      events.push({
        type: "content_block_start",
        index,
        content_block: { type: "thinking", thinking: "" },
      });
    } else {
      events.push({
        type: "content_block_start",
        index,
        content_block: {
          type: "tool_use",
          id: toolCall?.id ?? generateId("toolu"),
          name: toolCall?.name ?? "",
          input: {},
        },
      });
    }
    return index;
  };

  return {
    push(chunk: unknown): unknown[] {
      const events: unknown[] = [];
      const streamChunk = chunk as OpenAIStreamChunk;
      const choice = streamChunk?.choices?.[0];
      if (!choice) return events;
      start(events);

      const delta = choice.delta ?? {};
      if (streamChunk.usage) {
        inputTokens = streamChunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = streamChunk.usage.completion_tokens ?? outputTokens;
      }

      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        openChannel({ kind: "thinking" }, events);
        events.push({
          type: "content_block_delta",
          index: activeBlockIndex,
          delta: { type: "thinking_delta", thinking: delta.reasoning_content },
        });
      }

      if (typeof delta.content === "string" && delta.content.length > 0) {
        openChannel({ kind: "text" }, events);
        events.push({
          type: "content_block_delta",
          index: activeBlockIndex,
          delta: { type: "text_delta", text: delta.content },
        });
      }

      for (const call of delta.tool_calls ?? []) {
        const toolIndex = call.index ?? 0;
        const index = openChannel({ kind: "tool", toolIndex }, events, {
          id: call.id,
          name: call.function.name,
        });
        if (call.function.arguments && call.function.arguments.length > 0) {
          events.push({
            type: "content_block_delta",
            index,
            delta: { type: "input_json_delta", partial_json: call.function.arguments },
          });
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
      return events;
    },

    end(): unknown[] {
      const events: unknown[] = [];
      if (!started) start(events);
      closeActive(events);
      events.push({
        type: "message_delta",
        delta: { stop_reason: openAIFinishToAnthropic(finishReason), stop_sequence: null },
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      });
      events.push({ type: "message_stop" });
      return events;
    },
  };
}
