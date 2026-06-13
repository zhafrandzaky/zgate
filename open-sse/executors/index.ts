/**
 * Executor registry.
 *
 * Resolves a provider id to the {@link BaseExecutor} that knows how to talk to
 * it. Two tiers:
 *   1. Dedicated executor classes for providers with custom URL building,
 *      signing, non-JSON transports, or bespoke wire formats.
 *   2. Data-driven {@link DefaultExecutor} instances built from
 *      `providerEndpoints` for the vanilla OpenAI/Anthropic-compatible long tail.
 *
 * Dedicated executors win over the table, so a provider listed in both is served
 * by its specialized class.
 */

import { Format } from "@/open-sse/translator/formats";
import { BaseExecutor } from "@/open-sse/executors/base";
import { DefaultExecutor } from "@/open-sse/executors/default";
import { DeepSeekExecutor } from "@/open-sse/executors/deepseek";
import { KiroExecutor } from "@/open-sse/executors/kiro";
import { CodexExecutor } from "@/open-sse/executors/codex";
import { CursorExecutor } from "@/open-sse/executors/cursor";
import { GithubCopilotExecutor } from "@/open-sse/executors/github";
import { GeminiExecutor } from "@/open-sse/executors/gemini";
import { GeminiCliExecutor } from "@/open-sse/executors/geminiCli";
import { VertexExecutor } from "@/open-sse/executors/vertex";
import { AntigravityExecutor } from "@/open-sse/executors/antigravity";
import { AzureExecutor } from "@/open-sse/executors/azure";
import { QoderExecutor } from "@/open-sse/executors/qoder";
import { XiaomiTokenplanExecutor } from "@/open-sse/executors/xiaomiTokenplan";
import { CommandCodeExecutor } from "@/open-sse/executors/commandcode";
import { CloudflareAiExecutor } from "@/open-sse/executors/cloudflareAi";
import { OllamaExecutor, OLLAMA_CLOUD_BASE, OLLAMA_LOCAL_BASE } from "@/open-sse/executors/ollama";
import { GrokWebExecutor, PerplexityWebExecutor } from "@/open-sse/executors/webReverse";
import { providerEndpoints } from "@/open-sse/config/providerEndpoints";

/** Build the dedicated (non-table) executors. */
function buildSpecializedExecutors(): BaseExecutor[] {
  return [
    new DeepSeekExecutor(),
    new KiroExecutor(),
    new CodexExecutor(),
    new CursorExecutor(),
    new GithubCopilotExecutor(),
    new GeminiExecutor(),
    new GeminiCliExecutor(),
    new VertexExecutor(),
    new AntigravityExecutor(),
    new AzureExecutor(),
    new CloudflareAiExecutor(),
    new QoderExecutor(),
    new XiaomiTokenplanExecutor(),
    new CommandCodeExecutor(),
    new OllamaExecutor("ollama", OLLAMA_CLOUD_BASE),
    new OllamaExecutor("ollama-local", OLLAMA_LOCAL_BASE),
    new GrokWebExecutor(),
    new PerplexityWebExecutor(),
  ];
}

function buildRegistry(): Map<string, BaseExecutor> {
  const registry = new Map<string, BaseExecutor>();

  // Tier 2 first: vanilla providers from the endpoint table.
  for (const [provider, config] of Object.entries(providerEndpoints)) {
    registry.set(provider, new DefaultExecutor({ provider, ...config }));
  }

  // Tier 1 last: dedicated classes override any table entry of the same name.
  for (const executor of buildSpecializedExecutors()) {
    registry.set(executor.provider, executor);
  }

  return registry;
}

const REGISTRY = buildRegistry();

/** All registered provider ids. */
export function registeredProviders(): string[] {
  return [...REGISTRY.keys()].sort();
}

/** Whether a provider has a registered executor. */
export function hasExecutor(provider: string): boolean {
  return REGISTRY.has(provider);
}

/**
 * Resolve the executor for a provider id. Returns `undefined` for unknown
 * providers so callers can fall back to the compatible-node path or surface a
 * clean `model_not_found` rather than catching a throw.
 */
export function getExecutor(provider: string): BaseExecutor | undefined {
  return REGISTRY.get(provider);
}

/**
 * Resolve the executor for a provider, falling back to a configured
 * {@link DefaultExecutor} for custom "compatible" nodes (user-defined baseUrl,
 * OpenAI or Anthropic format). Never returns undefined.
 */
export function resolveExecutor(
  provider: string,
  baseUrlFormat?: "openai" | "anthropic",
): BaseExecutor {
  const known = REGISTRY.get(provider);
  if (known) return known;
  // Compatible / unknown node: build a DefaultExecutor against the connection
  // baseUrl. The chat core supplies the baseUrl at execution time.
  if (baseUrlFormat === "anthropic") {
    return new DefaultExecutor({
      provider,
      endpoint: "{baseUrl}/v1/messages",
      format: Format.Claude,
      authStyle: "x-api-key",
      extraHeaders: { "anthropic-version": "2023-06-01" },
      usageShape: "anthropic",
    });
  }
  return new DefaultExecutor({ provider, endpoint: "{baseUrl}/v1/chat/completions" });
}

// Re-exports for consumers (chat core, services).
export { BaseExecutor };
export { FallbackCategory, shouldRetrySameConnection } from "@/open-sse/executors/base";
export type {
  ExecutorRequest,
  ResolvedConnection,
  ResolvedCredentials,
  NormalizedUsage,
  PreparedRequest,
  TokenRefreshHook,
  AuthType,
} from "@/open-sse/executors/base";
export { Format };
export { deepseekCostUsd } from "@/open-sse/executors/deepseek";
