/**
 * Request translator: OpenAI pivot -> Anthropic Messages (`/v1/messages`).
 *
 * Pairs with `response/claude-to-openai.ts`. Used for the `claude` (OAuth/SPOOF),
 * `anthropic` (API key), and other Anthropic-compatible providers.
 */

import {
  openAIToAnthropic,
  type AnthropicMessage,
  type AnthropicMessagesPayload,
} from "../helpers/claudeHelper";
import { CLAUDE_DEFAULT_MAX_TOKENS, resolveMaxTokens } from "../helpers/maxTokensHelper";
import { openAIToolsToAnthropic, type AnthropicToolDef } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest, OpenAIToolChoice } from "../types";

export type ClaudeToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "none" }
  | { type: "tool"; name: string };

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicToolDef[];
  tool_choice?: ClaudeToolChoice;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  thinking?: { type: "enabled"; budget_tokens: number };
}

function mapToolChoice(choice: OpenAIToolChoice | undefined): ClaudeToolChoice | undefined {
  if (choice === undefined) return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if (choice === "none") return { type: "none" };
  if (typeof choice === "object") return { type: "tool", name: choice.function.name };
  return undefined;
}

/** Budget for the Anthropic thinking block when the pivot requested reasoning. */
function thinkingBudget(req: OpenAIChatRequest, maxTokens: number): number | undefined {
  const wantsThinking =
    req.thinking?.type === "enabled" ||
    req.reasoning_effort === "high" ||
    req.reasoning_effort === "max";
  if (!wantsThinking) return undefined;
  // Anthropic requires budget_tokens < max_tokens; reserve roughly half.
  return Math.max(1024, Math.floor(maxTokens / 2));
}

export function requestFromOpenAI(req: OpenAIChatRequest): ClaudeRequest {
  const payload: AnthropicMessagesPayload = openAIToAnthropic(req.messages);
  const maxTokens =
    resolveMaxTokens(req, req.model, CLAUDE_DEFAULT_MAX_TOKENS) ?? CLAUDE_DEFAULT_MAX_TOKENS;

  const claude: ClaudeRequest = {
    model: req.model,
    max_tokens: maxTokens,
    messages: payload.messages,
  };
  if (payload.system) claude.system = payload.system;
  if (req.tools && req.tools.length > 0) claude.tools = openAIToolsToAnthropic(req.tools);
  const toolChoice = mapToolChoice(req.tool_choice);
  if (toolChoice) claude.tool_choice = toolChoice;
  if (typeof req.temperature === "number") claude.temperature = req.temperature;
  if (typeof req.top_p === "number") claude.top_p = req.top_p;
  if (typeof req.top_k === "number") claude.top_k = req.top_k;
  if (typeof req.stop === "string") claude.stop_sequences = [req.stop];
  else if (Array.isArray(req.stop)) claude.stop_sequences = req.stop;
  if (typeof req.stream === "boolean") claude.stream = req.stream;

  const budget = thinkingBudget(req, maxTokens);
  if (budget !== undefined) claude.thinking = { type: "enabled", budget_tokens: budget };

  return claude;
}
