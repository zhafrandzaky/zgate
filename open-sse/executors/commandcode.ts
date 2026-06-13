/**
 * CommandCode executor (docs/ARCHITECTURE.md §16, format `commandcode`).
 *
 * Anthropic-compatible coding endpoint variant. The translator owns the
 * `commandcode` <-> pivot conversion; the executor posts to the user-configured
 * base URL with `x-api-key` + `anthropic-version`.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import { extractAnthropicUsage, trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const ANTHROPIC_VERSION = "2023-06-01";

export class CommandCodeExecutor extends BaseExecutor {
  readonly provider = "commandcode";
  readonly format = Format.CommandCode;

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim();
    if (!base) {
      throw new Error("[executor:commandcode] baseUrl is required");
    }
    return `${trimTrailingSlash(base)}/v1/messages`;
  }

  protected override baseHeaders(req: ExecutorRequest): Record<string, string> {
    return { ...super.baseHeaders(req), "anthropic-version": ANTHROPIC_VERSION };
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const key = req.connection.credentials.apiKey ?? req.connection.credentials.accessToken;
    return key ? { "x-api-key": key } : {};
  }

  override extractUsage(body: unknown): NormalizedUsage | null {
    return extractAnthropicUsage(body);
  }
}
