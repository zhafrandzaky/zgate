/**
 * Request translator: Anthropic Messages (client) -> OpenAI pivot.
 *
 * Inbound side for Claude-format clients hitting ZGate's `/v1/messages`. Pairs
 * with `response/openai-to-claude.ts`, which re-encodes the pivot response back
 * into Anthropic Messages for the client.
 */

import {
  anthropicToOpenAI,
  type AnthropicContentBlock,
  type AnthropicMessage,
  type AnthropicMessagesPayload,
} from "../helpers/claudeHelper";
import { isRecord } from "../helpers/openaiHelper";
import { anthropicToolsToOpenAI, type AnthropicToolDef } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest, OpenAIToolChoice } from "../types";

function coerceBlocks(content: unknown): AnthropicContentBlock[] {
  if (typeof content === "string") {
    return content.length > 0 ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const blocks: AnthropicContentBlock[] = [];
  for (const raw of content) {
    if (!isRecord(raw)) continue;
    // The Anthropic block shapes already match our internal union; pass through
    // the recognized ones and ignore anything unknown.
    if (
      raw.type === "text" ||
      raw.type === "thinking" ||
      raw.type === "image" ||
      raw.type === "tool_use" ||
      raw.type === "tool_result"
    ) {
      blocks.push(raw as unknown as AnthropicContentBlock);
    }
  }
  return blocks;
}

function coercePayload(raw: Record<string, unknown>): AnthropicMessagesPayload {
  const messages: AnthropicMessage[] = [];
  if (Array.isArray(raw.messages)) {
    for (const entry of raw.messages) {
      if (!isRecord(entry)) continue;
      const role = entry.role === "assistant" ? "assistant" : "user";
      messages.push({ role, content: coerceBlocks(entry.content) });
    }
  }
  const payload: AnthropicMessagesPayload = { messages };
  if (typeof raw.system === "string" || Array.isArray(raw.system)) {
    // claudeHelper.anthropicToOpenAI accepts string|block[] for system.
    payload.system = raw.system as unknown as string;
  }
  return payload;
}

function mapToolChoice(raw: unknown): OpenAIToolChoice | undefined {
  if (!isRecord(raw)) return undefined;
  switch (raw.type) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    case "none":
      return "none";
    case "tool":
      return typeof raw.name === "string"
        ? { type: "function", function: { name: raw.name } }
        : undefined;
    default:
      return undefined;
  }
}

export function requestToOpenAI(body: unknown): OpenAIChatRequest {
  if (!isRecord(body)) return { model: "", messages: [] };

  const payload = coercePayload(body);
  const request: OpenAIChatRequest = {
    model: typeof body.model === "string" ? body.model : "",
    messages: anthropicToOpenAI(payload),
  };

  if (typeof body.max_tokens === "number") request.max_tokens = body.max_tokens;
  if (typeof body.temperature === "number") request.temperature = body.temperature;
  if (typeof body.top_p === "number") request.top_p = body.top_p;
  if (typeof body.top_k === "number") request.top_k = body.top_k;
  if (typeof body.stream === "boolean") request.stream = body.stream;
  if (Array.isArray(body.stop_sequences)) {
    request.stop = body.stop_sequences.filter((s): s is string => typeof s === "string");
  }
  if (Array.isArray(body.tools)) {
    const tools = anthropicToolsToOpenAI(body.tools as unknown as AnthropicToolDef[]);
    if (tools.length > 0) request.tools = tools;
  }
  const toolChoice = mapToolChoice(body.tool_choice);
  if (toolChoice) request.tool_choice = toolChoice;
  if (isRecord(body.thinking) && body.thinking.type === "enabled") {
    request.thinking = { type: "enabled" };
  }

  return request;
}
