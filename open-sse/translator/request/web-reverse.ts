/**
 * Request translators: OpenAI pivot -> web-reverse chat payloads
 * (grok.com and perplexity.ai).
 *
 * These are **best-effort stubs**. grok-web and perplexity-web are private,
 * cookie-authenticated web endpoints with no official API specification, so the
 * payloads here are reverse-engineered to the minimum each surface needs:
 * a single prompt string built from the conversation plus the model id. The
 * cookie auth, base URL, and HTTP framing are the executor's concern
 * (`webReverse.ts`, TASK-006). Mark for refinement when the live protocols are
 * captured.
 *
 * grok-web  : POST https://grok.com/rest/app-chat/conversations/new
 * perplexity: POST https://www.perplexity.ai/rest/sse/perplexity_ask
 */

import { contentToText } from "../helpers/openaiHelper";
import type { OpenAIChatRequest, OpenAIMessage } from "../types";

/** Flatten a multi-turn conversation into a single role-prefixed prompt. */
function flattenConversation(messages: OpenAIMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = contentToText(message.content);
    if (!text) continue;
    if (message.role === "system" || message.role === "developer") lines.push(text);
    else if (message.role === "assistant") lines.push(`Assistant: ${text}`);
    else if (message.role === "tool") lines.push(`Tool result: ${text}`);
    else lines.push(`User: ${text}`);
  }
  return lines.join("\n\n");
}

export interface GrokWebRequest {
  temporary: boolean;
  modelName: string;
  message: string;
  stream: boolean;
}

export function grokRequestFromOpenAI(req: OpenAIChatRequest): GrokWebRequest {
  return {
    temporary: true,
    modelName: req.model,
    message: flattenConversation(req.messages),
    stream: req.stream ?? true,
  };
}

export interface PerplexityWebRequest {
  query_str: string;
  params: { stream: boolean };
}

export function perplexityRequestFromOpenAI(req: OpenAIChatRequest): PerplexityWebRequest {
  return {
    query_str: flattenConversation(req.messages),
    params: { stream: req.stream ?? true },
  };
}
