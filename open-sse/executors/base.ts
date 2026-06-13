/**
 * Provider executor foundation.
 *
 * An executor is the thin, stateless adapter between ZGate's chat core
 * (TASK-007) and one upstream provider's HTTP surface. It does NOT touch the
 * database — the services layer resolves a connection, decrypts its credentials,
 * and hands the executor a ready-to-use {@link ResolvedConnection}. Keeping all
 * DB access out of executors is what keeps multi-user isolation enforced in a
 * single place (AGENTS.md §5).
 *
 * Every executor declares four things (TASK-006 notes):
 *   1. the wire `format` (so the translator knows how to encode/decode),
 *   2. an auth-header builder,
 *   3. an error mapper (HTTP status -> fallback trigger category),
 *   4. a usage extractor.
 *
 * The base class ships sensible OpenAI-shaped defaults for (3) and (4) and a
 * generic `prepareRequest`/`execute` so most providers need only override
 * `buildUrl` and `buildAuthHeaders`.
 */

import { Format } from "@/open-sse/translator/formats";

// ----------------------------------------------------------------------------
// Fallback categories — how the combo/fallback engine should react to an error
// ----------------------------------------------------------------------------

/**
 * Maps an upstream failure onto the action the fallback engine should take
 * (docs/ARCHITECTURE.md §11, docs/PROVIDERS.md deepseek error table).
 */
export const FallbackCategory = {
  /** Request succeeded; no fallback needed. */
  None: "none",
  /** 401/403 — token or key invalid/expired. Try OAuth refresh, then fallback. */
  Auth: "auth",
  /** 402 — out of credit/balance. Skip this connection, notify, fallback. */
  Payment: "payment",
  /** 400/422 — malformed/invalid request. No retry, fallback to next model. */
  Invalid: "invalid",
  /** 429 — rate limited. Round-robin accounts + exponential backoff. */
  RateLimit: "rate_limit",
  /** 500 — transient server error. Retry once, then fallback. */
  Server: "server",
  /** 503 — overloaded. Fallback immediately, no retry. */
  Overloaded: "overloaded",
  /** Anything unclassified (incl. network/TCP). Fallback. */
  Unknown: "unknown",
} as const;

export type FallbackCategory = (typeof FallbackCategory)[keyof typeof FallbackCategory];

/** Whether a category should be retried on the same connection before fallback. */
export function shouldRetrySameConnection(category: FallbackCategory): boolean {
  return category === FallbackCategory.Server;
}

// ----------------------------------------------------------------------------
// Connection & credentials (provided by the services layer, already decrypted)
// ----------------------------------------------------------------------------

export type AuthType = "oauth" | "apikey" | "cookie" | "none";

/**
 * Decrypted credential material. The services layer fills only the fields the
 * provider needs; executors must tolerate missing fields and fail with a clear
 * category rather than throwing.
 */
export interface ResolvedCredentials {
  /** API-key providers (Bearer / x-api-key / X-API-Key). */
  apiKey?: string;
  /** OAuth providers — short-lived access token. */
  accessToken?: string;
  /** OAuth refresh token (used by the token-refresh hook). */
  refreshToken?: string;
  /** Cookie-auth web providers (grok-web, perplexity-web). */
  cookie?: string;
  /** Vertex service-account JSON (parsed). */
  serviceAccount?: Record<string, unknown>;
  /**
   * Per-provider extras that don't fit the common slots: Azure deployment +
   * api-version, Cloudflare accountId, xiaomi region, etc.
   */
  providerSpecificData?: Record<string, unknown>;
}

export interface ResolvedConnection {
  /** Provider id, e.g. "openai", "deepseek", "kiro". */
  provider: string;
  authType: AuthType;
  /** Provider base URL (used by providers with a dynamic/self-hosted endpoint). */
  baseUrl?: string | null;
  credentials: ResolvedCredentials;
  /** Per-connection settings (caveman mode, etc.). */
  metadata?: Record<string, unknown> | null;
}

// ----------------------------------------------------------------------------
// OAuth token refresh hook (implemented by tokenRefresh.ts — TASK-007)
// ----------------------------------------------------------------------------

/**
 * Refreshes an OAuth connection's access token and returns the new token.
 * Executors call this on an {@link FallbackCategory.Auth} response before
 * giving up, so a transparent retry can re-send with a fresh token.
 */
export type TokenRefreshHook = (connection: ResolvedConnection) => Promise<string>;

// ----------------------------------------------------------------------------
// Request / response shapes
// ----------------------------------------------------------------------------

export interface ExecutorRequest {
  connection: ResolvedConnection;
  /** Bare model id with the provider prefix already stripped. */
  model: string;
  /** Provider-wire body produced by the translator (encodeProviderRequest). */
  body: unknown;
  stream: boolean;
  /** Abort signal wired to the client connection / fallback controller. */
  signal?: AbortSignal;
  /** Extra headers merged last (e.g. memory/working-dir passthrough). */
  extraHeaders?: Record<string, string>;
  /** OAuth refresh hook; present only for OAuth connections. */
  onTokenRefresh?: TokenRefreshHook;
}

