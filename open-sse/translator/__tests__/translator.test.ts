import { expect, test, describe } from "bun:test";

import {
  Format,
  decodeClientRequest,
  decodeProviderResponse,
  encodeClientResponse,
  encodeProviderRequest,
  createProviderStreamDecoder,
  createClientStreamEncoder,
} from "../index";
import { assembleChunks } from "../streaming";
import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
  ResponseContext,
} from "../types";

const CTX: ResponseContext = { model: "test-model", id: "fixed-id", created: 1700000000 };

function pivot(partial: Partial<OpenAIChatRequest>): OpenAIChatRequest {
  return { model: "test-model", messages: [], ...partial };
}

/** Drive a provider SSE event list through the decoder and assemble the result. */
function decodeStream(format: Format, events: unknown[]): OpenAIChatResponse {
  const decoder = createProviderStreamDecoder(format, CTX);
  const chunks: OpenAIStreamChunk[] = [];
  for (const event of events) chunks.push(...decoder.push(event));
  chunks.push(...decoder.end());
  return assembleChunks(chunks, CTX);
}

// ----------------------------------------------------------------------------
// Claude (Anthropic Messages)
// ----------------------------------------------------------------------------

describe("claude provider pairing", () => {
  test("encodes system, messages, and a required max_tokens", () => {
    const claude = encodeProviderRequest(
      Format.Claude,
      pivot({
        max_tokens: 1024,
        messages: [
          { role: "system", content: "be terse" },
          { role: "user", content: "hi" },
        ],
      }),
    ) as { system?: string; max_tokens: number; messages: unknown[] };
    expect(claude.system).toBe("be terse");
    expect(claude.max_tokens).toBe(1024);
    expect(claude.messages).toHaveLength(1);
  });

  test("prior-turn reasoning_content is NOT replayed as an (unsigned) thinking block", () => {
    // Anthropic rejects thinking blocks in request input that lack their original
    // signature; a cross-model reasoning trace can't be re-signed. The request
    // encoder drops it and keeps only the visible answer.
    const claude = encodeProviderRequest(
      Format.Claude,
      pivot({
        messages: [
          { role: "user", content: "q" },
          { role: "assistant", content: "the answer", reasoning_content: "because reasons" },
        ],
      }),
    ) as { messages: { role: string; content: { type: string }[] }[] };
    const assistant = claude.messages[1];
    const types = assistant?.content.map((b) => b.type) ?? [];
    expect(types).toEqual(["text"]);
  });

  test("decodes a response keeping thinking separate from content", () => {
    const res = decodeProviderResponse(
      Format.Claude,
      {
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "answer" },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 3, output_tokens: 4 },
      },
      CTX,
    );
    const message = res.choices[0]?.message;
    expect(message?.content).toBe("answer");
    expect(message?.reasoning_content).toBe("hmm");
    expect(res.usage?.total_tokens).toBe(7);
  });

  test("assembles a streamed text + tool_use response", () => {
    const events = [
      { type: "message_start", message: { usage: { input_tokens: 5 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "tu_1", name: "get_weather" },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"city":' },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '"Tokyo"}' },
      },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 8 } },
      { type: "message_stop" },
    ];
    const res = decodeStream(Format.Claude, events);
    const message = res.choices[0]?.message;
    expect(message?.content).toBe("Hello world");
    expect(message?.tool_calls?.[0]?.function.name).toBe("get_weather");
    expect(JSON.parse(message?.tool_calls?.[0]?.function.arguments ?? "{}")).toEqual({
      city: "Tokyo",
    });
    expect(res.choices[0]?.finish_reason).toBe("tool_calls");
  });
});

// ----------------------------------------------------------------------------
// Gemini
// ----------------------------------------------------------------------------

