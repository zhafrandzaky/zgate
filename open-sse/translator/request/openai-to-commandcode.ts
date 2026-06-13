/**
 * Request translator: OpenAI pivot -> CommandCode coding endpoint.
 *
 * Pairs with `response/commandcode-to-openai.ts`. CommandCode speaks an
 * Anthropic-Messages-compatible dialect for coding agents, so the body reuses
 * the Claude encoder and stamps a client marker the upstream expects in
 * `metadata`. Endpoint/header specifics are the executor's concern (TASK-006).
 */

import {
  requestFromOpenAI as claudeRequestFromOpenAI,
  type ClaudeRequest,
} from "./openai-to-claude";
import type { OpenAIChatRequest } from "../types";

export interface CommandCodeRequest extends ClaudeRequest {
  metadata?: { client: string };
}

export function requestFromOpenAI(req: OpenAIChatRequest): CommandCodeRequest {
  return { ...claudeRequestFromOpenAI(req), metadata: { client: "commandcode" } };
}
