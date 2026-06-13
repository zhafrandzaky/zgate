/**
 * Request translator: OpenAI pivot -> AWS CodeWhisperer (Kiro).
 *
 * Pairs with `response/kiro-to-openai.ts`. CodeWhisperer wraps the conversation
 * in a `conversationState` envelope: the final user turn becomes `currentMessage`
 * and everything before it becomes `history`. Tool results live in the user
 * message context rather than as standalone turns (`docs/PROVIDERS.md` kiro
 * notes). Auth and endpoint are the executor's concern (TASK-006).
 */

import { contentToText } from "../helpers/openaiHelper";
import { parseArguments } from "../helpers/toolCallHelper";
import type { OpenAIChatRequest, OpenAIMessage } from "../types";

interface KiroToolResult {
  toolUseId: string;
  content: { text: string }[];
  status: "success";
}

interface KiroToolSpec {
  toolSpecification: {
    name: string;
    description?: string;
    inputSchema: { json: Record<string, unknown> };
  };
}

interface KiroToolUse {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}

interface KiroUserInputMessage {
  userInputMessage: {
    content: string;
    modelId: string;
    origin: "AI_EDITOR";
    userInputMessageContext: {
      toolResults?: KiroToolResult[];
      tools?: KiroToolSpec[];
    };
  };
}

interface KiroAssistantMessage {
  assistantResponseMessage: {
    content: string;
    toolUses?: KiroToolUse[];
  };
}

type KiroHistoryItem = KiroUserInputMessage | KiroAssistantMessage;

export interface KiroRequest {
  conversationState: {
    chatTriggerType: "MANUAL";
    conversationId: string;
    currentMessage: KiroUserInputMessage;
    history: KiroHistoryItem[];
  };
}

function buildToolSpecs(req: OpenAIChatRequest): KiroToolSpec[] | undefined {
  if (!req.tools || req.tools.length === 0) return undefined;
  return req.tools.map((tool) => ({
    toolSpecification: {
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      inputSchema: { json: tool.function.parameters ?? { type: "object", properties: {} } },
    },
  }));
}

function assistantToHistory(message: OpenAIMessage): KiroAssistantMessage {
  const item: KiroAssistantMessage = {
    assistantResponseMessage: { content: contentToText(message.content) },
  };
  if (message.tool_calls && message.tool_calls.length > 0) {
    item.assistantResponseMessage.toolUses = message.tool_calls.map((call) => ({
      toolUseId: call.id,
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    }));
  }
  return item;
}

export function requestFromOpenAI(req: OpenAIChatRequest): KiroRequest {
  const systemChunks: string[] = [];
  const history: KiroHistoryItem[] = [];
  let pendingToolResults: KiroToolResult[] = [];

  const flushUser = (content: string, isCurrent: boolean): KiroUserInputMessage => {
    const item: KiroUserInputMessage = {
      userInputMessage: {
        content,
        modelId: req.model,
        origin: "AI_EDITOR",
        userInputMessageContext: {},
      },
    };
    if (pendingToolResults.length > 0) {
      item.userInputMessage.userInputMessageContext.toolResults = pendingToolResults;
      pendingToolResults = [];
    }
    if (isCurrent) {
      const tools = buildToolSpecs(req);
      if (tools) item.userInputMessage.userInputMessageContext.tools = tools;
    }
    return item;
  };

  // Find the index of the last user-authored turn to use as currentMessage.
  let lastUserIndex = -1;
  for (let i = req.messages.length - 1; i >= 0; i--) {
    if (req.messages[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  for (let i = 0; i < req.messages.length; i++) {
    const message = req.messages[i];
    if (!message) continue;

    if (message.role === "system" || message.role === "developer") {
      systemChunks.push(contentToText(message.content));
      continue;
    }
    if (message.role === "tool") {
      pendingToolResults.push({
        toolUseId: message.tool_call_id ?? "",
        content: [{ text: contentToText(message.content) }],
        status: "success",
      });
      continue;
    }
    if (message.role === "assistant") {
      history.push(assistantToHistory(message));
      continue;
    }
    // user
    if (i === lastUserIndex) break; // handled as currentMessage below
    history.push(flushUser(contentToText(message.content), false));
  }

  const currentSource = lastUserIndex >= 0 ? req.messages[lastUserIndex] : undefined;
  const systemPrefix = systemChunks.filter(Boolean).join("\n\n");
  const currentText = currentSource ? contentToText(currentSource.content) : "";
  const currentContent = systemPrefix ? `${systemPrefix}\n\n${currentText}` : currentText;

  return {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId:
        typeof req.metadata?.conversationId === "string" ? req.metadata.conversationId : "zgate",
      currentMessage: flushUser(currentContent, true),
      history,
    },
  };
}
