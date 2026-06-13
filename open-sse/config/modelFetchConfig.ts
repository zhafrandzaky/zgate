/**
 * Auto-fetch model configuration per provider.
 *
 * Maps a provider type to the endpoint, auth header style, and response parser
 * used to retrieve its live model catalog. Full fetch/cache pipeline lives in
 * TASK-006 (`open-sse/services/modelFetcher.ts`, `src/lib/modelCache.ts`).
 *
 * Providers NOT listed here use a static model list or have a dedicated live
 * resolver (kiro, qoder, cursor, vertex, gemini-cli, antigravity, ...).
 */

export type AuthHeaderStyle = "x-api-key" | "Bearer";

export type ModelFetchConfig = {
  /** Endpoint URL. `{baseUrl}` is substituted with the connection base URL. */
  endpoint: string;
  authHeader: AuthHeaderStyle;
  /** Extract model IDs from the raw provider response. Never throws. */
  parseResponse: (data: unknown) => string[];
  /** Request timeout in milliseconds (default 5000). */
  timeout?: number;
};

const DEFAULT_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** OpenAI-compatible shape: `{ data: [{ id }] }`. */
function parseOpenAiModels(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.data)) return [];
  return data.data
    .map((entry) => (isRecord(entry) && typeof entry.id === "string" ? entry.id : null))
    .filter((id): id is string => id !== null);
}

/** Ollama shape: `{ models: [{ name }] }`. */
function parseOllamaModels(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.models)) return [];
  return data.models
    .map((entry) => (isRecord(entry) && typeof entry.name === "string" ? entry.name : null))
    .filter((name): name is string => name !== null);
}

export const modelFetchConfig: Record<string, ModelFetchConfig> = {
  anthropic: {
    endpoint: "https://api.anthropic.com/v1/models",
    authHeader: "x-api-key",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  openai: {
    endpoint: "https://api.openai.com/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  groq: {
    endpoint: "https://api.groq.com/openai/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  azure: {
    endpoint: "{baseUrl}/openai/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  ollama: {
    endpoint: "{baseUrl}/api/tags",
    authHeader: "Bearer",
    parseResponse: parseOllamaModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  compatible: {
    endpoint: "{baseUrl}/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
};

/** Whether a provider supports live auto-fetch of its model catalog. */
export function supportsAutoFetch(provider: string): boolean {
  return provider in modelFetchConfig;
}

export function getModelFetchConfig(provider: string): ModelFetchConfig | undefined {
  return modelFetchConfig[provider];
}
