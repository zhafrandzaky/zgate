import { afterEach, describe, expect, test } from "bun:test";

import {
  getExecutor,
  hasExecutor,
  registeredProviders,
  resolveExecutor,
  FallbackCategory,
  shouldRetrySameConnection,
} from "../index";
import { DefaultExecutor } from "../default";
import { DeepSeekExecutor, deepseekCostUsd } from "../deepseek";
import { Format } from "../../translator/formats";
import type {
  ExecutorRequest,
  NormalizedUsage,
  ResolvedConnection,
  ResolvedCredentials,
} from "../base";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function connection(
  provider: string,
  credentials: ResolvedCredentials = {},
  overrides: Partial<ResolvedConnection> = {},
): ResolvedConnection {
  return {
    provider,
    authType: "apikey",
    baseUrl: null,
    credentials,
    metadata: null,
    ...overrides,
  };
}

function request(conn: ResolvedConnection, overrides: Partial<ExecutorRequest> = {}): ExecutorRequest {
  return {
    connection: conn,
    model: "test-model",
    body: { model: "test-model", messages: [] },
    stream: false,
    ...overrides,
  };
}

// global fetch is swapped per-test for execute() assertions.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

describe("executor registry", () => {
  test("covers the documented provider surface", () => {
    const providers = registeredProviders();
    // A representative sample across every category.
    for (const provider of [
      "openai",
      "deepseek",
      "anthropic",
      "claude",
      "kiro",
      "codex",
      "cursor",
      "github",
      "gemini",
      "gemini-cli",
      "vertex",
      "antigravity",
      "azure",
      "qwen",
      "iflow",
      "ollama",
      "ollama-local",
      "opencode",
      "opencode-go",
      "grok-web",
      "perplexity-web",
      "qoder",
      "commandcode",
      "xiaomi-tokenplan",
    ]) {
      expect(providers).toContain(provider);
      expect(hasExecutor(provider)).toBe(true);
    }
    expect(providers.length).toBeGreaterThan(70);
  });

  test("specialized classes win over the endpoint table", () => {
    expect(getExecutor("deepseek")).toBeInstanceOf(DeepSeekExecutor);
    // openai stays a DefaultExecutor (table-driven).
    expect(getExecutor("openai")).toBeInstanceOf(DefaultExecutor);
  });

  test("unknown provider has no registered executor", () => {
    expect(getExecutor("does-not-exist")).toBeUndefined();
    expect(hasExecutor("does-not-exist")).toBe(false);
  });

  test("resolveExecutor falls back to a compatible DefaultExecutor", () => {
    const openaiNode = resolveExecutor("my-vllm");
    expect(openaiNode).toBeInstanceOf(DefaultExecutor);
    expect(openaiNode.format).toBe(Format.OpenAI);

    const anthropicNode = resolveExecutor("my-anthropic", "anthropic");
    expect(anthropicNode.format).toBe(Format.Claude);

    const url = anthropicNode.buildUrl(
      request(connection("my-anthropic", { apiKey: "k" }, { baseUrl: "https://node.test" })),
    );
    expect(url).toBe("https://node.test/v1/messages");
  });
});

// ----------------------------------------------------------------------------
// DefaultExecutor behavior
// ----------------------------------------------------------------------------

