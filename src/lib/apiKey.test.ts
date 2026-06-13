import { expect, test, describe } from "bun:test";
import {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  timingSafeHexEqual,
  extractBearerKey,
  API_KEY_PREFIX,
} from "@/src/lib/apiKey";

describe("apiKey", () => {
  test("generates a key with the sk-zg- prefix and a matching prefix/hash", () => {
    // Act
    const generated = generateApiKey();

    // Assert
    expect(generated.key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(generated.keyPrefix.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(isValidApiKeyFormat(generated.key)).toBe(true);
    expect(generated.keyHash).toBe(hashApiKey(generated.key));
  });

  test("HMAC hash is deterministic for the same key", () => {
    const { key } = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  test("different keys produce different hashes", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(hashApiKey(a.key)).not.toBe(hashApiKey(b.key));
  });

  test("rejects keys without the correct prefix or charset", () => {
    expect(isValidApiKeyFormat("sk-openai-abcdef")).toBe(false);
    expect(isValidApiKeyFormat("sk-zg-short")).toBe(false);
    expect(isValidApiKeyFormat(`${API_KEY_PREFIX}${"!".repeat(43)}`)).toBe(false);
  });

  test("timing-safe hex compare matches equal digests and rejects others", () => {
    const hash = hashApiKey(generateApiKey().key);
    expect(timingSafeHexEqual(hash, hash)).toBe(true);
    expect(timingSafeHexEqual(hash, hash.slice(0, -1) + "0")).toBe(false);
    expect(timingSafeHexEqual(hash, "abc")).toBe(false);
  });

  test("extracts a bearer key from an Authorization header", () => {
    const { key } = generateApiKey();
    expect(extractBearerKey(`Bearer ${key}`)).toBe(key);
    expect(extractBearerKey(`bearer ${key}`)).toBe(key);
    expect(extractBearerKey(null)).toBeNull();
    expect(extractBearerKey("Basic abc")).toBeNull();
  });
});
