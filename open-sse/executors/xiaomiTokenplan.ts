/**
 * Xiaomi TokenPlan executor (docs/PROVIDERS.md "xiaomi-tokenplan").
 *
 * OpenAI-compatible with a per-region base URL (`sgp` default, plus `cn`, `ams`)
 * and quota tracking headers. The region is read from provider-specific data; an
 * explicit connection `baseUrl` always wins so unusual regions stay configurable.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest } from "@/open-sse/executors/base";
import { trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const REGION_BASES: Record<string, string> = {
  sgp: "https://api-sgp.xiaomi-tokenplan.com",
  cn: "https://api-cn.xiaomi-tokenplan.com",
  ams: "https://api-ams.xiaomi-tokenplan.com",
};
const DEFAULT_REGION = "sgp";

export class XiaomiTokenplanExecutor extends BaseExecutor {
  readonly provider = "xiaomi-tokenplan";
  readonly format = Format.OpenAI;

  buildUrl(req: ExecutorRequest): string {
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const region = typeof psd.region === "string" ? psd.region : DEFAULT_REGION;
    const base = req.connection.baseUrl?.trim() || REGION_BASES[region] || REGION_BASES[DEFAULT_REGION]!;
    return `${trimTrailingSlash(base)}/v1/chat/completions`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const key = req.connection.credentials.apiKey;
    if (!key) return {};
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const headers: Record<string, string> = { authorization: `Bearer ${key}` };
    if (typeof psd.region === "string") headers["x-region"] = psd.region;
    return headers;
  }
}
