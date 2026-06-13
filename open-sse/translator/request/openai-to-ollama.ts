/**
 * Request translator: OpenAI pivot -> Ollama native chat API (`/api/chat`).
 *
 * Pairs with `response/ollama-to-openai.ts`. Ollama's schema is close to OpenAI
 * but carries images as a bare base64 array on the message and tool-call
 * arguments as objects rather than JSON strings.
 */

import { parseImageUrl } from "../helpers/imageHelper";
import { readMaxTokens } from "../helpers/maxTokensHelper";
import { parseArguments } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest, OpenAIMessage, OpenAITool } from "../types";

export interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

export interface OllamaMessage {
  role: string;
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
}

export interface OllamaOptions {
  num_predict?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
}

export interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  tools?: OllamaTool[];
  options?: OllamaOptions;
}

export interface OllamaTool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

function toOllamaMessage(message: OpenAIMessage): OllamaMessage {
  const out: OllamaMessage = { role: message.role, content: "" };
  const images: string[] = [];

  if (typeof message.content === "string") {
    out.content = message.content;
  } else if (Array.isArray(message.content)) {
    const textChunks: string[] = [];
    for (const part of message.content) {
      if (part.type === "text") textChunks.push(part.text);
      else if (part.type === "image_url") {
        const parsed = parseImageUrl(part.image_url.url);
        if (parsed.isBase64) images.push(parsed.data);
      }
    }
    out.content = textChunks.join("\n");
  }

  if (images.length > 0) out.images = images;
  if (message.tool_calls && message.tool_calls.length > 0) {
    out.tool_calls = message.tool_calls.map((call) => ({
      function: { name: call.function.name, arguments: parseArguments(call.function.arguments) },
    }));
  }
  return out;
}

function toOllamaTools(tools: OpenAITool[]): OllamaTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
    },
  }));
}

export function requestFromOpenAI(req: OpenAIChatRequest): OllamaRequest {
  const out: OllamaRequest = {
    model: req.model,
    messages: req.messages.map(toOllamaMessage),
    stream: req.stream ?? false,
  };
  if (req.tools && req.tools.length > 0) out.tools = toOllamaTools(req.tools);

  const options: OllamaOptions = {};
  const maxTokens = readMaxTokens(req);
  if (maxTokens !== undefined) options.num_predict = maxTokens;
  if (typeof req.temperature === "number") options.temperature = req.temperature;
  if (typeof req.top_p === "number") options.top_p = req.top_p;
  if (typeof req.top_k === "number") options.top_k = req.top_k;
  if (typeof req.stop === "string") options.stop = [req.stop];
  else if (Array.isArray(req.stop)) options.stop = req.stop;
  if (Object.keys(options).length > 0) out.options = options;

  return out;
}