describe("gemini provider pairing", () => {
  test("encodes contents and generationConfig", () => {
    const gemini = encodeProviderRequest(
      Format.Gemini,
      pivot({
        max_tokens: 512,
        temperature: 0.5,
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "hi" },
        ],
      }),
    ) as {
      contents: { role?: string }[];
      systemInstruction?: { parts: { text: string }[] };
      generationConfig?: { maxOutputTokens?: number };
    };
    expect(gemini.systemInstruction?.parts[0]?.text).toBe("sys");
    expect(gemini.contents[0]?.role).toBe("user");
    expect(gemini.generationConfig?.maxOutputTokens).toBe(512);
  });

  test("decodes a candidate response", () => {
    const res = decodeProviderResponse(
      Format.Gemini,
      {
        candidates: [
          { content: { role: "model", parts: [{ text: "Hi there" }] }, finishReason: "STOP" },
        ],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
      },
      CTX,
    );
    expect(res.choices[0]?.message.content).toBe("Hi there");
    expect(res.choices[0]?.finish_reason).toBe("stop");
    expect(res.usage?.total_tokens).toBe(5);
  });

  test("assembles a streamed response", () => {
    const events = [
      { candidates: [{ content: { parts: [{ text: "Hel" }] } }] },
      { candidates: [{ content: { parts: [{ text: "lo" }] } }] },
      {
        candidates: [{ content: { parts: [] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
      },
    ];
    const res = decodeStream(Format.Gemini, events);
    expect(res.choices[0]?.message.content).toBe("Hello");
    expect(res.usage?.total_tokens).toBe(3);
  });

  test("gemini-cli and vertex resolve to the gemini translator", () => {
    const a = encodeProviderRequest(
      Format.GeminiCli,
      pivot({ messages: [{ role: "user", content: "x" }] }),
    );
    const b = encodeProviderRequest(
      Format.Vertex,
      pivot({ messages: [{ role: "user", content: "x" }] }),
    );
    expect(a).toHaveProperty("contents");
    expect(b).toHaveProperty("contents");
  });
});

// ----------------------------------------------------------------------------
// Ollama
// ----------------------------------------------------------------------------

describe("ollama provider pairing", () => {
  test("encodes messages and options", () => {
    const ollama = encodeProviderRequest(
      Format.Ollama,
      pivot({ max_tokens: 128, temperature: 0.2, messages: [{ role: "user", content: "hi" }] }),
    ) as { messages: unknown[]; options?: { num_predict?: number } };
    expect(ollama.messages).toHaveLength(1);
    expect(ollama.options?.num_predict).toBe(128);
  });

  test("assembles a streamed response with usage", () => {
    const events = [
      { message: { role: "assistant", content: "He" }, done: false },
      { message: { role: "assistant", content: "llo" }, done: false },
      { done: true, prompt_eval_count: 4, eval_count: 6 },
    ];
    const res = decodeStream(Format.Ollama, events);
    expect(res.choices[0]?.message.content).toBe("Hello");
    expect(res.usage?.total_tokens).toBe(10);
  });
});

// ----------------------------------------------------------------------------
// OpenAI Responses
// ----------------------------------------------------------------------------

describe("openai-responses pairing", () => {
  test("encodes chat messages into the responses input shape", () => {
    const responses = encodeProviderRequest(
      Format.OpenAIResponses,
      pivot({
        max_tokens: 256,
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "hello" },
        ],
      }),
    ) as { instructions?: string; input: { type: string }[]; max_output_tokens?: number };
    expect(responses.instructions).toBe("sys");
    expect(responses.input[0]?.type).toBe("message");
    expect(responses.max_output_tokens).toBe(256);
  });

  test("decodes a responses output into a chat message", () => {
    const res = decodeProviderResponse(
      Format.OpenAIResponses,
      {
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hi" }] },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      CTX,
    );
    expect(res.choices[0]?.message.content).toBe("Hi");
    expect(res.usage?.total_tokens).toBe(2);
  });
});

// ----------------------------------------------------------------------------
// Registry: cross-format request normalization
// ----------------------------------------------------------------------------

describe("registry cross-format flow", () => {
  test("a Claude client request normalizes then re-encodes to Gemini", () => {
    const anthropicBody = {
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: "you are helpful",
      messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }],
    };
    const pivotReq = decodeClientRequest(Format.Claude, anthropicBody);
    expect(pivotReq.messages[0]?.role).toBe("system");
    expect(pivotReq.messages[1]?.role).toBe("user");

    const gemini = encodeProviderRequest(Format.Gemini, pivotReq) as {
      systemInstruction?: { parts: { text: string }[] };
      contents: unknown[];
    };
    expect(gemini.systemInstruction?.parts[0]?.text).toBe("you are helpful");
    expect(gemini.contents).toHaveLength(1);
  });

  test("openai client/provider identity preserves the body", () => {
    const req = decodeClientRequest(Format.OpenAI, {
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(encodeProviderRequest(Format.OpenAI, req)).toBe(req);
  });
});

// ----------------------------------------------------------------------------
// Client encoders: pivot response -> client wire format
// ----------------------------------------------------------------------------

