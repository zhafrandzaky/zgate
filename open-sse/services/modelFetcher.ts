/**
 * Live model fetching (TASK-006 "Auto-fetch Model System", deliverable 2).
 *
 * Hits a provider's model-list endpoint with the connection's credentials and
 * returns the model ids it advertises. The hard contract: this NEVER throws. On
 * any failure — missing config, missing baseUrl, timeout, non-2xx, malformed
 * body — it returns `[]` and the caller falls back to the static list.
 *
 * Executors are not involved: model discovery is a plain GET against a small
 * per-provider config table (`config/modelFetchConfig.ts`), independent of the
 * chat wire format.
 */

import { getModelFetchConfig } from "@/open-sse/config/modelFetchConfig";
import { getStaticModels } from "@/open-sse/config/providerModels";

const DEFAULT_TIMEOUT_MS = 5000;
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Minimal connection shape needed to fetch models. The Prisma
 * `ProviderConnection` is structurally compatible; the services layer passes a
 * connection whose `apiKey`/`accessToken` have already been decrypted.
 */
export interface FetchConnection {
  provider: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  accessToken?: string | null;
}

function warn(provider: string, message: string): void {
  console.warn(`[modelFetcher:${provider}] ${message}`);
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveEndpoint(template: string, baseUrl?: string | null): string | null {
  if (!template.includes("{baseUrl}")) return template;
  const base = baseUrl?.trim();
  if (!base) return null;
  return template.replace("{baseUrl}", trimTrailingSlash(base));
}

/**
 * Fetch the live model catalog for a connection. Returns `[]` on any failure.
 */
export async function fetchModelsFromProvider(connection: FetchConnection): Promise<string[]> {
  const config = getModelFetchConfig(connection.provider);
  if (!config) return [];

  const url = resolveEndpoint(config.endpoint, connection.baseUrl);
  if (!url) {
    warn(connection.provider, "baseUrl required but missing — using static fallback");
    return [];
  }

  const token = connection.apiKey ?? connection.accessToken ?? undefined;
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) {
    if (config.authHeader === "x-api-key") headers["x-api-key"] = token;
    else headers.authorization = `Bearer ${token}`;
  }
  // Anthropic's /v1/models requires a version header.
  if (connection.provider === "anthropic" || connection.provider === "claude") {
    headers["anthropic-version"] = ANTHROPIC_VERSION;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      warn(connection.provider, `HTTP ${response.status} — using static fallback`);
      return [];
    }
    const data: unknown = await response.json();
    return config.parseResponse(data);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(connection.provider, `fetch failed (${reason}) — using static fallback`);
    return [];
  }
}

export { getStaticModels };

/**
 * Merge model lists into the final catalog for a connection.
 *
 * Priority: fetched models first (live truth), then any static models not
 * already present (fallback coverage for what a live fetch may omit), then
 * custom models (always included). Order is preserved and the result is
 * de-duplicated.
 */
export function mergeModels(
  fetched: readonly string[],
  staticModels: readonly string[],
  custom: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of [fetched, staticModels, custom]) {
    for (const model of list) {
      if (!model || seen.has(model)) continue;
      seen.add(model);
      result.push(model);
    }
  }
  return result;
}
