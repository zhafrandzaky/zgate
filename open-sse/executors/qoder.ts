/**
 * Qoder executor (docs/PROVIDERS.md "qoder").
 *
 * API key with custom request signing. The signing material is computed by the
 * services layer and passed via provider-specific data (the executor stays
 * stateless and DB-free). Live model discovery is handled by `resolveQoderModels`.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest } from "@/open-sse/executors/base";
import { trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const QODER_DEFAULT_BASE = "https://api3.qoder.sh";
const QODER_CHAT_PATH = "/algo/api/v2/service/pro/sse/agent_chat_generation";

export class QoderExecutor extends BaseExecutor {
  readonly provider = "qoder";
  readonly format = Format.OpenAI;

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || QODER_DEFAULT_BASE;
    return `${trimTrailingSlash(base)}${QODER_CHAT_PATH}`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    const key = req.connection.credentials.apiKey;
    if (key) headers.authorization = `Bearer ${key}`;
    const psd = req.connection.credentials.providerSpecificData ?? {};
    if (typeof psd.signature === "string") headers["x-qoder-signature"] = psd.signature;
    if (typeof psd.timestamp === "string") headers["x-qoder-timestamp"] = psd.timestamp;
    return headers;
  }
}
