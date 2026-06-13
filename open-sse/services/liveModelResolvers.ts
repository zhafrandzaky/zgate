/**
 * Live model resolvers (Addendum 7; docs/ARCHITECTURE.md §12).
 *
 * Some providers return a model list that changes per account/time, so ZGate
 * fetches it live instead of trusting a static list. This module is the registry
 * of those resolvers plus the dispatch policy:
 *
 *   specific resolver (kiro/qoder/ollama/compatible)
 *     > modelFetchConfig auto-fetch (fetchModelsFromProvider)
 *       > static PROVIDER_MODELS list
 *
 * Every resolver is failure-tolerant: it returns a static fallback rather than
 * throwing, so model resolution never breaks a request.
 */

import { supportsAutoFetch } from "@/open-sse/config/modelFetchConfig";
import { getStaticModels } from "@/open-sse/config/providerModels";
import { fetchModelsFromProvider } from "@/open-sse/services/modelFetcher";
import type { FetchConnection } from "@/open-sse/services/modelFetcher";

const FIVE_MINUTES_MS = 5 * 60_000;
const RESOLVER_TIMEOUT_MS = 5000;

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringIds(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (isRecord(entry)) {
        if (typeof entry.id === "string") return entry.id;
        if (typeof entry.name === "string") return entry.name;
      }
      return null;
    })
    .filter((id): id is string => id !== null);
}

// ----------------------------------------------------------------------------
// Kiro — AWS CodeWhisperer ListAvailableModels, expand to 4 variants
// ----------------------------------------------------------------------------

const KIRO_BASE_FALLBACK = [
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "deepseek-3.2",
  "qwen3-coder-next",
  "glm-5",
  "MiniMax-M2.5",
];

const KIRO_VARIANT_SUFFIXES = ["", "-thinking", "-agentic", "-thinking-agentic"];

/** Expand each base model into base + thinking + agentic + thinking-agentic. */
export function expandKiroVariants(baseModels: readonly string[]): string[] {
  const out: string[] = [];
  for (const model of baseModels) {
    for (const suffix of KIRO_VARIANT_SUFFIXES) out.push(`${model}${suffix}`);
  }
  return out;
}

interface CacheEntry {
  models: string[];
  at: number;
}

/** Per-credential 5-minute cache (Addendum 7). Keyed by access token. */
const kiroCache = new Map<string, CacheEntry>();

async function fetchKiroBaseModels(connection: FetchConnection): Promise<string[]> {
  const token = connection.accessToken ?? connection.apiKey;
  if (!token) return [];
  const base = connection.baseUrl?.trim() || "https://codewhisperer.us-east-1.amazonaws.com";
  try {
    const response = await fetch(`${trimTrailingSlash(base)}/ListAvailableModels`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (isRecord(data)) {
      const ids = stringIds(data.models ?? data.availableModels);
      if (ids.length > 0) return ids;
    }
    return [];
  } catch {
    return [];
  }
}

/** Resolve Kiro models live (cached 5min/credential), expanded to 4 variants. */
export async function resolveKiroModels(connection: FetchConnection): Promise<string[]> {
  const cacheKey = connection.accessToken ?? connection.apiKey ?? connection.provider;
  const cached = kiroCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FIVE_MINUTES_MS) return [...cached.models];

  const baseModels = await fetchKiroBaseModels(connection);
  const effectiveBase = baseModels.length > 0 ? baseModels : KIRO_BASE_FALLBACK;
  const expanded = expandKiroVariants(effectiveBase);
  kiroCache.set(cacheKey, { models: expanded, at: Date.now() });
  return [...expanded];
}

/** Test/maintenance hook: drop all cached Kiro catalogs. */
export function clearKiroCache(): void {
  kiroCache.clear();
}

// ----------------------------------------------------------------------------
// Qoder — dynamic per-account model list
// ----------------------------------------------------------------------------