export interface PreparedRequest {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  /** Serialized request body. */
  body: string;
}

/** Normalized usage, independent of provider response shape. */
export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedTokens?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ----------------------------------------------------------------------------
// BaseExecutor
// ----------------------------------------------------------------------------

export abstract class BaseExecutor {
  /** Provider id this executor handles. */
  abstract readonly provider: string;
  /** Wire format the translator should encode requests into / decode from. */
  abstract readonly format: Format;

  /**
   * Whether this provider authenticates via OAuth. Drives whether the chat core
   * wires up the {@link TokenRefreshHook} and treats `auth` errors as
   * refresh-then-retry rather than hard fallback.
   */
  get isOAuth(): boolean {
    return false;
  }

  /** Full request timeout in ms. Overridable per provider. */
  get requestTimeoutMs(): number {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** Absolute URL to POST the chat request to. */
  abstract buildUrl(req: ExecutorRequest): string;

  /**
   * Provider-specific auth headers. Implementations read from
   * `req.connection.credentials` and must not throw on missing material — return
   * an empty object and let the upstream 401 drive a clean `auth` fallback.
   */
  abstract buildAuthHeaders(req: ExecutorRequest): Record<string, string>;

  /** Default content-type / accept headers shared by most providers. */
  protected baseHeaders(req: ExecutorRequest): Record<string, string> {
    return {
      "content-type": "application/json",
      accept: req.stream ? "text/event-stream" : "application/json",
    };
  }

  /** Merge base + auth + per-request extra headers (extra wins). */
  buildHeaders(req: ExecutorRequest): Record<string, string> {
    return {
      ...this.baseHeaders(req),
      ...this.buildAuthHeaders(req),
      ...(req.extraHeaders ?? {}),
    };
  }

  /** Assemble the full HTTP request without sending it. */
  prepareRequest(req: ExecutorRequest): PreparedRequest {
    return {
      url: this.buildUrl(req),
      method: "POST",
      headers: this.buildHeaders(req),
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body),
    };
  }

  /**
   * Send the request and return the raw `Response`. Streaming is handled by the
   * caller (chatCore) reading `response.body`. Times out via an internal
   * `AbortSignal` combined with any caller-supplied signal.
   */
  async execute(req: ExecutorRequest): Promise<Response> {
    const prepared = this.prepareRequest(req);
    const signal = this.combineSignals(req.signal);
    return fetch(prepared.url, {
      method: prepared.method,
      headers: prepared.headers,
      body: prepared.body,
      signal,
    });
  }

  /** Combine the caller signal with a per-request timeout signal. */
  protected combineSignals(external?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(this.requestTimeoutMs);
    if (!external) return timeout;
    // AbortSignal.any is available on Bun/Node 20+; fall back to the timeout.
    const anyFn = (
      AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }
    ).any;
    return anyFn ? anyFn([external, timeout]) : external;
  }

  /**
   * Map an HTTP status to a fallback category. Override for providers with
   * non-standard semantics; the default covers the OpenAI/DeepSeek table.
   */
  mapError(status: number, _body?: unknown): FallbackCategory {
    if (status >= 200 && status < 300) return FallbackCategory.None;
    switch (status) {
      case 400:
      case 422:
        return FallbackCategory.Invalid;
      case 401:
      case 403:
        return FallbackCategory.Auth;
      case 402:
        return FallbackCategory.Payment;
      case 429:
        return FallbackCategory.RateLimit;
      case 500:
        return FallbackCategory.Server;
      case 502:
      case 503:
      case 504:
        return FallbackCategory.Overloaded;
      default:
        return status >= 500 ? FallbackCategory.Server : FallbackCategory.Unknown;
    }
  }

  /**
   * Extract usage from a provider response. Default handles the OpenAI shape
   * (`usage.prompt_tokens` / `completion_tokens`). Providers using a different
   * shape (Gemini `usageMetadata`, Anthropic `usage.input_tokens`) override.
   */
  extractUsage(body: unknown): NormalizedUsage | null {
    if (!isRecord(body) || !isRecord(body.usage)) return null;
    const usage = body.usage;
    const prompt = toNumber(usage.prompt_tokens);
    const completion = toNumber(usage.completion_tokens);
    const total = toNumber(usage.total_tokens) || prompt + completion;
    const result: NormalizedUsage = {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
    };
    const completionDetails = usage.completion_tokens_details;
    if (isRecord(completionDetails) && typeof completionDetails.reasoning_tokens === "number") {
      result.reasoningTokens = completionDetails.reasoning_tokens;
    }
    const promptDetails = usage.prompt_tokens_details;
    if (isRecord(promptDetails) && typeof promptDetails.cached_tokens === "number") {
      result.cachedTokens = promptDetails.cached_tokens;
    }
    return result;
  }
}

// Re-export for convenience so executor modules import from one place.
export { Format };
export { isRecord as isExecutorRecord };
