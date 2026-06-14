/**
 * Cloudflare Workers AI executor (docs/PROVIDERS.md "cloudflare-ai").
 *
 * The account id is part of the URL path and comes from the connection's
 * decrypted credentials (`providerSpecificData.accountId`) — NOT baked into the
 * base URL — so this needs a dedicated executor rather than a `{baseUrl}`
 * template. OpenAI-compatible chat completions; Bearer auth.
 *
 * Endpoint (Cloudflare Workers AI OpenAI-compat):
 *   https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions
 *   https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest } from "@/open-sse/executors/base";
import { trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareAiExecutor extends BaseExecutor {
  readonly provider = "cloudflare-ai";
  readonly format = Format.OpenAI;

  buildUrl(req: ExecutorRequest): string {
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const accountId = typeof psd.accountId === "string" ? psd.accountId : undefined;
    if (!accountId) {
      throw new Error("[executor:cloudflare-ai] accountId is required (providerSpecificData)");
    }
    // An explicit baseUrl overrides only the API host, not the account path.
    const base = req.connection.baseUrl?.trim() || CLOUDFLARE_API_BASE;
    return `${trimTrailingSlash(base)}/accounts/${accountId}/ai/v1/chat/completions`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.apiKey ?? req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }
}
