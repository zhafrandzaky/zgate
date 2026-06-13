/**
 * Default HTTP executor.
 *
 * Covers the long tail of OpenAI- and Anthropic-compatible providers that need
 * nothing more than a fixed endpoint, a Bearer/x-api-key header, and the
 * standard OpenAI usage/error semantics (docs/PROVIDERS.md "API Key Providers").
 *
 * It is data-driven: the registry constructs one instance per provider from a
 * small {@link DefaultExecutorConfig}, so adding a vanilla provider is a config
 * entry, not a new class.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import { extractAnthropicUsage } from "@/open-sse/executors/usageExtractors";

export type AuthStyle = "Bearer" | "x-api-key" | "X-API-Key" | "none";

/** Which usage shape the provider returns, so the right extractor runs. */
export type UsageShape = "openai" | "anthropic" | "none";

export interface DefaultExecutorConfig {
  provider: string;
  /**
   * Full chat endpoint. `{baseUrl}` is substituted with `connection.baseUrl`
   * (trailing slash trimmed) for providers with a user/dynamic base URL.
   */
  endpoint: string;
  /** Wire format. Defaults to OpenAI Chat Completions. */
  format?: Format;
  /** How to attach credentials. Defaults to Bearer. */
  authStyle?: AuthStyle;
  /** Static headers merged after auth (e.g. `anthropic-version`, `HTTP-Referer`). */
  extraHeaders?: Record<string, string>;
  /** Marks the provider as OAuth so the chat core wires token refresh. */
  isOAuth?: boolean;
  /** Usage response shape. Defaults to `openai`. */
  usageShape?: UsageShape;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export class DefaultExecutor extends BaseExecutor {
  readonly provider: string;
  readonly format: Format;
  private readonly endpoint: string;
  private readonly authStyle: AuthStyle;
  private readonly extraHeaders: Record<string, string>;
  private readonly oauth: boolean;
  private readonly usageShape: UsageShape;

  constructor(config: DefaultExecutorConfig) {
    super();
    this.provider = config.provider;
    this.endpoint = config.endpoint;
    this.format = config.format ?? Format.OpenAI;
    this.authStyle = config.authStyle ?? "Bearer";
    this.extraHeaders = config.extraHeaders ?? {};
    this.oauth = config.isOAuth ?? false;
    this.usageShape = config.usageShape ?? "openai";
  }

  override get isOAuth(): boolean {
    return this.oauth;
  }

  override extractUsage(body: unknown): NormalizedUsage | null {
    switch (this.usageShape) {
      case "anthropic":
        return extractAnthropicUsage(body);
      case "none":
        return null;
      default:
        return super.extractUsage(body);
    }
  }

  buildUrl(req: ExecutorRequest): string {
    if (!this.endpoint.includes("{baseUrl}")) return this.endpoint;
    const base = req.connection.baseUrl?.trim();
    if (!base) {
      throw new Error(`[executor:${this.provider}] baseUrl is required for endpoint template`);
    }
    return this.endpoint.replace("{baseUrl}", trimTrailingSlash(base));
  }

  /** The token to authenticate with: OAuth access token first, then API key. */
  protected resolveToken(req: ExecutorRequest): string | undefined {
    const { accessToken, apiKey } = req.connection.credentials;
    return accessToken ?? apiKey;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    if (this.authStyle === "none") return { ...this.extraHeaders };
    const token = this.resolveToken(req);
    if (!token) return { ...this.extraHeaders };
    switch (this.authStyle) {
      case "Bearer":
        return { authorization: `Bearer ${token}`, ...this.extraHeaders };
      case "x-api-key":
        return { "x-api-key": token, ...this.extraHeaders };
      case "X-API-Key":
        return { "X-API-Key": token, ...this.extraHeaders };
      default:
        return { ...this.extraHeaders };
    }
  }
}
