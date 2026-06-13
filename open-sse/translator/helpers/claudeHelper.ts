/**
 * Anthropic Messages building blocks.
 *
 * Bridges the OpenAI pivot and the Anthropic Messages schema in both directions:
 * system extraction, role mapping, tool_use/tool_result placement (Anthropic
 * carries tool results inside a *user* turn), and — critically — DeepSeek-style
 * `reasoning_content` <-> Anthropic `thinking` blocks, kept separate from the
 * visible answer at all times (TASK-005 notes).
 */

import {
  fromAnthropicImage,
  toAnthropicImage,
  type AnthropicImageBlock,
  type AnthropicImageSource,
} from "./imageHelper";
import { isRecord } from "./openaiHelper";
import {
  anthropicToolUseToOpenAI,
  openAIToolCallToAnthropic,
  toAnthropicToolResult,
  type AnthropicToolResult,
  type AnthropicToolUse,
} from "./toolCallHelper";
import type {
  OpenAIFinishReason,
  OpenAIMessage,
  OpenAIResponseMessage,
  OpenAIToolCall,
} from "../types";

// ----------------------------------------------------------------------------
// Anthropic schema
// ----------------------------------------------------------------------------

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicImageBlock
  | AnthropicToolUse
  | AnthropicToolResult;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

export interface AnthropicMessagesPayload {
  system?: string;
  messages: AnthropicMessage[];
}

// ----------------------------------------------------------------------------
// OpenAI -> Anthropic (request direction)
// ----------------------------------------------------------------------------

function openAIContentToAnthropicBlocks(message: OpenAIMessage): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [];
  const content = message.content;
  if (typeof content === "string") {
    if (content.length > 0) blocks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "text") {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        blocks.push(toAnthropicImage(part.image_url.url));
      }
    }
  }
  return blocks;
}

/**
 * Convert OpenAI pivot messages into an Anthropic payload. System turns are
 * concatenated into the top-level `system`. Tool results (role:"tool") fold into
 * a user turn, merging with an adjacent user turn when possible.
 */
export function openAIToAnthropic(messages: OpenAIMessage[]): AnthropicMessagesPayload {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];

  const pushToUserTurn = (block: AnthropicContentBlock): void => {
    const last = out[out.length - 1];
    if (last && last.role === "user") {
      last.content.push(block);
    } else {
      out.push({ role: "user", content: [block] });
    }
  };

  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      const text =
        typeof message.content === "string"
          ? message.content
          : openAIContentToAnthropicBlocks(message)
              .filter((b): b is AnthropicTextBlock => b.type === "text")
              .map((b) => b.text)
              .join("\n");
      if (text.length > 0) systemParts.push(text);
      continue;
    }

    if (message.role === "tool") {
      const result = toAnthropicToolResult(
        message.tool_call_id ?? "",
        typeof message.content === "string"
          ? message.content
          : openAIContentToAnthropicBlocks(message)
              .filter((b): b is AnthropicTextBlock => b.type === "text")
              .map((b) => b.text)
              .join("\n"),
      );
      pushToUserTurn(result);
      continue;
    }

    if (message.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (message.reasoning_content) {
        blocks.push({ type: "thinking", thinking: message.reasoning_content });
      }
      blocks.push(...openAIContentToAnthropicBlocks(message));
      for (const call of message.tool_calls ?? []) {
        blocks.push(openAIToolCallToAnthropic(call));
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    // user
    out.push({ role: "user", content: openAIContentToAnthropicBlocks(message) });
  }

  const payload: AnthropicMessagesPayload = { messages: out };
  if (systemParts.length > 0) payload.system = systemParts.join("\n\n");
  return payload;
}

// ----------------------------------------------------------------------------
// Anthropic -> OpenAI (request direction, for Claude-format clients)
// ----------------------------------------------------------------------------

function systemToText(system: unknown): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system
      .map((block) => (isRecord(block) && typeof block.text === "string" ? block.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Convert an Anthropic payload (system + messages) into OpenAI pivot messages. */
export function anthropicToOpenAI(payload: AnthropicMessagesPayload): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  const systemText = systemToText(payload.system);
  if (systemText.length > 0) out.push({ role: "system", content: systemText });

  for (const message of payload.messages) {
    if (message.role === "user") {
      // Split tool_result blocks into OpenAI tool messages; keep the rest as user.
      const userParts: OpenAIMessage["content"] = [];
      const textChunks: string[] = [];
      for (const block of message.content) {
        if (block.type === "tool_result") {
          out.push({ role: "tool", tool_call_id: block.tool_use_id, content: block.content });
        } else if (block.type === "text") {
          textChunks.push(block.text);
        } else if (block.type === "image") {
          (userParts as Exclude<OpenAIMessage["content"], string | null>).push({
            type: "image_url",
            image_url: { url: fromAnthropicImage(block.source) },
          });
        }
      }
      const parts = userParts as Exclude<OpenAIMessage["content"], string | null>;
      if (parts.length > 0) {
        if (textChunks.length > 0) parts.unshift({ type: "text", text: textChunks.join("\n") });
        out.push({ role: "user", content: parts });
      } else if (textChunks.length > 0) {
        out.push({ role: "user", content: textChunks.join("\n") });
      }
      continue;
    }

    // assistant
    const assistant = anthropicContentToResponseMessage(message.content);
    out.push({
      role: "assistant",
      content: assistant.content,
      ...(assistant.reasoning_content ? { reasoning_content: assistant.reasoning_content } : {}),
      ...(assistant.tool_calls ? { tool_calls: assistant.tool_calls } : {}),
    });
  }

  return out;
}

// ----------------------------------------------------------------------------
// Response assembly
// ----------------------------------------------------------------------------

/** Assemble Anthropic response content blocks into an OpenAI assistant message. */
export function anthropicContentToResponseMessage(
  blocks: AnthropicContentBlock[],
): OpenAIResponseMessage {
  let text = "";
  let thinking = "";
  const toolCalls: OpenAIToolCall[] = [];

  for (const block of blocks) {
    if (block.type === "text") text += block.text;
    else if (block.type === "thinking") thinking += block.thinking;
    else if (block.type === "tool_use") toolCalls.push(anthropicToolUseToOpenAI(block));
  }

  const message: OpenAIResponseMessage = {
    role: "assistant",
    content: text.length > 0 ? text : null,
  };
  if (thinking.length > 0) message.reasoning_content = thinking;
  if (toolCalls.length > 0) message.tool_calls = toolCalls;
  return message;
}

/** Convert an OpenAI assistant message into Anthropic response content blocks. */
export function responseMessageToAnthropicContent(
  message: OpenAIResponseMessage,
): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [];
  if (message.reasoning_content) {
    blocks.push({ type: "thinking", thinking: message.reasoning_content });
  }
  if (typeof message.content === "string" && message.content.length > 0) {
    blocks.push({ type: "text", text: message.content });
  }
  for (const call of message.tool_calls ?? []) {
    blocks.push(openAIToolCallToAnthropic(call));
  }
  return blocks;
}

// ----------------------------------------------------------------------------
// Finish reason mapping
// ----------------------------------------------------------------------------

export type AnthropicStopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;

export function anthropicStopToOpenAI(stop: AnthropicStopReason): OpenAIFinishReason {
  switch (stop) {
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "end_turn":
    case "stop_sequence":
      return "stop";
    default:
      return null;
  }
}

export function openAIFinishToAnthropic(finish: OpenAIFinishReason): AnthropicStopReason {
  switch (finish) {
    case "length":
      return "max_tokens";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "stop":
      return "end_turn";
    default:
      return null;
  }
}

export type { AnthropicImageSource };
