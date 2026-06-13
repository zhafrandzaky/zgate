/**
 * Azure OpenAI executor (docs/PROVIDERS.md "azure").
 *
 * Deployment-based URL: `{baseUrl}/openai/deployments/{deployment}/chat/completions
 * ?api-version=...`. Azure authenticates with the `api-key` header (not Bearer).
 * `deployment` and `apiVersion` come from the connection's provider-specific
 * data; deployment defaults to the bare model id.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest } from "@/open-sse/executors/base";
import { stripProviderPrefix, trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const DEFAULT_API_VERSION = "2024-10-21";

export class AzureExecutor extends BaseExecutor {
  readonly provider = "azure";
  readonly format = Format.OpenAI;

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim();
    if (!base) {
      throw new Error("[executor:azure] baseUrl (resource endpoint) is required");
    }
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const deployment =
      typeof psd.deployment === "string" ? psd.deployment : stripProviderPrefix(req.model);
    const apiVersion = typeof psd.apiVersion === "string" ? psd.apiVersion : DEFAULT_API_VERSION;
    return `${trimTrailingSlash(base)}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const key = req.connection.credentials.apiKey;
    return key ? { "api-key": key } : {};
  }
}
