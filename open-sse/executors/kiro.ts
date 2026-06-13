/**
 * Kiro executor — AWS CodeWhisperer (docs/PROVIDERS.md "kiro").
 *
 * OAuth via AWS Cognito device flow. The wire format is bespoke (`kiro`): tool
 * results live in `conversationState` and the translator owns that shape. The
 * executor only needs the endpoint, the Bearer token, and AWS-style error
 * mapping. Live model discovery is handled by `resolveKiroModels`
 * (services/liveModelResolvers.ts), not here.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest, NormalizedUsage } from "@/open-sse/executors/base";
import { trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const KIRO_DEFAULT_BASE = "https://codewhisperer.us-east-1.amazonaws.com";

export class KiroExecutor extends BaseExecutor {
  readonly provider = "kiro";
  readonly format = Format.Kiro;

  override get isOAuth(): boolean {
    return true;
  }

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || KIRO_DEFAULT_BASE;
    return `${trimTrailingSlash(base)}/generateAssistantResponse`;
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  /** CodeWhisperer streams a bespoke event frame; usage is derived downstream. */
  override extractUsage(_body: unknown): NormalizedUsage | null {
    return null;
  }
}
