/**
 * Google Gemini (Generative Language) building blocks.
 *
 * Bridges the OpenAI pivot and Gemini's `contents`/`parts` schema: role mapping
 * (`assistant` -> `model`, system -> `systemInstruction`, `tool` -> a user turn
 * carrying `functionResponse`), inline image parts, function calls, and Gemini
 * "thought" parts <-> `reasoning_content`. Shared by the `gemini`, `gemini-cli`,
 * `vertex`, and `antigravity` translators.
 */

import { fromGeminiImage, toGeminiImage, type GeminiImagePart } from "./imageHelper";
import { isRecord } from "./openaiHelper";
import {
  geminiFunctionCallToOpenAI,
  openAIToolCallToGemini,
  toGeminiFunctionResponse,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from "./toolCallHelper";
import type {
  OpenAIFinishReason,
  OpenAIMessage,
  OpenAIResponseMessage,
  OpenAIToolCall,
} from "../types";

// ----------------------------------------------------------------------------
// Gemini schema
// ----------------------------------------------------------------------------

export interface GeminiTextPart {
  text: string;
  /** Marks a reasoning/thinking part rather than visible output. */
  thought?: boolean;
}

export type GeminiPart =
  | GeminiTextPart
  | GeminiImagePart
  | GeminiFunctionCall
  | GeminiFunctionResponse;

export interface GeminiContent {
  role?: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiPayload {
  systemInstruction?: { parts: GeminiTextPart[] };
  contents: GeminiContent[];
}

function isTextPart(part: GeminiPart): part is GeminiTextPart {
  return "text" in part;
}
function isFunctionCallPart(part: GeminiPart): part is GeminiFunctionCall {
  return "functionCall" in part;
}
function isFunctionResponsePart(part: GeminiPart): part is GeminiFunctionResponse {
  return "functionResponse" in part;
}
function isImagePart(part: GeminiPart): part is GeminiImagePart {
  return "inlineData" in part || "fileData" in part;
}

// ----------------------------------------------------------------------------
// OpenAI -> Gemini (request direction)
// ----------------------------------------------------------------------------

function openAIContentToGeminiParts(message: OpenAIMessage): GeminiPart[] {
  const parts: GeminiPart[] = [];
  const content = message.content;
  if (typeof content === "string") {
    if (content.length > 0) parts.push({ text: content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "text") parts.push({ text: part.text });
      else if (part.type === "image_url") parts.push(toGeminiImage(part.image_url.url));
    }
  }
  return parts;
}

/** Convert OpenAI pivot messages into a Gemini payload. */
export function openAIToGemini(messages: OpenAIMessage[]): GeminiPayload {
  const systemParts: GeminiTextPart[] = [];
  const contents: GeminiContent[] = [];

  const pushToUserTurn = (part: GeminiPart): void => {
    const last = contents[contents.length - 1];
    if (last && last.role === "user") last.parts.push(part);
    else contents.push({ role: "user", parts: [part] });
  };

  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      for (const part of openAIContentToGeminiParts(message)) {
        if (isTextPart(part)) systemParts.push(part);
      }
      continue;
    }

    if (message.role === "tool") {
      const content =
        typeof message.content === "string"
          ? message.content
          : openAIContentToGeminiParts(message)
              .filter(isTextPart)
              .map((p) => p.text)
              .join("\n");
      pushToUserTurn(
        toGeminiFunctionResponse(message.name ?? message.tool_call_id ?? "tool", content),
      );
      continue;
    }

    if (message.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (message.reasoning_content) parts.push({ text: message.reasoning_content, thought: true });
      parts.push(...openAIContentToGeminiParts(message));
      for (const call of message.tool_calls ?? []) parts.push(openAIToolCallToGemini(call));
      contents.push({ role: "model", parts });
      continue;
    }

    contents.push({ role: "user", parts: openAIContentToGeminiParts(message) });
  }

  const payload: GeminiPayload = { contents };
  if (systemParts.length > 0) payload.systemInstruction = { parts: systemParts };
  return payload;
}