describe("openai-to-claude client encoder", () => {
  test("encodes a non-streaming response into Anthropic shape", () => {
    const res: OpenAIChatResponse = {
      id: "chatcmpl-x",
      object: "chat.completion",
      created: 1,
      model: "claude-sonnet-4-6",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hello", reasoning_content: "think" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    };
    const anthropic = encodeClientResponse(Format.Claude, res, { model: "claude-sonnet-4-6" }) as {
      type: string;
      content: { type: string }[];
      stop_reason: string;
      usage: { output_tokens: number };
    };
    expect(anthropic.type).toBe("message");
    expect(anthropic.content.map((b) => b.type)).toEqual(["thinking", "text"]);
    expect(anthropic.stop_reason).toBe("end_turn");
    expect(anthropic.usage.output_tokens).toBe(3);
  });

  test("streams a well-formed Anthropic event sequence", () => {
    const encoder = createClientStreamEncoder(Format.Claude, { model: "claude-sonnet-4-6" });
    const chunk = (
      delta: OpenAIStreamChunk["choices"][number]["delta"],
      finish: OpenAIStreamChunk["choices"][number]["finish_reason"] = null,
    ): OpenAIStreamChunk => ({
      id: "c",
      object: "chat.completion.chunk",
      created: 1,
      model: "m",
      choices: [{ index: 0, delta, finish_reason: finish }],
    });

    const events: unknown[] = [];
    events.push(...encoder.push(chunk({ role: "assistant", content: "Hel" })));
    events.push(...encoder.push(chunk({ content: "lo" })));
    events.push(...encoder.push(chunk({}, "stop")));
    events.push(...encoder.end());

    const types = events.map((e) => (e as { type: string }).type);
    expect(types[0]).toBe("message_start");
    expect(types).toContain("content_block_start");
    expect(types).toContain("content_block_delta");
    expect(types).toContain("content_block_stop");
    expect(types).toContain("message_delta");
    expect(types[types.length - 1]).toBe("message_stop");
  });
});

// ----------------------------------------------------------------------------
// Audit fixes (TASK-005)
// ----------------------------------------------------------------------------

type ClaudeReq = {
  thinking?: { type: string; budget_tokens?: number };
  output_config?: { effort: string };
  temperature?: number;
};

describe("claude thinking + sampling per model generation", () => {
  test("Opus 4.8: adaptive thinking, effort, and sampling removed", () => {
    const claude = encodeProviderRequest(
      Format.Claude,
      pivot({
        model: "claude-opus-4-8",
        reasoning_effort: "high",
        temperature: 0.7,
        top_p: 0.9,
        messages: [{ role: "user", content: "hi" }],
      }),
    ) as ClaudeReq;
    expect(claude.thinking).toEqual({ type: "adaptive" });
    expect(claude.output_config).toEqual({ effort: "high" });
    expect(claude.temperature).toBeUndefined(); // removed on 4.7/4.8
  });

  test("Opus 4.6: adaptive thinking but sampling still allowed", () => {
    const claude = encodeProviderRequest(
      Format.Claude,
      pivot({
        model: "claude-opus-4-6",
        reasoning_effort: "max",
        temperature: 0.3,
        messages: [{ role: "user", content: "hi" }],
      }),
    ) as ClaudeReq;
    expect(claude.thinking).toEqual({ type: "adaptive" });
    expect(claude.output_config).toEqual({ effort: "max" });
    expect(claude.temperature).toBe(0.3);
  });

  test("Haiku 4.5 (legacy): enabled+budget thinking, no effort, sampling allowed", () => {
    const claude = encodeProviderRequest(
      Format.Claude,
      pivot({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        reasoning_effort: "high",
        temperature: 0.5,
        messages: [{ role: "user", content: "hi" }],
      }),
    ) as ClaudeReq;
    expect(claude.thinking?.type).toBe("enabled");
    expect(claude.thinking?.budget_tokens).toBeGreaterThanOrEqual(1024);
    expect(claude.output_config).toBeUndefined();
    expect(claude.temperature).toBe(0.5);
  });

  test("non-Claude anthropic-compat (glm) keeps legacy behavior", () => {
    const claude = encodeProviderRequest(
      Format.Claude,
      pivot({
        model: "glm-4.7",
        reasoning_effort: "high",
        temperature: 0.2,
        messages: [{ role: "user", content: "hi" }],
      }),
    ) as ClaudeReq;
    expect(claude.thinking?.type).toBe("enabled");
    expect(claude.temperature).toBe(0.2);
  });
});

describe("kiro tool-continuation (no trailing user message)", () => {
  test("does not drop assistant tool_calls or tool results", () => {
    const kiro = encodeProviderRequest(
      Format.Kiro,
      pivot({
        model: "claude-sonnet-4.5",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "do it" },
          {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "t1", type: "function", function: { name: "f", arguments: "{}" } }],
          },
          { role: "tool", tool_call_id: "t1", content: "the result" },
        ],
      }),
    ) as {
      conversationState: {
        currentMessage: {
          userInputMessage: {
            content: string;
            userInputMessageContext: { toolResults?: { toolUseId: string }[] };
          };
        };
        history: unknown[];
      };
    };
    const ctx = kiro.conversationState.currentMessage.userInputMessage.userInputMessageContext;
    expect(ctx.toolResults?.[0]?.toolUseId).toBe("t1");
    // user turn + assistant turn preserved in history (nothing dropped).
    expect(kiro.conversationState.history).toHaveLength(2);
  });
});

