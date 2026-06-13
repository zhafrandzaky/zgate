/**
 * Response translator: OpenAI Responses API -> OpenAI Chat Completions pivot.
 *
 * Pairs with `request/openai-responses.ts`. Flattens the Responses `output`
 * item list (and its event stream) back into a single Chat Completion message,
 * mapping `function_call` items to tool_calls and reasoning summaries to
 * `reasoning_content`.
 */

import { isRecord } from "../helpers/openaiHelper";
import { resolveContext } from "../streaming";
import type {
  OpenAIChatResponse,
  OpenAIResponseMessage,
  OpenAIStreamChunk,
  OpenAIToolCall,
  OpenAIUsage,
  ResponseContext,
  StreamTransformer,
} from "../types";

function mapUsage(raw: unknown): OpenAIUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const input = typeof raw.input_tokens === "number" ? raw.input_tokens : 0;
  const output = typeof raw.output_tokens === "number" ? raw.output_tokens : 0;
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
}

function outputTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isRecord(part) && part.type === "output_text" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .filter(Boolean)
    .join("");
}

export function translateResponse(body: unknown, ctx: ResponseContext): OpenAIChatResponse {
  const resolved = resolveContext(ctx);
  let text = "";
  let reasoning = "";
  const toolCalls: OpenAIToolCall[] = [];

  if (isRecord(body) && Array.isArray(body.output)) {
    for (const item of body.output) {
      if (!isRecord(item)) continue;
      if (item.type === "message") {
        text += outputTextFromContent(item.content);
      } else if (item.type === "function_call") {
        toolCalls.push({
          id: typeof item.call_id === "string" ? item.call_id : "",
          type: "function",
          function: {
            name: typeof item.name === "string" ? item.name : "",
            arguments: typeof item.arguments === "string" ? item.arguments : "",
          },
        });
      } else if (item.type === "reasoning") {
        if (typeof item.summary === "string") reasoning += item.summary;
        else if (Array.isArray(item.summary)) {
          reasoning += item.summary
            .map((s) => (isRecord(s) && typeof s.text === "string" ? s.text : ""))
            .join("");
        }
      }
    }
  }

  const message: OpenAIResponseMessage = {
    role: "assistant",
    content: text.length > 0 ? text : null,
  };
  if (reasoning.length > 0) message.reasoning_content = reasoning;
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  const response: OpenAIChatResponse = {
    id: isRecord(body) && typeof body.id === "string" ? body.id : resolved.id,
    object: "chat.completion",
    created: resolved.created,
    model: resolved.model,
    choices: [{ index: 0, message, finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop" }],
  };
  const usage = isRecord(body) ? mapUsage(body.usage) : undefined;
  if (usage) response.usage = usage;
  return response;
}

export function createStreamTransformer(
  ctx: ResponseContext,
): StreamTransformer<OpenAIStreamChunk> {
  const resolved = resolveContext(ctx);
  let roleSent = false;
  let sawToolCall = false;
  /** Responses item_id -> OpenAI tool_call index. */
  const toolIndexByItem = new Map<string, number>();
  let nextToolIndex = 0;

  const baseChunk = (
    delta: OpenAIStreamChunk["choices"][number]["delta"],
    finish: OpenAIStreamChunk["choices"][number]["finish_reason"] = null,
  ): OpenAIStreamChunk => ({
    id: resolved.id,
    object: "chat.completion.chunk",
    created: resolved.created,
    model: resolved.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  const withRole = (
    delta: OpenAIStreamChunk["choices"][number]["delta"],
  ): OpenAIStreamChunk["choices"][number]["delta"] => {
    if (roleSent) return delta;
    roleSent = true;
    return { role: "assistant", ...delta };
  };

  return {
    push(event: unknown): OpenAIStreamChunk[] {
      if (!isRecord(event)) return [];
      const type = event.type;

      if (type === "response.output_text.delta" && typeof event.delta === "string") {
        return [baseChunk(withRole({ content: event.delta }))];
      }

      if (
        (type === "response.reasoning_summary_text.delta" ||
          type === "response.reasoning_text.delta") &&
        typeof event.delta === "string"
      ) {
        return [baseChunk(withRole({ reasoning_content: event.delta }))];
      }

      if (type === "response.output_item.added" && isRecord(event.item)) {
        const item = event.item;
        if (item.type === "function_call") {
          const itemId =
            typeof event.item_id === "string"
              ? event.item_id
              : typeof item.id === "string"
                ? item.id
                : `item_${nextToolIndex}`;
          const index = nextToolIndex++;
          toolIndexByItem.set(itemId, index);
          sawToolCall = true;
          return [
            baseChunk(
              withRole({
                tool_calls: [
                  {
                    index,
                    id: typeof item.call_id === "string" ? item.call_id : itemId,
                    type: "function",
                    function: {
                      name: typeof item.name === "string" ? item.name : "",
                      arguments: "",
                    },
                  },
                ],
              }),
            ),
          ];
        }
        return [];
      }

      if (type === "response.function_call_arguments.delta" && typeof event.delta === "string") {
        const itemId = typeof event.item_id === "string" ? event.item_id : "";
        const index = toolIndexByItem.get(itemId) ?? 0;
        return [
          baseChunk({
            tool_calls: [
              { index, id: "", type: "function", function: { name: "", arguments: event.delta } },
            ],
          }),
        ];
      }

      if (type === "response.completed" || type === "response.incomplete") {
        const chunk = baseChunk({}, sawToolCall ? "tool_calls" : "stop");
        const usage = isRecord(event.response) ? mapUsage(event.response.usage) : undefined;
        if (usage) chunk.usage = usage;
        return [chunk];
      }

      return [];
    },
    end(): OpenAIStreamChunk[] {
      return [];
    },
  };
}
