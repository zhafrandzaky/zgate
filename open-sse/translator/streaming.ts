/**
 * Streaming primitives shared by every response translator.
 *
 * Provides SSE line parsing, a deterministic completion-id/timestamp source for
 * stable chunk identity, and a reducer that folds a sequence of OpenAI stream
 * chunks back into a single non-streaming response (used by the SSE-to-JSON
 * handler in TASK-007 and by round-trip tests here).
 */

import type {
  OpenAIChatResponse,
  OpenAIChoice,
  OpenAIFinishReason,
  OpenAIResponseMessage,
  OpenAIStreamChunk,
  OpenAIToolCall,
  OpenAIUsage,
  ResponseContext,
} from "./types";

let counter = 0;

/** Monotonic, collision-resistant completion id (`chatcmpl-...`). */
export function generateId(prefix = "chatcmpl"): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Resolve the id/created/model triple for a translated response. */
export function resolveContext(ctx: ResponseContext): {
  id: string;
  created: number;
  model: string;
} {
  return {
    id: ctx.id ?? generateId(),
    created: ctx.created ?? Math.floor(Date.now() / 1000),
    model: ctx.model,
  };
}

/**
 * Parse a raw SSE payload into a list of `data:` JSON events.
 *
 * Tolerates multi-line events, comments, the `[DONE]` sentinel, and partial
 * buffers. Lines that are not valid JSON are skipped rather than thrown, since a
 * dropped malformed chunk must never abort an in-flight stream.
 */
export function parseSseEvents(raw: string): unknown[] {
  const events: unknown[] = [];
  for (const block of raw.split(/\n\n/)) {
    const dataLines: string[] = [];
    for (const line of block.split(/\n/)) {
      const trimmed = line.replace(/\r$/, "");
      if (trimmed.startsWith("data:")) {
        dataLines.push(trimmed.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) continue;
    const payload = dataLines.join("\n");
    if (payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      // Skip malformed event; resilience over strictness on the stream path.
    }
  }
  return events;
}

/** Serialize an object as a single SSE `data:` frame. */
export function toSseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** The terminal SSE frame for OpenAI-compatible streams. */
export const SSE_DONE = "data: [DONE]\n\n";

type ToolAccumulator = {
  id: string;
  name: string;
  args: string;
};

/**
 * Fold a stream of OpenAI chunks into a single Chat Completion response.
 *
 * Content, reasoning content, and tool-call argument fragments are concatenated
 * by index so the assembled message is byte-identical to what a non-streaming
 * call would have returned.
 */
export function assembleChunks(
  chunks: OpenAIStreamChunk[],
  ctx: ResponseContext,
): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  let content = "";
  let reasoning = "";
  let finishReason: OpenAIFinishReason = null;
  let usage: OpenAIUsage | undefined;
  const toolsByIndex = new Map<number, ToolAccumulator>();

  for (const chunk of chunks) {
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;

    const delta = choice.delta;
    if (typeof delta.content === "string") content += delta.content;
    if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;

    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0;
      const existing = toolsByIndex.get(index) ?? { id: "", name: "", args: "" };
      toolsByIndex.set(index, {
        id: call.id || existing.id,
        name: call.function.name || existing.name,
        args: existing.args + (call.function.arguments ?? ""),
      });
    }
  }

  const toolCalls: OpenAIToolCall[] = [...toolsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, acc]) => ({
      id: acc.id || generateId("call"),
      type: "function" as const,
      function: { name: acc.name, arguments: acc.args },
    }));

  const message: OpenAIResponseMessage = {
    role: "assistant",
    content: content.length > 0 ? content : null,
  };
  if (reasoning.length > 0) message.reasoning_content = reasoning;
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  const choice: OpenAIChoice = {
    index: 0,
    message,
    finish_reason: finishReason ?? (toolCalls.length > 0 ? "tool_calls" : "stop"),
  };

  const response: OpenAIChatResponse = {
    id: resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [choice],
  };
  if (usage) response.usage = usage;
  return response;
}
