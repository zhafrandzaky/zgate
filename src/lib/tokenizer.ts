import { countTokens as countClaudeTokens } from "@anthropic-ai/tokenizer";
import { encode } from "gpt-tokenizer";

/**
 * Token counting wrapper. Picks the correct tokenizer per model:
 *   - Claude models (`claude-*`) → @anthropic-ai/tokenizer (exact)
 *   - everything else            → gpt-tokenizer (cl100k/o200k family)
 *
 * Used by /v1/messages/count_tokens (TASK-008), the `long_context` capability
 * check (TASK-007), and cost-budget estimation (TASK-009).
 */

type MessageContentPart = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

export type ChatMessage = {
  role?: string;
  content?: string | MessageContentPart[] | null;
};

function extractText(content: ChatMessage["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;

  return content
    .map((part) => {
      if (typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function messagesToText(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role ?? "";
      const text = extractText(message.content);
      return role ? `${role}: ${text}` : text;
    })
    .join("\n");
}

export function isClaudeModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.startsWith("claude-") || normalized.includes("/claude");
}

/**
 * Count tokens for a list of chat messages against a given model.
 */
export function countTokens(model: string, messages: ChatMessage[]): number {
  const text = messagesToText(messages);
  return countTextTokens(model, text);
}

/**
 * Count tokens for a single block of text against a given model.
 */
export function countTextTokens(model: string, text: string): number {
  if (!text) return 0;
  if (isClaudeModel(model)) {
    return countClaudeTokens(text);
  }
  return encode(text).length;
}
