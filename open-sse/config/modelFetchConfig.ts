/**
 * Auto-fetch model configuration per provider.
 *
 * Maps a provider type to the endpoint, auth header style, optional extra
 * headers, and response parser used to retrieve its live model catalog. The
 * fetch/cache pipeline lives in `open-sse/services/modelFetcher.ts` +
 * `src/lib/modelCache.ts`.
 *
 * Endpoints/response shapes verified against official docs (cited inline). A
 * provider is only added here when its list-models response shape is known;
 * providers we cannot verify keep their static list / dedicated resolver
 * (kiro, qoder, cursor, gemini-cli, antigravity, cline, ...).
 */

export type AuthHeaderStyle = "x-api-key" | "Bearer";

export type ModelFetchConfig = {
  /** Endpoint URL. `{baseUrl}` is substituted with the connection base URL. */
  endpoint: string;
  authHeader: AuthHeaderStyle;
  /** Extract model IDs from the raw provider response. Never throws. */
  parseResponse: (data: unknown) => string[];
  /** Static headers merged onto the request (e.g. OAuth beta header). */
  extraHeaders?: Record<string, string>;
  /** Request timeout in milliseconds (default 5000). */
  timeout?: number;
};

const DEFAULT_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function idsFromArray(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => (isRecord(entry) && typeof entry.id === "string" ? entry.id : null))
    .filter((id): id is string => id !== null);
}

/**
 * OpenAI-compatible models response. Most providers return `{ data: [{ id }] }`
 * (OpenAI: GET /v1/models), but some return a bare top-level array — e.g.
 * Together AI's GET /v1/models returns `[ { id, ... } ]`
 * (https://docs.together.ai/reference/models-1). Handle both.
 */
function parseOpenAiModels(data: unknown): string[] {
  if (Array.isArray(data)) return idsFromArray(data);
  if (isRecord(data) && Array.isArray(data.data)) return idsFromArray(data.data);
  return [];
}

/** Ollama shape: `{ models: [{ name }] }`. */
function parseOllamaModels(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.models)) return [];
  return data.models
    .map((entry) => (isRecord(entry) && typeof entry.name === "string" ? entry.name : null))
    .filter((name): name is string => name !== null);
}

/**
 * Gemini shape: `{ models: [{ name: "models/gemini-..." }] }` — the bare model
 * id is the `name` with the `models/` prefix stripped
 * (https://ai.google.dev/api/models — GET /v1beta/models).
 */
function parseGeminiModels(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.models)) return [];
  return data.models
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.name !== "string") return null;
      return entry.name.startsWith("models/") ? entry.name.slice("models/".length) : entry.name;
    })
    .filter((name): name is string => name !== null);
}

const ANTHROPIC_OAUTH_BETA = "oauth-2025-04-20";

export const modelFetchConfig: Record<string, ModelFetchConfig> = {
  // ── Anthropic ────────────────────────────────────────────────────────────
  // API key (x-api-key) — GET /v1/models (claude-api skill: { data: [{ id }] }).
  anthropic: {
    endpoint: "https://api.anthropic.com/v1/models",
    authHeader: "x-api-key",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  // OAuth (Claude Pro/Max) — same endpoint, Bearer access token + oauth beta
  // header (claude-api skill: OAuth tokens use Authorization: Bearer +
  // anthropic-beta: oauth-2025-04-20). anthropic-version is added by modelFetcher.
  claude: {
    endpoint: "https://api.anthropic.com/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    extraHeaders: { "anthropic-beta": ANTHROPIC_OAUTH_BETA },
    timeout: DEFAULT_TIMEOUT_MS,
  },

  // ── OpenAI-compatible, GET /v1/models -> { data: [{ id }] } ───────────────
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
  // xAI Grok — GET /v1/models (https://docs.x.ai/docs/api-reference#list-models).
  xai: {
    endpoint: "https://api.x.ai/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  // Mistral — GET /v1/models (https://docs.mistral.ai/api/#tag/models).
  mistral: {
    endpoint: "https://api.mistral.ai/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  // Together AI — GET /v1/models returns a top-level array
  // (https://docs.together.ai/reference/models-1); parseOpenAiModels handles it.
  together: {
    endpoint: "https://api.together.xyz/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  // Cerebras — OpenAI-compatible GET /v1/models
  // (https://inference-docs.cerebras.ai/api-reference/models).
  cerebras: {
    endpoint: "https://api.cerebras.ai/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  // NVIDIA NIM — OpenAI-compatible GET /v1/models
  // (https://docs.api.nvidia.com/nim/reference/models).
  nvidia: {
    endpoint: "https://integrate.api.nvidia.com/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  // SiliconFlow — OpenAI-compatible GET /v1/models
  // (https://docs.siliconflow.cn/en/api-reference/models/get-model-list).
  siliconflow: {
    endpoint: "https://api.siliconflow.cn/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  // Vercel AI Gateway — OpenAI-compatible GET /v1/models
  // (https://vercel.com/docs/ai-gateway/openai-compat).
  "vercel-ai-gateway": {
    endpoint: "https://ai-gateway.vercel.sh/v1/models",
    authHeader: "Bearer",
    parseResponse: parseOpenAiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },

  // ── Gemini (OAuth Bearer) — GET /v1beta/models -> { models: [{ name }] } ──
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    authHeader: "Bearer",
    parseResponse: parseGeminiModels,
    timeout: DEFAULT_TIMEOUT_MS,
  },

  // ── Dynamic base URL ──────────────────────────────────────────────────────
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
