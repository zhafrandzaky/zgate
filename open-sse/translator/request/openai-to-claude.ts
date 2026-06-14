/**
 * Request translator: OpenAI pivot -> Anthropic Messages (`/v1/messages`).
 *
 * Pairs with `response/claude-to-openai.ts`. Used for the `claude` (OAuth/SPOOF),
 * `anthropic` (API key), and other Anthropic-compatible providers.
 *
 * Thinking & sampling are emitted per model generation (see
 * `helpers/claudeModelCaps.ts`), because the Anthropic request surface differs
 * by model and sending a removed parameter is a hard 400 (Anthropic model
 * migration guide):
 *   - Opus 4.7/4.8 & Fable 5: `thinking:{type:"adaptive"}` + `output_config.effort`;
 *     `temperature`/`top_p`/`top_k` are removed (omitted here).
 *   - Opus 4.6 / Sonnet 4.6: adaptive preferred; sampling still allowed.
 *   - Older Claude (4.5 / 3.x) and non-Claude anthropic-compat backends: legacy
 *     `thinking:{type:"enabled",budget_tokens}`; sampling allowed.
 */

import {
  openAIToAnthropic,
  type AnthropicMessage,
  type AnthropicMessagesPayload,
} from "../helpers/claudeHelper";
import {
  classifyClaudeModel,
  clampClaudeEffort,
  claudeSupportsEffort,
  claudeSupportsSampling,
} from "../helpers/claudeModelCaps";
import { CLAUDE_DEFAULT_MAX_TOKENS, resolveMaxTokens } from "../helpers/maxTokensHelper";
import { openAIToolsToAnthropic, type AnthropicToolDef } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest, OpenAIToolChoice } from "../types";

export type ClaudeToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "none" }
  | { type: "tool"; name: string };

export type ClaudeThinking = { type: "enabled"; budget_tokens: number } | { type: "adaptive" };

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
  thinking?: ClaudeThinking;
  /** Modern thinking-depth / token-spend control (Opus 4.5+, Sonnet 4.6, Fable). */
  output_config?: { effort: string };
}

function mapToolChoice(choice: OpenAIToolChoice | undefined): ClaudeToolChoice | undefined {
  if (choice === undefined) return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if (choice === "none") return { type: "none" };
  if (typeof choice === "object") return { type: "tool", name: choice.function.name };
  return undefined;
}

function wantsThinking(req: OpenAIChatRequest): boolean {
  return (
    req.thinking?.type === "enabled" ||
    req.reasoning_effort === "high" ||
    req.reasoning_effort === "max"
  );
}

/** Legacy budget for `{type:"enabled"}`: Anthropic requires budget < max_tokens. */
function thinkingBudget(maxTokens: number): number {
  return Math.max(1024, Math.floor(maxTokens / 2));
}

/** Apply the generation-appropriate thinking + effort fields. */
function applyThinking(claude: ClaudeRequest, req: OpenAIChatRequest, maxTokens: number): void {
  const style = classifyClaudeModel(req.model);

  if (style === "adaptive-only" || style === "adaptive-pref") {
    // budget_tokens is removed (4.7/4.8/Fable) or deprecated (4.6); adaptive is
    // the supported on-mode. `disabled` is omitted entirely (Fable 5 rejects it).
    if (wantsThinking(req) || req.thinking?.type === "enabled") {
      claude.thinking = { type: "adaptive" };
    }
    if (claudeSupportsEffort(req.model) && req.reasoning_effort) {
      claude.output_config = { effort: clampClaudeEffort(req.reasoning_effort, req.model) };
    }
    return;
  }

  // legacy-budget + non-Claude anthropic-compat backends keep enabled+budget.
  if (wantsThinking(req)) {
    claude.thinking = { type: "enabled", budget_tokens: thinkingBudget(maxTokens) };
  }
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

  // Sampling params are removed on Opus 4.7/4.8 & Fable 5 (400 if sent).
  if (claudeSupportsSampling(req.model)) {
    if (typeof req.temperature === "number") claude.temperature = req.temperature;
    if (typeof req.top_p === "number") claude.top_p = req.top_p;
    if (typeof req.top_k === "number") claude.top_k = req.top_k;
  }

  if (typeof req.stop === "string") claude.stop_sequences = [req.stop];
  else if (Array.isArray(req.stop)) claude.stop_sequences = req.stop;
  if (typeof req.stream === "boolean") claude.stream = req.stream;

  applyThinking(claude, req, maxTokens);

  return claude;
}