describe("DefaultExecutor", () => {
  test("builds a fixed endpoint and Bearer auth", () => {
    const ex = getExecutor("openai")!;
    const req = request(connection("openai", { apiKey: "sk-test" }));
    expect(ex.buildUrl(req)).toBe("https://api.openai.com/v1/chat/completions");
    expect(ex.buildHeaders(req).authorization).toBe("Bearer sk-test");
    expect(ex.buildHeaders(req)["content-type"]).toBe("application/json");
  });

  test("OAuth providers prefer the access token", () => {
    const ex = getExecutor("qwen")!;
    expect(ex.isOAuth).toBe(true);
    const req = request(connection("qwen", { accessToken: "at", apiKey: "ak" }, { authType: "oauth" }));
    expect(ex.buildUrl(req)).toBe("https://portal.qwen.ai/v1/chat/completions");
    expect(ex.buildHeaders(req).authorization).toBe("Bearer at");
  });

  test("X-API-Key auth style (enally)", () => {
    const ex = getExecutor("enally")!;
    const headers = ex.buildHeaders(request(connection("enally", { apiKey: "x" })));
    expect(headers["X-API-Key"]).toBe("x");
    expect(headers.authorization).toBeUndefined();
  });

  test("no-auth providers attach extra headers only", () => {
    const ex = getExecutor("opencode")!;
    const headers = ex.buildHeaders(request(connection("opencode")));
    expect(headers["x-opencode-client"]).toBe("desktop");
    expect(headers.authorization).toBeUndefined();
  });

  test("anthropic uses x-api-key + anthropic-version and anthropic usage shape", () => {
    const ex = getExecutor("anthropic")!;
    expect(ex.format).toBe(Format.Claude);
    const headers = ex.buildHeaders(request(connection("anthropic", { apiKey: "sk-ant" })));
    expect(headers["x-api-key"]).toBe("sk-ant");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const usage = ex.extractUsage({ usage: { input_tokens: 10, output_tokens: 5 } });
    expect(usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  test("missing credentials yield no auth header (clean 401 -> auth fallback)", () => {
    const ex = getExecutor("openai")!;
    const headers = ex.buildHeaders(request(connection("openai", {})));
    expect(headers.authorization).toBeUndefined();
  });

  test("{baseUrl} template requires a base url", () => {
    const ex = getExecutor("cloudflare-ai")!;
    expect(() => ex.buildUrl(request(connection("cloudflare-ai", { apiKey: "k" })))).toThrow();
    const url = ex.buildUrl(
      request(connection("cloudflare-ai", { apiKey: "k" }, { baseUrl: "https://cf/acc/123/" })),
    );
    expect(url).toBe("https://cf/acc/123/ai/v1/chat/completions");
  });
});

// ----------------------------------------------------------------------------
// Error mapping
// ----------------------------------------------------------------------------

describe("error mapping", () => {
  const ex = getExecutor("openai")!;
  const cases: Array<[number, FallbackCategory]> = [
    [200, FallbackCategory.None],
    [400, FallbackCategory.Invalid],
    [401, FallbackCategory.Auth],
    [402, FallbackCategory.Payment],
    [403, FallbackCategory.Auth],
    [422, FallbackCategory.Invalid],
    [429, FallbackCategory.RateLimit],
    [500, FallbackCategory.Server],
    [503, FallbackCategory.Overloaded],
    [418, FallbackCategory.Unknown],
  ];
  for (const [status, expected] of cases) {
    test(`status ${status} -> ${expected}`, () => {
      expect(ex.mapError(status)).toBe(expected);
    });
  }

  test("only server errors retry the same connection", () => {
    expect(shouldRetrySameConnection(FallbackCategory.Server)).toBe(true);
    expect(shouldRetrySameConnection(FallbackCategory.RateLimit)).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// DeepSeek
// ----------------------------------------------------------------------------

describe("DeepSeekExecutor", () => {
  const ex = new DeepSeekExecutor();

  test("fixed endpoint + bearer auth", () => {
    const req = request(connection("deepseek", { apiKey: "sk-ds" }));
    expect(ex.buildUrl()).toBe("https://api.deepseek.com/chat/completions");
    expect(ex.buildHeaders(req).authorization).toBe("Bearer sk-ds");
    expect(ex.format).toBe(Format.OpenAI);
  });

  test("extracts reasoning + cached token details", () => {
    const usage = ex.extractUsage({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
        completion_tokens_details: { reasoning_tokens: 12 },
        prompt_tokens_details: { cached_tokens: 30 },
      },
    });
    expect(usage).toEqual({
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
      reasoningTokens: 12,
      cachedTokens: 30,
    });
  });

  test("pricing-aware cost (flash vs pro)", () => {
    const usage: NormalizedUsage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 };
    expect(deepseekCostUsd("deepseek-v4-flash", usage)).toBeCloseTo(0.14 + 0.28, 6);
    expect(deepseekCostUsd("deepseek/deepseek-v4-pro", usage)).toBeCloseTo(0.435 + 0.87, 6);
    expect(deepseekCostUsd("unknown-model", usage)).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// Specialized URL / header building
// ----------------------------------------------------------------------------

describe("specialized executors", () => {
  test("kiro: CodeWhisperer endpoint, OAuth bearer, kiro format", () => {
    const ex = getExecutor("kiro")!;
    expect(ex.format).toBe(Format.Kiro);
    expect(ex.isOAuth).toBe(true);
    const req = request(connection("kiro", { accessToken: "tok" }, { authType: "oauth" }));
    expect(ex.buildUrl(req)).toBe(
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
    );
    expect(ex.buildHeaders(req).authorization).toBe("Bearer tok");
  });

  test("codex: responses format + beta header", () => {
    const ex = getExecutor("codex")!;
    expect(ex.format).toBe(Format.OpenAIResponses);
    const headers = ex.buildHeaders(
      request(connection("codex", { accessToken: "t", providerSpecificData: { accountId: "acc" } })),
    );
    expect(headers["openai-beta"]).toBe("responses=experimental");
    expect(headers["chatgpt-account-id"]).toBe("acc");
  });

  test("cursor: connect transport headers + client version", () => {
    const ex = getExecutor("cursor")!;
    expect(ex.format).toBe(Format.Cursor);
    const req = request(connection("cursor", { accessToken: "t" }));
    expect(ex.buildUrl(req)).toBe(
      "https://api2.cursor.sh/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    );
    const headers = ex.buildHeaders(req);
    expect(headers["connect-protocol-version"]).toBe("1");
    expect(headers["x-cursor-client-version"]).toBe("3.1.0");
  });

  test("github copilot: integration headers", () => {
    const ex = getExecutor("github")!;
    const headers = ex.buildHeaders(request(connection("github", { accessToken: "t" })));
    expect(headers["copilot-integration-id"]).toBe("vscode-chat");
    expect(headers.authorization).toBe("Bearer t");
  });

  test("gemini: API-key auth uses query param, OAuth uses bearer", () => {
    const ex = getExecutor("gemini")!;
    const apiKeyUrl = ex.buildUrl(
      request(connection("gemini", { apiKey: "KEY" }), { model: "gemini-3-pro", stream: false }),
    );
    expect(apiKeyUrl).toContain("/gemini-3-pro:generateContent");
    expect(apiKeyUrl).toContain("key=KEY");

    const oauthReq = request(connection("gemini", { accessToken: "AT" }), { stream: true });
    const oauthUrl = ex.buildUrl(oauthReq);
    expect(oauthUrl).toContain(":streamGenerateContent");
    expect(oauthUrl).not.toContain("key=");
    expect(ex.buildHeaders(oauthReq).authorization).toBe("Bearer AT");
  });

  test("gemini usage extractor reads usageMetadata", () => {
    const ex = getExecutor("gemini")!;
    const usage = ex.extractUsage({
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 },
    });
    expect(usage).toEqual({ promptTokens: 8, completionTokens: 4, totalTokens: 12 });
  });

  test("vertex: builds project/region URL, requires projectId", () => {
    const ex = getExecutor("vertex")!;
    const req = request(
      connection("vertex", {
        accessToken: "t",
        providerSpecificData: { projectId: "proj", region: "us-central1" },
      }),
      { model: "gemini-2.5-pro" },
    );
    expect(ex.buildUrl(req)).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/proj/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent",
    );
    expect(() => ex.buildUrl(request(connection("vertex", { accessToken: "t" })))).toThrow();
  });

  test("antigravity: routes sandbox models to the sandbox host", () => {
    const ex = getExecutor("antigravity")!;
    const daily = ex.buildUrl(request(connection("antigravity", { accessToken: "t" }), { model: "gemini-3-flash" }));
    expect(daily).toContain("daily-cloudcode-pa.googleapis.com");
    const sandbox = ex.buildUrl(
      request(connection("antigravity", { accessToken: "t" }), { model: "sandbox-model" }),
    );
    expect(sandbox).toContain("sandbox-cloudcode-pa.googleapis.com");
  });

  test("azure: deployment URL + api-key header", () => {
    const ex = getExecutor("azure")!;
    const req = request(
      connection(
        "azure",
        { apiKey: "az", providerSpecificData: { deployment: "gpt4o", apiVersion: "2024-10-21" } },
        { baseUrl: "https://my.openai.azure.com" },
      ),
    );
    expect(ex.buildUrl(req)).toBe(
      "https://my.openai.azure.com/openai/deployments/gpt4o/chat/completions?api-version=2024-10-21",
    );
    expect(ex.buildHeaders(req)["api-key"]).toBe("az");
  });

  test("qoder: custom signing headers", () => {
    const ex = getExecutor("qoder")!;
    const headers = ex.buildHeaders(
      request(connection("qoder", { apiKey: "k", providerSpecificData: { signature: "sig" } })),
    );
    expect(headers.authorization).toBe("Bearer k");
    expect(headers["x-qoder-signature"]).toBe("sig");
  });

  test("commandcode: anthropic-compatible against user base url", () => {
    const ex = getExecutor("commandcode")!;
    const req = request(connection("commandcode", { apiKey: "k" }, { baseUrl: "https://cc.test" }));
    expect(ex.buildUrl(req)).toBe("https://cc.test/v1/messages");
    expect(ex.buildHeaders(req)["x-api-key"]).toBe("k");
    expect(ex.buildHeaders(req)["anthropic-version"]).toBe("2023-06-01");
  });

  test("ollama-local: localhost default + ollama format + no auth", () => {
    const ex = getExecutor("ollama-local")!;
    expect(ex.format).toBe(Format.Ollama);
    expect(ex.buildUrl(request(connection("ollama-local")))).toBe("http://localhost:11434/api/chat");
    expect(ex.buildHeaders(request(connection("ollama-local"))).authorization).toBeUndefined();
    const usage = ex.extractUsage({ prompt_eval_count: 5, eval_count: 7 });
    expect(usage).toEqual({ promptTokens: 5, completionTokens: 7, totalTokens: 12 });
  });

  test("web-reverse: cookie auth, 403 maps to auth (expired cookie)", () => {
    const ex = getExecutor("grok-web")!;
    const headers = ex.buildHeaders(request(connection("grok-web", { cookie: "session=abc" }, { authType: "cookie" })));
    expect(headers.cookie).toBe("session=abc");
    expect(ex.mapError(403)).toBe(FallbackCategory.Auth);
  });
});

// ----------------------------------------------------------------------------
// execute() — mocked HTTP
// ----------------------------------------------------------------------------

describe("execute (mocked fetch)", () => {
  test("posts the prepared request to the provider", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = ((url: string, init: RequestInit) => {
      seen.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as unknown as typeof fetch;

    const ex = getExecutor("openai")!;
    const response = await ex.execute(
      request(connection("openai", { apiKey: "sk" }), { body: { model: "m", messages: [] } }),
    );

    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(seen[0]!.init.method).toBe("POST");
    const headers = seen[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk");
    expect(seen[0]!.init.body).toBe(JSON.stringify({ model: "m", messages: [] }));
  });
});
