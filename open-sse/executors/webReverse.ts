/**
 * Cookie-auth web-reverse executors (docs/PROVIDERS.md "grok-web",
 * "perplexity-web").
 *
 * These scrape an authenticated web app and are best-effort fallbacks, not
 * primaries. They authenticate with a session `cookie`. ZGate's translation
 * layer (TASK-005) does not yet ship a dedicated `grok-web`/`perplexity-web`
 * wire format, so these executors declare the OpenAI pivot as a placeholder and
 * carry their own short timeout; the bespoke response decoder is a follow-up.
 * The executor contract (URL, cookie auth, error mapping) is complete here.
 */

import { BaseExecutor, Format, FallbackCategory } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";

const WEB_REVERSE_TIMEOUT_MS = 60_000;

abstract class WebReverseExecutor extends BaseExecutor {
  // No dedicated translator format yet; pivot stands in (see module doc).
  readonly format = Format.OpenAI;

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

  buildUrl(req: ExecutorRequest): string {
    return req.connection.baseUrl?.trim() || "https://grok.com/rest/app-chat/conversations/new";
  }
}

export class PerplexityWebExecutor extends WebReverseExecutor {
  readonly provider = "perplexity-web";

  buildUrl(req: ExecutorRequest): string {
    return req.connection.baseUrl?.trim() || "https://www.perplexity.ai/rest/sse/perplexity_ask";
  }
}
