/**
 * Cookie-auth web-reverse executors (docs/PROVIDERS.md "grok-web",
 * "perplexity-web").
 *
 * These scrape an authenticated web app and are best-effort fallbacks, not
 * primaries. They authenticate with a session `cookie`. The translation layer
 * now ships dedicated `grok-web` / `perplexity-web` formats (best-effort stubs
 * in translator/{request,response}/web-reverse.ts), so each executor declares
 * its own wire format and carries a short timeout.
 */

import { BaseExecutor, Format, FallbackCategory } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";

const WEB_REVERSE_TIMEOUT_MS = 60_000;

abstract class WebReverseExecutor extends BaseExecutor {
  override get requestTimeoutMs(): number {
    return WEB_REVERSE_TIMEOUT_MS;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const cookie = req.connection.credentials.cookie;
    return cookie ? { cookie } : {};
  }

  /** Web endpoints rarely report token usage; estimated downstream. */
  override extractUsage(_body: unknown): NormalizedUsage | null {
    return null;
  }

  /** A 403 here usually means the cookie expired — treat as auth, not invalid. */
  override mapError(status: number, body?: unknown): FallbackCategory {
    if (status === 403) return FallbackCategory.Auth;
    return super.mapError(status, body);
  }
}

export class GrokWebExecutor extends WebReverseExecutor {
  readonly provider = "grok-web";
  readonly format = Format.GrokWeb;

  buildUrl(req: ExecutorRequest): string {
    return req.connection.baseUrl?.trim() || "https://grok.com/rest/app-chat/conversations/new";
  }
}

export class PerplexityWebExecutor extends WebReverseExecutor {
  readonly provider = "perplexity-web";
  readonly format = Format.PerplexityWeb;

  buildUrl(req: ExecutorRequest): string {
    return req.connection.baseUrl?.trim() || "https://www.perplexity.ai/rest/sse/perplexity_ask";
  }
}
