/**
 * Centralized tool-calling fidelity layer.
 *
 * Tool calls take three shapes across providers; this module is the single place
 * that maps between them so no translator hand-rolls (and drifts on) the mapping:
 *
 *   OpenAI    tool_calls[]      { id, function: { name, arguments: JSON-string } }
 *   Anthropic tool_use block    { id, name, input: object }
 *   Gemini    functionCall part { name, args: object }
 *
 * Tool results are mapped symmetrically:
 *
 *   OpenAI    role:"tool"           { tool_call_id, content }
 *   Anthropic tool_result block     { tool_use_id, content }
 *   Gemini    functionResponse part { name, response }
 */

import { generateId } from "../streaming";
import type { OpenAITool, OpenAIToolCall, OpenAIToolFunction } from "../types";

/** Parse a JSON argument string, tolerating empty/invalid fragments. */
export function parseArguments(args: string): Record<string, unknown> {
  if (!args || args.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(args);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Stringify an argument object into the OpenAI `arguments` wire form. */
export function stringifyArguments(input: unknown): string {
  if (input == null) return "{}";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return "{}";
  }
}

// ----------------------------------------------------------------------------
// Tool CALLS (assistant -> tool invocation)
// ----------------------------------------------------------------------------

export interface AnthropicToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface GeminiFunctionCall {
  functionCall: { name: string; args: Record<string, unknown> };
}

/** OpenAI tool call -> Anthropic tool_use block. */
export function openAIToolCallToAnthropic(call: OpenAIToolCall): AnthropicToolUse {
  return {
    type: "tool_use",
    id: call.id || generateId("toolu"),
    name: call.function.name,
    input: parseArguments(call.function.arguments),
  };
}

/** Anthropic tool_use block -> OpenAI tool call. */
export function anthropicToolUseToOpenAI(block: AnthropicToolUse): OpenAIToolCall {
  return {
    id: block.id || generateId("call"),
    type: "function",
    function: { name: block.name, arguments: stringifyArguments(block.input) },
  };
}

/** OpenAI tool call -> Gemini functionCall part. */
export function openAIToolCallToGemini(call: OpenAIToolCall): GeminiFunctionCall {
  return {
    functionCall: {
      name: call.function.name,
      args: parseArguments(call.function.arguments),
    },
  };
}

/** Gemini functionCall part -> OpenAI tool call.
 *
 * Gemini function calls carry no id; OpenAI correlates tool results to calls by
 * `tool_call_id`. We derive a deterministic `call_<name>` id so the matching
 * `functionResponse` (decoded to an OpenAI tool message with the same id, see
 * geminiHelper) lines up. Parallel calls to the same function would collide —
 * rare on Gemini — and fall back to acceptable best-effort correlation. */
export function geminiFunctionCallToOpenAI(part: GeminiFunctionCall): OpenAIToolCall {
  const name = part.functionCall.name;
  return {
    id: name ? `call_${name}` : generateId("call"),
    type: "function",
    function: {
      name,
      arguments: stringifyArguments(part.functionCall.args),
    },
  };
}

// ----------------------------------------------------------------------------
// Tool RESULTS (tool output fed back to the model)
// ----------------------------------------------------------------------------

export interface AnthropicToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface GeminiFunctionResponse {
  functionResponse: { name: string; response: Record<string, unknown> };
}

/** OpenAI tool message content -> Anthropic tool_result block. */
export function toAnthropicToolResult(toolCallId: string, content: string): AnthropicToolResult {
  return { type: "tool_result", tool_use_id: toolCallId, content };
}

/** Anthropic tool_result block -> OpenAI tool message fields. */
export function fromAnthropicToolResult(block: AnthropicToolResult): {
  tool_call_id: string;
  content: string;
} {
  return { tool_call_id: block.tool_use_id, content: block.content };
}

/** OpenAI tool message -> Gemini functionResponse part. */
export function toGeminiFunctionResponse(name: string, content: string): GeminiFunctionResponse {
  return { functionResponse: { name, response: { content } } };
}

// ----------------------------------------------------------------------------
// Tool DEFINITIONS (the `tools` array on a request)
// ----------------------------------------------------------------------------

export interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

const EMPTY_SCHEMA: Record<string, unknown> = { type: "object", properties: {} };

/** OpenAI tool definitions -> Anthropic tool definitions. */
export function openAIToolsToAnthropic(tools: OpenAITool[]): AnthropicToolDef[] {
  return tools.map((tool) => {
    const def: AnthropicToolDef = {
      name: tool.function.name,
      input_schema: tool.function.parameters ?? EMPTY_SCHEMA,
    };
    if (tool.function.description) def.description = tool.function.description;
    return def;
  });
}

/** Anthropic tool definitions -> OpenAI tool definitions. */
export function anthropicToolsToOpenAI(tools: AnthropicToolDef[]): OpenAITool[] {
  return tools.map((tool) => {
    const fn: OpenAIToolFunction = { name: tool.name, parameters: tool.input_schema };
    if (tool.description) fn.description = tool.description;
    return { type: "function", function: fn };
  });
}

/** OpenAI tool definitions -> Gemini functionDeclarations. */
export function openAIToolsToGemini(tools: OpenAITool[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => {
    const decl: GeminiFunctionDeclaration = { name: tool.function.name };
    if (tool.function.description) decl.description = tool.function.description;
    if (tool.function.parameters) decl.parameters = tool.function.parameters;
    return decl;
  });
}

/** Gemini functionDeclarations -> OpenAI tool definitions. */
export function geminiToolsToOpenAI(decls: GeminiFunctionDeclaration[]): OpenAITool[] {
  return decls.map((decl) => {
    const fn: OpenAIToolFunction = { name: decl.name };
    if (decl.description) fn.description = decl.description;
    if (decl.parameters) fn.parameters = decl.parameters;
    return { type: "function", function: fn };
  });
}