export async function resolveQoderModels(connection: FetchConnection): Promise<string[]> {
  const token = connection.apiKey ?? connection.accessToken;
  const base = connection.baseUrl?.trim() || "https://api3.qoder.sh";
  if (token) {
    try {
      const response = await fetch(`${trimTrailingSlash(base)}/algo/api/v2/models`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
      });
      if (response.ok) {
        const data: unknown = await response.json();
        const ids = isRecord(data) ? stringIds(data.data ?? data.models) : [];
        if (ids.length > 0) return ids;
      }
    } catch {
      // fall through to static
    }
  }
  return getStaticModels("qoder");
}

// ----------------------------------------------------------------------------
// Ollama — GET {baseUrl}/api/tags
// ----------------------------------------------------------------------------

/**
 * Resolve installed Ollama models. Returns bare model names (the resolution
 * pipeline prefixes them to `ollama/{name}`). Falls back to the static list when
 * the daemon is unreachable.
 */
export async function resolveOllamaModels(connection: FetchConnection): Promise<string[]> {
  const base =
    connection.baseUrl?.trim() ||
    (connection.provider === "ollama-local" ? "http://localhost:11434" : "https://ollama.com");
  try {
    const response = await fetch(`${trimTrailingSlash(base)}/api/tags`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
    });
    if (response.ok) {
      const data: unknown = await response.json();
      const names = isRecord(data) ? stringIds(data.models) : [];
      if (names.length > 0) return names;
    }
  } catch {
    // fall through to static
  }
  return getStaticModels(connection.provider);
}

// ----------------------------------------------------------------------------
// Compatible node — GET {baseUrl}/v1/models (OpenAI or Anthropic shape)
// ----------------------------------------------------------------------------

/**
 * Fetch model ids from a custom OpenAI/Anthropic-compatible node. Tries both
 * response shapes (`data[].id` and `models[].id`). Timeout 5s, fails gracefully
 * to `[]`.
 */
export async function fetchCompatibleModelIds(
  baseUrl: string | null | undefined,
  token?: string,
  format: "openai" | "anthropic" = "openai",
): Promise<string[]> {
  const base = baseUrl?.trim();
  if (!base) return [];
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) {
    if (format === "anthropic") {
      headers["x-api-key"] = token;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.authorization = `Bearer ${token}`;
    }
  }
  try {
    const response = await fetch(`${trimTrailingSlash(base)}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!isRecord(data)) return [];
    const fromData = stringIds(data.data);
    if (fromData.length > 0) return fromData;
    return stringIds(data.models);
  } catch {
    return [];
  }
}

async function resolveCompatibleModels(connection: FetchConnection): Promise<string[]> {
  const token = connection.apiKey ?? connection.accessToken ?? undefined;
  return fetchCompatibleModelIds(connection.baseUrl, token, "openai");
}

// ----------------------------------------------------------------------------
// Registry & dispatch
// ----------------------------------------------------------------------------

export type LiveResolver = (connection: FetchConnection) => Promise<string[]>;

/** Provider-specific resolvers (Addendum 7). Override modelFetchConfig. */
const specificResolvers: Record<string, LiveResolver> = {
  kiro: resolveKiroModels,
  qoder: resolveQoderModels,
  ollama: resolveOllamaModels,
  "ollama-local": resolveOllamaModels,
  compatible: resolveCompatibleModels,
};

/** The specific resolver for a provider, if one exists. */
export function getLiveResolver(provider: string): LiveResolver | undefined {
  return specificResolvers[provider];
}

/**
 * Resolve the live (or fallback) model list for a connection following the
 * documented priority: specific resolver > auto-fetch config > static list.
 * Never throws.
 */
export async function resolveModels(connection: FetchConnection): Promise<string[]> {
  const specific = specificResolvers[connection.provider];
  if (specific) return specific(connection);
  if (supportsAutoFetch(connection.provider)) return fetchModelsFromProvider(connection);
  return getStaticModels(connection.provider);
}
