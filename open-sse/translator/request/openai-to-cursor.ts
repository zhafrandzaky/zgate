/**
 * Request translator: OpenAI pivot -> Cursor chat protocol.
 *
 * Pairs with `response/cursor-to-openai.ts`. Cursor's wire format is proprietary
 * protobuf over Connect; the `CursorExecutor` (TASK-006) owns the protobuf
 * framing and `connect-protocol-version` headers. This translator emits the
 * normalized JSON message bundle the executor then encodes, so the translation
 * layer stays protocol-agnostic.
 */

import { contentToText } from "../helpers/openaiHelper";
import { parseArguments } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest, OpenAIMessage } from "../types";

export interface CursorBubble {
  type: "user" | "assistant" | "system" | "tool";
  text: string;
  toolCalls?: { id: string; name: string; input: Record<string, unknown> }[];
  toolCallId?: string;
}

export interface CursorRequest {
  modelName: string;
  conversation: CursorBubble[];
  tools?: { name: string; description?: string; parameters?: Record<string, unknown> }[];
  stream: boolean;
}

function toBubble(message: OpenAIMessage): CursorBubble {
  const bubble: CursorBubble = {
    type: message.role === "developer" ? "system" : (message.role as CursorBubble["type"]),
    text: contentToText(message.content),
  };
  if (message.tool_calls && message.tool_calls.length > 0) {
    bubble.toolCalls = message.tool_calls.map((call) => ({
      id: call.id,
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    }));
  }
  if (message.tool_call_id) bubble.toolCallId = message.tool_call_id;
  return bubble;
}

export function requestFromOpenAI(req: OpenAIChatRequest): CursorRequest {
  const out: CursorRequest = {
    modelName: req.model,
    conversation: req.messages.map(toBubble),
    stream: req.stream ?? false,
  };
  if (req.tools && req.tools.length > 0) {
    out.tools = req.tools.map((tool) => ({
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
    }));
  }
  return out;
}
