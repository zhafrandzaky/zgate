import { afterEach, describe, expect, test } from "bun:test";

import { fetchModelsFromProvider, getStaticModels, mergeModels } from "../modelFetcher";
import {
  clearKiroCache,
  expandKiroVariants,
  fetchCompatibleModelIds,
  getLiveResolver,
  resolveKiroModels,
  resolveModels,
  resolveOllamaModels,
} from "../liveModelResolvers";
import { inferModelKind } from "../../utils/modelKind";
import type { ModelKind } from "../../utils/modelKind";
import { getModelCapabilities, getModelKind } from "../../config/modelCapabilities";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  clearKiroCache();
});

/** Install a fetch stub that returns `body` with `status`. */
function stubFetch(status: number, body: unknown, capture?: (url: string) => void): void {
  globalThis.fetch = ((url: string) => {
    capture?.(url);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
}

/** Install a fetch stub that rejects (network/timeout). */
function stubFetchReject(): void {
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
}

// ----------------------------------------------------------------------------
// modelFetcher
// ----------------------------------------------------------------------------

describe("fetchModelsFromProvider", () => {
  test("parses an OpenAI-shaped model list", async () => {
    let calledUrl = "";
    stubFetch(200, { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }, (u) => (calledUrl = u));
    const models = await fetchModelsFromProvider({ provider: "openai", apiKey: "sk" });
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(calledUrl).toBe("https://api.openai.com/v1/models");
  });

  test("substitutes {baseUrl} for templated endpoints (azure)", async () => {
    let calledUrl = "";
    stubFetch(200, { data: [{ id: "dep" }] }, (u) => (calledUrl = u));
    const models = await fetchModelsFromProvider({
      provider: "azure",
      baseUrl: "https://r.openai.azure.com/",
      apiKey: "k",
    });
    expect(models).toEqual(["dep"]);
    expect(calledUrl).toBe("https://r.openai.azure.com/openai/models");
  });

  test("returns [] when a templated endpoint has no base url", async () => {
    const models = await fetchModelsFromProvider({ provider: "azure", apiKey: "k" });
    expect(models).toEqual([]);
  });

  test("returns [] for unknown / non-autofetch providers", async () => {
    expect(await fetchModelsFromProvider({ provider: "cursor", apiKey: "k" })).toEqual([]);
  });

  test("returns [] on a non-2xx response (no throw)", async () => {
    stubFetch(500, { error: "boom" });
    expect(await fetchModelsFromProvider({ provider: "openai", apiKey: "k" })).toEqual([]);
  });

  test("returns [] on a network failure (no throw)", async () => {
    stubFetchReject();
    expect(await fetchModelsFromProvider({ provider: "openai", apiKey: "k" })).toEqual([]);
  });

  test("ollama parses {models:[{name}]}", async () => {
    stubFetch(200, { models: [{ name: "llama3.3" }, { name: "qwen2.5" }] });
    const models = await fetchModelsFromProvider({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
    });
    expect(models).toEqual(["llama3.3", "qwen2.5"]);
  });
});

describe("mergeModels", () => {
  test("fetched first, static fills gaps, custom always included, deduped", () => {
    const merged = mergeModels(["a", "b"], ["b", "c"], ["c", "d"]);
    expect(merged).toEqual(["a", "b", "c", "d"]);
  });

  test("drops empties and preserves order", () => {
    expect(mergeModels(["x", ""], [], ["x", "y"])).toEqual(["x", "y"]);
  });
});

describe("getStaticModels", () => {
  test("returns documented models for deepseek", () => {
    expect(getStaticModels("deepseek")).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });
  test("returns a fresh copy (no shared mutation)", () => {
    const a = getStaticModels("deepseek");
    a.push("mutated");
    expect(getStaticModels("deepseek")).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });
  test("returns [] for providers without a static list", () => {
    expect(getStaticModels("openrouter")).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// liveModelResolvers
// ----------------------------------------------------------------------------

describe("expandKiroVariants", () => {
  test("expands each base into 4 variants", () => {
    expect(expandKiroVariants(["claude-sonnet-4.5"])).toEqual([
      "claude-sonnet-4.5",
      "claude-sonnet-4.5-thinking",
      "claude-sonnet-4.5-agentic",
      "claude-sonnet-4.5-thinking-agentic",
    ]);
  });
});

describe("resolveKiroModels", () => {
  test("falls back to static base list expanded to variants when fetch fails", async () => {
    stubFetchReject();
    const models = await resolveKiroModels({ provider: "kiro", accessToken: "tok" });
    expect(models).toContain("claude-sonnet-4.5");
    expect(models).toContain("claude-sonnet-4.5-thinking-agentic");
    expect(models.length % 4).toBe(0);
  });

  test("caches per credential for 5 minutes (second call does not re-fetch)", async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify({ models: [{ id: "live-model" }] }), { status: 200 }));
    }) as unknown as typeof fetch;

    const first = await resolveKiroModels({ provider: "kiro", accessToken: "cred-1" });
    expect(first).toContain("live-model");
    expect(first).toContain("live-model-thinking");
    await resolveKiroModels({ provider: "kiro", accessToken: "cred-1" });
    expect(calls).toBe(1);
  });
});

describe("resolveOllamaModels", () => {
  test("returns installed model names on success", async () => {
    stubFetch(200, { models: [{ name: "llama3.3" }] });
    expect(await resolveOllamaModels({ provider: "ollama-local" })).toEqual(["llama3.3"]);
  });
  test("falls back to the static list when unreachable", async () => {
    stubFetchReject();
    const models = await resolveOllamaModels({ provider: "ollama-local" });
    expect(models).toEqual(getStaticModels("ollama-local"));
    expect(models.length).toBeGreaterThan(0);
  });
});

describe("fetchCompatibleModelIds", () => {
  test("parses OpenAI data[].id shape", async () => {
    stubFetch(200, { data: [{ id: "m1" }, { id: "m2" }] });
    expect(await fetchCompatibleModelIds("https://node.test", "tok")).toEqual(["m1", "m2"]);
  });
  test("parses Anthropic models[].id shape when data is empty", async () => {
    stubFetch(200, { models: [{ id: "claude-x" }] });
    expect(await fetchCompatibleModelIds("https://node.test", "tok", "anthropic")).toEqual(["claude-x"]);
  });
  test("returns [] when no base url", async () => {
    expect(await fetchCompatibleModelIds(undefined, "tok")).toEqual([]);
  });
  test("returns [] on failure", async () => {
    stubFetchReject();
    expect(await fetchCompatibleModelIds("https://node.test", "tok")).toEqual([]);
  });
});

describe("resolveModels dispatch", () => {
  test("specific resolvers take precedence (kiro, ollama, qoder, compatible)", () => {
    expect(getLiveResolver("kiro")).toBeDefined();
    expect(getLiveResolver("ollama")).toBeDefined();
    expect(getLiveResolver("qoder")).toBeDefined();
    expect(getLiveResolver("compatible")).toBeDefined();
    expect(getLiveResolver("openai")).toBeUndefined();
  });

  test("auto-fetch providers go through modelFetchConfig", async () => {
    stubFetch(200, { data: [{ id: "auto-x" }] });
    expect(await resolveModels({ provider: "openai", apiKey: "k" })).toEqual(["auto-x"]);
  });

  test("static-only providers return their static list", async () => {
    // perplexity has no live resolver and no autofetch config -> static (empty).
    expect(await resolveModels({ provider: "perplexity", apiKey: "k" })).toEqual(
      getStaticModels("perplexity"),
    );
  });
});

// ----------------------------------------------------------------------------
// modelKind + capabilities
// ----------------------------------------------------------------------------

describe("inferModelKind", () => {
  const cases: Array<[string, ModelKind]> = [
    ["text-embedding-3-small", "embedding"],
    ["openai/text-embedding-3-large", "embedding"],
    ["tts-1-hd", "tts"],
    ["gemini-2.5-flash-audio", "tts"],
    ["dall-e-3", "image"],
    ["fal-ai/flux/schnell", "image"],
    ["stable-diffusion-v35-large", "image"],
    ["gpt-4o", "llm"],
    ["claude-opus-4-8", "llm"],
  ];
  for (const [id, kind] of cases) {
    test(`${id} -> ${kind}`, () => {
      expect(inferModelKind(id)).toBe(kind);
    });
  }
});

describe("getModelCapabilities", () => {
  test("explicit embedding capabilities include dimensions", () => {
    const caps = getModelCapabilities("text-embedding-3-small");
    expect(caps.kind).toBe("embedding");
    expect(caps.dimensions).toBe(1536);
  });
  test("deepseek models declare thinking + tools", () => {
    const caps = getModelCapabilities("deepseek/deepseek-v4-flash");
    expect(caps.thinking).toBe(true);
    expect(caps.tools).toBe(true);
  });
  test("unknown LLMs get sensible defaults", () => {
    const caps = getModelCapabilities("some-new-llm");
    expect(caps.kind).toBe("llm");
    expect(caps.tools).toBe(true);
    expect(caps.streaming).toBe(true);
  });
  test("getModelKind matches inference for non-LLM ids", () => {
    expect(getModelKind("whatever-image-gen")).toBe("image");
  });
});
