import { expect, test, describe } from "bun:test";

import {
  anthropicToolUseToOpenAI,
  geminiFunctionCallToOpenAI,
  openAIToolCallToAnthropic,
  openAIToolCallToGemini,
  openAIToolsToAnthropic,
  anthropicToolsToOpenAI,
  parseArguments,
  stringifyArguments,
} from "../helpers/toolCallHelper";
import {
  fromAnthropicImage,
  fromGeminiImage,
  parseImageUrl,
  toAnthropicImage,
  toGeminiImage,
} from "../helpers/imageHelper";
import {
  clampMaxTokens,
  getModelMaxOutput,
  readMaxTokens,
  resolveMaxTokens,
} from "../helpers/maxTokensHelper";
import { normalizeRequest } from "../helpers/openaiHelper";
import type { OpenAIToolCall, OpenAITool } from "../types";

describe("toolCallHelper", () => {
  const call: OpenAIToolCall = {
    id: "call_1",
    type: "function",
    function: { name: "get_weather", arguments: '{"city":"Tokyo"}' },
  };

  test("openai tool call survives the anthropic round trip", () => {
    const anthropic = openAIToolCallToAnthropic(call);
    expect(anthropic).toEqual({
      type: "tool_use",
      id: "call_1",
      name: "get_weather",
      input: { city: "Tokyo" },
    });
    const back = anthropicToolUseToOpenAI(anthropic);
    expect(back.function.name).toBe("get_weather");
    expect(parseArguments(back.function.arguments)).toEqual({ city: "Tokyo" });
  });

  test("openai tool call survives the gemini round trip", () => {
    const gemini = openAIToolCallToGemini(call);
    expect(gemini.functionCall.name).toBe("get_weather");
    expect(gemini.functionCall.args).toEqual({ city: "Tokyo" });
    const back = geminiFunctionCallToOpenAI(gemini);
    expect(parseArguments(back.function.arguments)).toEqual({ city: "Tokyo" });
  });

  test("tool definitions round trip openai <-> anthropic", () => {
    const tools: OpenAITool[] = [
      {
        type: "function",
        function: {
          name: "search",
          description: "Search the web",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ];
    const back = anthropicToolsToOpenAI(openAIToolsToAnthropic(tools));
    expect(back[0]?.function.name).toBe("search");
    expect(back[0]?.function.description).toBe("Search the web");
    expect(back[0]?.function.parameters).toEqual(tools[0]?.function.parameters);
  });

  test("parseArguments tolerates malformed json", () => {
    expect(parseArguments("not json")).toEqual({});
    expect(parseArguments("")).toEqual({});
  });

  test("stringifyArguments passes strings through and serializes objects", () => {
    expect(stringifyArguments('{"a":1}')).toBe('{"a":1}');
    expect(stringifyArguments({ a: 1 })).toBe('{"a":1}');
    expect(stringifyArguments(null)).toBe("{}");
  });
});

describe("imageHelper", () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";

  test("parses a base64 data url", () => {
    const parsed = parseImageUrl(dataUrl);
    expect(parsed.isBase64).toBe(true);
    expect(parsed.mediaType).toBe("image/png");
    expect(parsed.data).toBe("iVBORw0KGgo=");
  });

  test("base64 image round trips through anthropic", () => {
    const anthropic = toAnthropicImage(dataUrl);
    expect(anthropic.source.type).toBe("base64");
    expect(fromAnthropicImage(anthropic.source)).toBe(dataUrl);
  });

  test("base64 image round trips through gemini", () => {
    const gemini = toGeminiImage(dataUrl);
    expect("inlineData" in gemini).toBe(true);
    expect(fromGeminiImage(gemini)).toBe(dataUrl);
  });

  test("remote url is preserved as a url source", () => {
    const url = "https://example.com/cat.png";
    const anthropic = toAnthropicImage(url);
    expect(anthropic.source.type).toBe("url");
    expect(fromAnthropicImage(anthropic.source)).toBe(url);
  });
});

describe("maxTokensHelper", () => {
  test("reads max_completion_tokens before max_tokens before maxOutputTokens", () => {
    expect(readMaxTokens({ max_completion_tokens: 100, max_tokens: 50 })).toBe(100);
    expect(readMaxTokens({ max_tokens: 50, maxOutputTokens: 200 })).toBe(50);
    expect(readMaxTokens({ maxOutputTokens: 200 })).toBe(200);
    expect(readMaxTokens({})).toBeUndefined();
  });

  test("clamps to the model ceiling", () => {
    const ceiling = getModelMaxOutput("claude-sonnet-4-6");
    expect(clampMaxTokens(ceiling + 100000, "claude-sonnet-4-6")).toBe(ceiling);
    expect(clampMaxTokens(10, "claude-sonnet-4-6")).toBe(10);
    expect(clampMaxTokens(0, "gpt-4o")).toBe(1);
  });

  test("resolveMaxTokens falls back when the source omits a value", () => {
    expect(resolveMaxTokens({}, "claude-haiku-4-5", 4096)).toBe(4096);
    expect(resolveMaxTokens({ max_tokens: 100 }, "claude-haiku-4-5", 4096)).toBe(100);
    expect(resolveMaxTokens({}, "claude-haiku-4-5")).toBeUndefined();
  });
});

describe("openaiHelper.normalizeRequest", () => {
  test("coerces untrusted input into a strict request", () => {
    const req = normalizeRequest({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "bogus", content: 42 },
      ],
      max_tokens: 256,
      stream: true,
    });
    expect(req.model).toBe("gpt-4o");
    expect(req.messages).toHaveLength(3);
    expect(req.messages[2]?.role).toBe("user"); // invalid role normalized
    expect(req.max_tokens).toBe(256);
    expect(req.stream).toBe(true);
  });
});
