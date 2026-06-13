import { expect, test, describe } from "bun:test";
import { countTokens, countTextTokens, isClaudeModel, type ChatMessage } from "@/src/lib/tokenizer";

describe("tokenizer", () => {
  test("detects Claude models by prefix and path form", () => {
    // Arrange / Act / Assert
    expect(isClaudeModel("claude-4-6-sonnet")).toBe(true);
    expect(isClaudeModel("anthropic/claude-opus-4")).toBe(true);
    expect(isClaudeModel("gpt-4o")).toBe(false);
    expect(isClaudeModel("deepseek/deepseek-v4-flash")).toBe(false);
  });

  test("returns 0 tokens for empty text", () => {
    expect(countTextTokens("gpt-4o", "")).toBe(0);
  });

  test("counts a positive number of tokens for non-empty content", () => {
    const tokens = countTextTokens("gpt-4o", "Hello, world. This is ZGate.");
    expect(tokens).toBeGreaterThan(0);
  });

  test("counts tokens across chat messages with string and block content", () => {
    // Arrange
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: [{ type: "text", text: "What is the capital of France?" }] },
    ];

    // Act
    const tokens = countTokens("gpt-4o", messages);

    // Assert
    expect(tokens).toBeGreaterThan(0);
  });

  test("counts Claude tokens for claude-prefixed models", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Count my tokens please." }];
    expect(countTokens("claude-4-6-sonnet", messages)).toBeGreaterThan(0);
  });
});