// ----------------------------------------------------------------------------
// Gemini -> OpenAI (request direction, for Gemini-format clients)
// ----------------------------------------------------------------------------

function systemInstructionToText(system: GeminiPayload["systemInstruction"]): string {
  if (!system) return "";
  return system.parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/** Convert a Gemini payload into OpenAI pivot messages. */
export function geminiToOpenAI(payload: GeminiPayload): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  const systemText = systemInstructionToText(payload.systemInstruction);
  if (systemText.length > 0) out.push({ role: "system", content: systemText });

  for (const content of payload.contents) {
    const role = content.role ?? "user";
    if (role === "model") {
      out.push({ role: "assistant", ...geminiPartsToResponseFields(content.parts) });
      continue;
    }

    // user turn: may contain functionResponse parts -> OpenAI tool messages
    const textChunks: string[] = [];
    const imageParts: Exclude<OpenAIMessage["content"], string | null> = [];
    for (const part of content.parts) {
      if (isFunctionResponsePart(part)) {
        out.push({
          role: "tool",
          name: part.functionResponse.name,
          content: JSON.stringify(part.functionResponse.response),
        });
      } else if (isTextPart(part)) {
        textChunks.push(part.text);
      } else if (isImagePart(part)) {
        imageParts.push({ type: "image_url", image_url: { url: fromGeminiImage(part) } });
      }
    }
    if (imageParts.length > 0) {
      if (textChunks.length > 0) imageParts.unshift({ type: "text", text: textChunks.join("\n") });
      out.push({ role: "user", content: imageParts });
    } else if (textChunks.length > 0) {
      out.push({ role: "user", content: textChunks.join("\n") });
    }
  }

  return out;
}

// ----------------------------------------------------------------------------
// Response assembly
// ----------------------------------------------------------------------------

function geminiPartsToResponseFields(parts: GeminiPart[]): {
  content: string | null;
  reasoning_content?: string;
  tool_calls?: OpenAIToolCall[];
} {
  let text = "";
  let thinking = "";
  const toolCalls: OpenAIToolCall[] = [];
  for (const part of parts) {
    if (isFunctionCallPart(part)) toolCalls.push(geminiFunctionCallToOpenAI(part));
    else if (isTextPart(part)) {
      if (part.thought) thinking += part.text;
      else text += part.text;
    }
  }
  return {
    content: text.length > 0 ? text : null,
    ...(thinking.length > 0 ? { reasoning_content: thinking } : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

/** Assemble Gemini candidate parts into an OpenAI assistant message. */
export function geminiPartsToResponseMessage(parts: GeminiPart[]): OpenAIResponseMessage {
  const fields = geminiPartsToResponseFields(parts);
  const message: OpenAIResponseMessage = { role: "assistant", content: fields.content };
  if (fields.reasoning_content) message.reasoning_content = fields.reasoning_content;
  if (fields.tool_calls) message.tool_calls = fields.tool_calls;
  return message;
}

/** Convert an OpenAI assistant message into Gemini parts. */
export function responseMessageToGeminiParts(message: OpenAIResponseMessage): GeminiPart[] {
  const parts: GeminiPart[] = [];
  if (message.reasoning_content) parts.push({ text: message.reasoning_content, thought: true });
  if (typeof message.content === "string" && message.content.length > 0) {
    parts.push({ text: message.content });
  }
  for (const call of message.tool_calls ?? []) parts.push(openAIToolCallToGemini(call));
  return parts;
}

// ----------------------------------------------------------------------------
// Finish reason mapping
// ----------------------------------------------------------------------------

export function geminiFinishToOpenAI(reason: string | null | undefined): OpenAIFinishReason {
  switch (reason) {
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
      return "content_filter";
    case "STOP":
      return "stop";
    case undefined:
    case null:
      return null;
    default:
      return "stop";
  }
}

export function openAIFinishToGemini(finish: OpenAIFinishReason): string {
  switch (finish) {
    case "length":
      return "MAX_TOKENS";
    case "content_filter":
      return "SAFETY";
    default:
      return "STOP";
  }
}

export { isTextPart, isFunctionCallPart, isFunctionResponsePart, isImagePart };
