/**
 * Vertex AI executor (docs/PROVIDERS.md "vertex").
 *
 * Service-account auth: the services layer exchanges the SA JSON for an OAuth
 * access token and passes it as `accessToken`. The endpoint is built per
 * project/region/model. Region `global` uses the apex host; other regions use
 * the `{region}-aiplatform.googleapis.com` host.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import { extractGeminiUsage, stripProviderPrefix } from "@/open-sse/executors/usageExtractors";

const DEFAULT_REGION = "us-central1";

function readString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export class VertexExecutor extends BaseExecutor {
  readonly provider = "vertex";
  readonly format = Format.Vertex;

  buildUrl(req: ExecutorRequest): string {
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const sa = req.connection.credentials.serviceAccount ?? {};
    const project = readString(psd, "projectId", "project") ?? readString(sa, "project_id");
    if (!project) {
      throw new Error("[executor:vertex] projectId is required (providerSpecificData or SA JSON)");
    }
    const region = readString(psd, "region", "location") ?? DEFAULT_REGION;
    const model = stripProviderPrefix(req.model);
    const action = req.stream ? "streamGenerateContent?alt=sse" : "generateContent";
    const host =
      region === "global" ? "aiplatform.googleapis.com" : `${region}-aiplatform.googleapis.com`;
    return `https://${host}/v1/projects/${project}/locations/${region}/publishers/google/models/${model}:${action}`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  override extractUsage(body: unknown): NormalizedUsage | null {
    return extractGeminiUsage(body);
  }
}
