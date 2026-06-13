/**
 * Request translator: OpenAI Chat Completions pivot -> OpenAI Responses API.
 *
 * Pairs with `response/openai-responses.ts`. Used by Codex and any provider on
 * the `/responses` surface. The Responses API replaces `messages` with a typed
 * `input` item list, lifts the system prompt to `instructions`, flattens tool
 * definitions, and renames `max_tokens` -> `max_output_tokens`.
 */

import { parseImageUrl } from "../helpers/imageHelper";
import { contentToText, isRecord } from "../helpers/openaiHelper";
import { readMaxTokens } from "../helpers/maxTokensHelper";
import type { OpenAIChatRequest, OpenAIContentPart, OpenAIMessage, OpenAITool } from "../types";

type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "output_text"; text: string };

interface ResponsesMessageItem {
  type: "message";
  role: "user" | "assistant" | "system";
  content: ResponsesContentPart[];
}

interface ResponsesFunctionCallItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

interface ResponsesFunctionOutputItem {
  type: "function_call_output";
  call_id: string;
  output: string;
}

type ResponsesInputItem =
  | ResponsesMessageItem
  | ResponsesFunctionCallItem
  | ResponsesFunctionOutputItem;

export interface ResponsesTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ResponsesRequest {
  model: string;
  input: ResponsesInputItem[];
  instructions?: string;
  tools?: ResponsesTool[];
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  reasoning?: { effort: string };
}

function userContentParts(message: OpenAIMessage): ResponsesContentPart[] {
  const parts: ResponsesContentPart[] = [];
  if (typeof message.content === "string") {
    if (message.content.length > 0) parts.push({ type: "input_text", text: message.content });
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text") parts.push({ type: "input_text", text: part.text });
      else if (part.type === "image_url") {
        const parsed = parseImageUrl(part.image_url.url);
        parts.push({
          type: "input_image",
          image_url: parsed.isBase64
            ? `data:${parsed.mediaType};base64,${parsed.data}`
            : parsed.url,
        });
      }
    }
  }
  return parts;
}

export function requestFromOpenAI(req: OpenAIChatRequest): ResponsesRequest {
  const instructions: string[] = [];
  const input: ResponsesInputItem[] = [];

  for (const message of req.messages) {
    if (message.role === "system" || message.role === "developer") {
      instructions.push(contentToText(message.content));
      continue;
    }
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id ?? "",
        output: contentToText(message.content),
      });
      continue;
    }
    if (message.role === "assistant") {
      for (const call of message.tool_calls ?? []) {
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
      const text = contentToText(message.content);
      if (text.length > 0) {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        });
      }
      continue;
    }
    input.push({ type: "message", role: "user", content: userContentParts(message) });
  }

  const out: ResponsesRequest = { model: req.model, input };
  const instruction = instructions.filter(Boolean).join("\n\n");
  if (instruction.length > 0) out.instructions = instruction;
  if (req.tools && req.tools.length > 0) {
    out.tools = req.tools.map((tool) => ({
      type: "function",
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
    }));
  }
  const maxTokens = readMaxTokens(req);
  if (maxTokens !== undefined) out.max_output_tokens = maxTokens;
  if (typeof req.temperature === "number") out.temperature = req.temperature;
  if (typeof req.top_p === "number") out.top_p = req.top_p;
  if (typeof req.stream === "boolean") out.stream = req.stream;
  if (req.reasoning_effort) out.reasoning = { effort: req.reasoning_effort };

  return out;
}

// ----------------------------------------------------------------------------
// Responses API request -> OpenAI pivot (client-facing `/v1/responses`)
// ----------------------------------------------------------------------------

function responsesContentToPivot(content: unknown): string | OpenAIContentPart[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: OpenAIContentPart[] = [];
  for (const part of content) {
    if (!isRecord(part)) continue;
    if (
      (part.type === "input_text" || part.type === "output_text") &&
      typeof part.text === "string"
    ) {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "input_image" && typeof part.image_url === "string") {
      parts.push({ type: "image_url", image_url: { url: part.image_url } });
    }
  }
  if (parts.length === 1 && parts[0]?.type === "text") return parts[0].text;
  return parts;
}

/** Normalize a Responses API request body into the OpenAI Chat Completions pivot. */
export function requestToOpenAI(body: unknown): OpenAIChatRequest {
  if (!isRecord(body)) return { model: "", messages: [] };

  const messages: OpenAIMessage[] = [];
  const instructions = typeof body.instructions === "string" ? body.instructions : "";
  if (instructions.length > 0) messages.push({ role: "system", content: instructions });

  if (typeof body.input === "string") {
    messages.push({ role: "user", content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (!isRecord(item)) continue;
      if (item.type === "message") {
        const role =
          item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user";
        messages.push({ role, content: responsesContentToPivot(item.content) });
      } else if (item.type === "function_call") {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: typeof item.call_id === "string" ? item.call_id : "",
              type: "function",
              function: {
                name: typeof item.name === "string" ? item.name : "",
                arguments: typeof item.arguments === "string" ? item.arguments : "",
              },
            },
          ],
        });
      } else if (item.type === "function_call_output") {
        messages.push({
          role: "tool",
          tool_call_id: typeof item.call_id === "string" ? item.call_id : "",
          content:
            typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? ""),
        });
      }
    }
  }

  const request: OpenAIChatRequest = {
    model: typeof body.model === "string" ? body.model : "",
    messages,
  };

  if (Array.isArray(body.tools)) {
    const tools: OpenAITool[] = [];
    for (const tool of body.tools) {
      if (isRecord(tool) && tool.type === "function" && typeof tool.name === "string") {
        tools.push({
          type: "function",
          function: {
            name: tool.name,
            ...(typeof tool.description === "string" ? { description: tool.description } : {}),
            ...(isRecord(tool.parameters) ? { parameters: tool.parameters } : {}),
          },
        });
      }
    }
    if (tools.length > 0) request.tools = tools;
  }

  if (typeof body.max_output_tokens === "number")
    request.max_completion_tokens = body.max_output_tokens;
  if (typeof body.temperature === "number") request.temperature = body.temperature;
  if (typeof body.top_p === "number") request.top_p = body.top_p;
  if (typeof body.stream === "boolean") request.stream = body.stream;
  if (isRecord(body.reasoning) && typeof body.reasoning.effort === "string") {
    request.reasoning_effort = body.reasoning.effort;
  }

  return request;
}
