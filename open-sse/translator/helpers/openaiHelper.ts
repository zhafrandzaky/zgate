/**
 * OpenAI pivot helpers: validation/normalization of an inbound Chat Completions
 * request and small content/response builders reused by every translator.
 *
 * Normalization is forgiving on input (clients send loosely-typed JSON) but
 * produces a strict `OpenAIChatRequest`, so downstream translators can rely on
 * shape invariants without re-checking them.
 */

import { generateId } from "../streaming";
import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIContent,
  OpenAIContentPart,
  OpenAIMessage,
  OpenAIResponseMessage,
  OpenAIRole,
  OpenAITool,
  OpenAIToolCall,
  ResponseContext,
} from "../types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const VALID_ROLES: ReadonlySet<string> = new Set([
  "system",
  "developer",
  "user",
  "assistant",
  "tool",
]);

function normalizeRole(value: unknown): OpenAIRole {
  const role = asString(value);
  return role && VALID_ROLES.has(role) ? (role as OpenAIRole) : "user";
}

function normalizeContentPart(raw: unknown): OpenAIContentPart | null {
  if (!isRecord(raw)) return null;
  const type = asString(raw.type);
  if (type === "text") {
    return { type: "text", text: asString(raw.text) ?? "" };
  }
  if (type === "image_url" && isRecord(raw.image_url)) {
    const url = asString(raw.image_url.url);
    if (!url) return null;
    const detail = asString(raw.image_url.detail);
    return {
      type: "image_url",
      image_url:
        detail === "low" || detail === "high" || detail === "auto" ? { url, detail } : { url },
    };
  }
  if (type === "input_audio" && isRecord(raw.input_audio)) {
    const data = asString(raw.input_audio.data) ?? "";
    const format = asString(raw.input_audio.format) ?? "wav";
    return { type: "input_audio", input_audio: { data, format } };
  }
  return null;
}

function normalizeContent(raw: unknown): OpenAIContent {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const parts = raw
      .map(normalizeContentPart)
      .filter((part): part is OpenAIContentPart => part !== null);
    return parts;
  }
  return null;
}

function normalizeToolCalls(raw: unknown): OpenAIToolCall[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const calls: OpenAIToolCall[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !isRecord(entry.function)) continue;
    calls.push({
      id: asString(entry.id) ?? generateId("call"),
      type: "function",
      function: {
        name: asString(entry.function.name) ?? "",
        arguments: asString(entry.function.arguments) ?? "",
      },
    });
  }
  return calls.length > 0 ? calls : undefined;
}

function normalizeMessage(raw: unknown): OpenAIMessage {
  if (!isRecord(raw)) return { role: "user", content: null };
  const message: OpenAIMessage = {
    role: normalizeRole(raw.role),
    content: normalizeContent(raw.content),
  };
  const name = asString(raw.name);
  if (name) message.name = name;
  const toolCallId = asString(raw.tool_call_id);
  if (toolCallId) message.tool_call_id = toolCallId;
  const toolCalls = normalizeToolCalls(raw.tool_calls);
  if (toolCalls) message.tool_calls = toolCalls;
  const reasoning = asString(raw.reasoning_content);
  if (reasoning) message.reasoning_content = reasoning;
  return message;
}

function normalizeTools(raw: unknown): OpenAITool[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tools: OpenAITool[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !isRecord(entry.function)) continue;
    const name = asString(entry.function.name);
    if (!name) continue;
    const tool: OpenAITool = { type: "function", function: { name } };
    const description = asString(entry.function.description);
    if (description) tool.function.description = description;
    if (isRecord(entry.function.parameters)) {
      tool.function.parameters = entry.function.parameters;
    }
    tools.push(tool);
  }
  return tools.length > 0 ? tools : undefined;
}

/**
 * Coerce an untrusted request body into a strict OpenAI pivot request. Unknown
 * scalar generation params are passed through; messages/tools are validated.
 */
export function normalizeRequest(raw: unknown): OpenAIChatRequest {
  if (!isRecord(raw)) {
    return { model: "", messages: [] };
  }
  const messagesRaw = Array.isArray(raw.messages) ? raw.messages : [];
  const request: OpenAIChatRequest = {
    model: asString(raw.model) ?? "",
    messages: messagesRaw.map(normalizeMessage),
  };

  const tools = normalizeTools(raw.tools);
  if (tools) request.tools = tools;
  if (raw.tool_choice !== undefined) {
    request.tool_choice = raw.tool_choice as OpenAIChatRequest["tool_choice"];
  }

  const passNumbers: ReadonlyArray<keyof OpenAIChatRequest> = [
    "max_tokens",
    "max_completion_tokens",
    "temperature",
    "top_p",
    "top_k",
    "n",
    "presence_penalty",
    "frequency_penalty",
    "seed",
  ];
  const mutable = request as unknown as Record<string, unknown>;
  for (const key of passNumbers) {
    const value = asNumber(raw[key]);
    if (value !== undefined) mutable[key] = value;
  }

  if (typeof raw.stream === "boolean") request.stream = raw.stream;
  if (typeof raw.stop === "string" || Array.isArray(raw.stop)) {
    request.stop = raw.stop as string | string[];
  }
  const reasoningEffort = asString(raw.reasoning_effort);
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;
  if (isRecord(raw.thinking)) {
    const type = asString(raw.thinking.type);
    if (type === "enabled" || type === "disabled") request.thinking = { type };
  }
  if (isRecord(raw.response_format)) request.response_format = raw.response_format;
  if (isRecord(raw.metadata)) request.metadata = raw.metadata;

  return request;
}

/**
 * Strip the pivot-only `reasoning_content` field from messages before sending to
 * an OpenAI-wire provider. DeepSeek returns a 400 when `reasoning_content`
 * appears in input messages (https://api-docs.deepseek.com/guides/reasoning_model:
 * "If the reasoning_content field is included in the sequence of input messages,
 * the API will return a 400 error"). Real OpenAI ignores unknown fields, so this
 * is safe for every OpenAI-format provider. Returns the SAME request reference
 * when there is nothing to strip, so identity passthrough is preserved.
 */
export function stripReasoningContent(req: OpenAIChatRequest): OpenAIChatRequest {
  const hasReasoning = req.messages.some(
    (m) => m.reasoning_content !== undefined && m.reasoning_content !== null,
  );
  if (!hasReasoning) return req;
  return {
    ...req,
    messages: req.messages.map((m) => {
      if (m.reasoning_content == null) return m;
      const { reasoning_content: _omit, ...rest } = m;
      return rest;
    }),
  };
}

/** Flatten message content to plain text (used for systems that take strings). */
export function contentToText(content: OpenAIContent): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/** Build a complete non-streaming response from an assembled assistant message. */
export function buildChatResponse(
  message: OpenAIResponseMessage,
  finishReason: OpenAIChatResponse["choices"][number]["finish_reason"],
  ctx: ResponseContext,
): OpenAIChatResponse {
  return {
    id: ctx.id ?? generateId(),
    object: "chat.completion",
    created: ctx.created ?? Math.floor(Date.now() / 1000),
    model: ctx.model,
    choices: [{ index: 0, message, finish_reason: finishReason }],
  };
}
