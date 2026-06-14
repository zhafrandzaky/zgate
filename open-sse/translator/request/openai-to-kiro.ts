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

function isUserTurn(item: KiroHistoryItem): item is KiroUserInputMessage {
  return "userInputMessage" in item;
}

/**
 * Build the CodeWhisperer `conversationState`.
 *
 * Every message is processed (the previous implementation broke out of the loop
 * at the last user turn, silently dropping any assistant `tool_use` + `tool`
 * results that followed it — the standard tool-continuation shape `[user,
 * assistant(tool_calls), tool, ...]` with no trailing user message). Tool
 * results attach to the user turn that follows them; trailing tool results (no
 * following user) synthesize a continuation user turn so they reach the model.
 * The last user turn becomes `currentMessage`; everything before it is history.
 */
export function requestFromOpenAI(req: OpenAIChatRequest): KiroRequest {
  const systemChunks: string[] = [];
  const turns: KiroHistoryItem[] = [];
  let pendingToolResults: KiroToolResult[] = [];

  const makeUserTurn = (content: string): KiroUserInputMessage => {
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
    return item;
  };

  for (const message of req.messages) {
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
      turns.push(assistantToHistory(message));
      continue;
    }
    // user — flush any tool results accumulated since the previous turn.
    turns.push(makeUserTurn(contentToText(message.content)));
  }

  // Tool results that arrived after the last turn (continuation with no trailing
  // user message) become a fresh user turn so they are not lost.
  if (pendingToolResults.length > 0) {
    turns.push(makeUserTurn(""));
  }

  // The last user turn is the current message; the rest is history (order kept).
  let currentIndex = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn && isUserTurn(turn)) {
      currentIndex = i;
      break;
    }
  }

  let current: KiroUserInputMessage;
  const history: KiroHistoryItem[] = [];
  if (currentIndex >= 0) {
    current = turns[currentIndex] as KiroUserInputMessage;
    for (let i = 0; i < turns.length; i++) {
      if (i !== currentIndex) history.push(turns[i]!);
    }
  } else {
    // No user turn at all — synthesize an empty one.
    current = makeUserTurn("");
    history.push(...turns);
  }

  // Tool specs + system prefix belong on the current message.
  const tools = buildToolSpecs(req);
  if (tools) current.userInputMessage.userInputMessageContext.tools = tools;
  const systemPrefix = systemChunks.filter(Boolean).join("\n\n");
  if (systemPrefix) {
    const existing = current.userInputMessage.content;
    current.userInputMessage.content = existing ? `${systemPrefix}\n\n${existing}` : systemPrefix;
  }

  return {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId:
        typeof req.metadata?.conversationId === "string" ? req.metadata.conversationId : "zgate",
      currentMessage: current,
      history,
    },
  };
}