describe("deepseek reasoning_content strip on OpenAI encode", () => {
  test("strips reasoning_content from assistant messages", () => {
    const out = encodeProviderRequest(
      Format.OpenAI,
      pivot({
        messages: [
          { role: "user", content: "q" },
          { role: "assistant", content: "a", reasoning_content: "secret cot" },
        ],
      }),
    ) as OpenAIChatRequest;
    expect(out.messages[1]?.reasoning_content).toBeUndefined();
    expect(out.messages[1]?.content).toBe("a");
  });
});

describe("gemini tool_choice + correlation fixes", () => {
  test("forced function maps to ANY + allowedFunctionNames", () => {
    const gemini = encodeProviderRequest(
      Format.Gemini,
      pivot({
        tools: [{ type: "function", function: { name: "get_weather" } }],
        tool_choice: { type: "function", function: { name: "get_weather" } },
        messages: [{ role: "user", content: "x" }],
      }),
    ) as {
      toolConfig?: { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } };
    };
    expect(gemini.toolConfig?.functionCallingConfig.mode).toBe("ANY");
    expect(gemini.toolConfig?.functionCallingConfig.allowedFunctionNames).toEqual(["get_weather"]);
  });

  test("functionCall and functionResponse share a deterministic tool_call_id", () => {
    const pivotReq = decodeClientRequest(Format.Gemini, {
      model: "gemini-2.5-pro",
      contents: [
        { role: "model", parts: [{ functionCall: { name: "f", args: { a: 1 } } }] },
        { role: "user", parts: [{ functionResponse: { name: "f", response: { ok: true } } }] },
      ],
    });
    const assistant = pivotReq.messages.find((m) => m.role === "assistant");
    const tool = pivotReq.messages.find((m) => m.role === "tool");
    expect(assistant?.tool_calls?.[0]?.id).toBe("call_f");
    expect(tool?.tool_call_id).toBe("call_f");
  });
});

describe("anthropic content edge cases", () => {
  test("flattens array tool_result content into a string tool message", () => {
    const pivotReq = decodeClientRequest(Format.Claude, {
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "f", input: {} }] },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [
                { type: "text", text: "part1" },
                { type: "text", text: "part2" },
              ],
            },
          ],
        },
      ],
    });
    const tool = pivotReq.messages.find((m) => m.role === "tool");
    expect(tool?.content).toBe("part1\npart2");
  });

  test("drops an empty assistant turn (no empty content array to Anthropic)", () => {
    const claude = encodeProviderRequest(
      Format.Claude,
      pivot({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: null },
        ],
      }),
    ) as { messages: { role: string }[] };
    expect(claude.messages).toHaveLength(1);
    expect(claude.messages[0]?.role).toBe("user");
  });
});

describe("claude stop_reason + cache usage", () => {
  test("refusal -> content_filter; pause_turn -> stop fallback", () => {
    const refusal = decodeProviderResponse(
      Format.Claude,
      { content: [{ type: "text", text: "no" }], stop_reason: "refusal" },
      CTX,
    );
    expect(refusal.choices[0]?.finish_reason).toBe("content_filter");
    const pause = decodeProviderResponse(
      Format.Claude,
      { content: [{ type: "text", text: "x" }], stop_reason: "pause_turn" },
      CTX,
    );
    expect(pause.choices[0]?.finish_reason).toBe("stop");
  });

  test("cache_read_input_tokens folds into prompt_tokens + details", () => {
    const res = decodeProviderResponse(
      Format.Claude,
      {
        content: [{ type: "text", text: "x" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7 },
      },
      CTX,
    );
    expect(res.usage?.prompt_tokens).toBe(17);
    expect(res.usage?.total_tokens).toBe(22);
    expect(res.usage?.prompt_tokens_details?.cached_tokens).toBe(7);
  });
});

describe("web-reverse format stubs", () => {
  test("grok-web encodes a prompt and decodes a token stream", () => {
    const body = encodeProviderRequest(
      Format.GrokWeb,
      pivot({ messages: [{ role: "user", content: "hi" }] }),
    ) as { message: string; modelName: string };
    expect(body.message).toContain("hi");

    const res = decodeStream(Format.GrokWeb, [
      { result: { response: { token: "Hel" } } },
      { result: { response: { token: "lo" } } },
    ]);
    expect(res.choices[0]?.message.content).toBe("Hello");
  });

  test("perplexity-web decodes an answer field", () => {
    const res = decodeProviderResponse(Format.PerplexityWeb, { answer: "the answer" }, CTX);
    expect(res.choices[0]?.message.content).toBe("the answer");
  });
});
