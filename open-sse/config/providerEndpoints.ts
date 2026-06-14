/**
 * Vanilla provider endpoint table (docs/PROVIDERS.md).
 *
 * Every provider here is served by the data-driven `DefaultExecutor`: a fixed
 * (or `{baseUrl}`-templated) endpoint, a Bearer/x-api-key/X-API-Key header, and
 * standard OpenAI- or Anthropic-shaped usage. Providers needing custom URL
 * building, signing, or non-JSON transports get a dedicated executor class and
 * are registered separately in `executors/index.ts` (which overrides any entry
 * here).
 *
 * Defaults: `format = openai`, `authStyle = Bearer`, `usageShape = openai`.
 */

import { Format } from "@/open-sse/translator/formats";
import type { AuthStyle, UsageShape } from "@/open-sse/executors/default";

export interface ProviderEndpointConfig {
  endpoint: string;
  format?: Format;
  authStyle?: AuthStyle;
  extraHeaders?: Record<string, string>;
  isOAuth?: boolean;
  usageShape?: UsageShape;
}

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Headers that make a request look like Anthropic's official Claude CLI
 * (`claude-code`). Required by the OAuth (Claude Pro/Max) surface and by spoof
 * gateways like agentrouter, which expect the CLI's identification + beta flags.
 *
 * These are reverse-engineered from the Claude Code client (no public API doc);
 * docs/PROVIDERS.md marks `claude` and `agentrouter` as "claude (SPOOF)" /
 * `CLAUDE_CLI_SPOOF_HEADERS`. The OAuth bearer itself is attached by authStyle.
 */
export const CLAUDE_CLI_SPOOF_HEADERS: Record<string, string> = {
  "anthropic-version": ANTHROPIC_VERSION,
  "anthropic-beta":
    "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
  "x-app": "cli",
  "user-agent": "claude-cli/1.0.0 (external, cli)",
};

/** Shared config for Anthropic Messages-compatible API-key providers. */
function claudeApiKey(endpoint: string): ProviderEndpointConfig {
  return {
    endpoint,
    format: Format.Claude,
    authStyle: "x-api-key",
    extraHeaders: { "anthropic-version": ANTHROPIC_VERSION },
    usageShape: "anthropic",
  };
}

export const providerEndpoints: Record<string, ProviderEndpointConfig> = {
  // ── OpenAI-compatible, API key (Bearer) ──────────────────────────────────
  openai: { endpoint: "https://api.openai.com/v1/chat/completions" },
  groq: { endpoint: "https://api.groq.com/openai/v1/chat/completions" },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    extraHeaders: { "HTTP-Referer": "https://zgate.ziron.dev", "X-Title": "ZGate" },
  },
  mistral: { endpoint: "https://api.mistral.ai/v1/chat/completions" },
  perplexity: { endpoint: "https://api.perplexity.ai/chat/completions" },
  together: { endpoint: "https://api.together.xyz/v1/chat/completions" },
  fireworks: { endpoint: "https://api.fireworks.ai/inference/v1/chat/completions" },
  cerebras: { endpoint: "https://api.cerebras.ai/v1/chat/completions" },
  nvidia: { endpoint: "https://integrate.api.nvidia.com/v1/chat/completions" },
  "glm-cn": { endpoint: "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions" },
  alicode: { endpoint: "https://coding.dashscope.aliyuncs.com/v1/chat/completions" },
  "alicode-intl": { endpoint: "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions" },
  "volcengine-ark": {
    endpoint: "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  },
  byteplus: {
    endpoint: "https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions",
  },
  // cloudflare-ai has a dedicated executor (CloudflareAiExecutor): the accountId
  // comes from credentials.providerSpecificData.accountId, not the base URL.
  "xiaomi-mimo": { endpoint: "https://api.xiaomimimo.com/v1/chat/completions" },
  kilocode: { endpoint: "https://api.kilo.ai/api/openrouter/chat/completions" },
  "opencode-go": { endpoint: "https://opencode.ai/zen/go/v1/chat/completions" },
  "vercel-ai-gateway": { endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions" },
  siliconflow: { endpoint: "https://api.siliconflow.cn/v1/chat/completions" },
  hyperbolic: { endpoint: "https://api.hyperbolic.xyz/v1/chat/completions" },
  nanobanana: { endpoint: "https://api.nanobananaapi.ai/v1/chat/completions" },
  chutes: { endpoint: "https://llm.chutes.ai/v1/chat/completions" },
  aimlapi: { endpoint: "https://api.aimlapi.com/v1/chat/completions" },
  novita: { endpoint: "https://api.novita.ai/v3/openai/chat/completions" },
  modal: { endpoint: "https://api.modal.com/v1/chat/completions" },
  reka: { endpoint: "https://api.reka.ai/v1/chat/completions" },
  nlpcloud: { endpoint: "https://api.nlpcloud.io/v1/gpu/chatbot" },
  bazaarlink: { endpoint: "https://bazaarlink.ai/api/v1/chat/completions" },
  completions: { endpoint: "https://completions.me/api/v1/chat/completions" },
  enally: { endpoint: "https://ai.enally.in/v1/chat/completions", authStyle: "X-API-Key" },
  freetheai: { endpoint: "https://api.freetheai.xyz/v1/chat/completions" },
  llm7: { endpoint: "https://api.llm7.io/v1/chat/completions" },
  lepton: { endpoint: "https://api.lepton.ai/api/v1/chat/completions" },
  kluster: { endpoint: "https://api.kluster.ai/v1/chat/completions" },
  ai21: { endpoint: "https://api.ai21.com/studio/v1/chat/completions" },
  "inference-net": { endpoint: "https://api.inference.net/v1/chat/completions" },
  predibase: { endpoint: "https://serving.app.predibase.com/v1/chat/completions" },
  bytez: { endpoint: "https://api.bytez.com/models/v2" },
  morph: { endpoint: "https://api.morphllm.com/v1/chat/completions" },
  longcat: { endpoint: "https://api.longcat.chat/openai/v1/chat/completions" },
  scaleway: { endpoint: "https://api.scaleway.ai/v1/chat/completions" },
  deepinfra: { endpoint: "https://api.deepinfra.com/v1/openai/chat/completions" },
  sambanova: { endpoint: "https://api.sambanova.ai/v1/chat/completions" },
  nscale: { endpoint: "https://inference.api.nscale.com/v1/chat/completions" },
  baseten: { endpoint: "https://inference.baseten.co/v1/chat/completions" },
  publicai: { endpoint: "https://api.publicai.co/v1/chat/completions" },
  "nous-research": { endpoint: "https://inference-api.nousresearch.com/v1/chat/completions" },
  glhf: { endpoint: "https://glhf.chat/api/openai/v1/chat/completions" },
  blackbox: { endpoint: "https://api.blackbox.ai/chat/completions" },
  // vertex-partner: partner models via Vertex Model Garden, OpenAI-compat. The
  // OAuth-from-SA access token + full endpoint are resolved into baseUrl upstream.
  "vertex-partner": { endpoint: "{baseUrl}/chat/completions" },

  // ── OAuth, OpenAI-compatible (access token as Bearer) ────────────────────
  qwen: { endpoint: "https://portal.qwen.ai/v1/chat/completions", isOAuth: true },
  iflow: { endpoint: "https://apis.iflow.cn/v1/chat/completions", isOAuth: true },
  xai: { endpoint: "https://api.x.ai/v1/chat/completions", isOAuth: true },
  cline: { endpoint: "https://api.cline.bot/api/v1/chat/completions", isOAuth: true },
  gitlab: { endpoint: "https://gitlab.com/api/v4/chat/completions", isOAuth: true },
  codebuddy: { endpoint: "https://copilot.tencent.com/v1/chat/completions", isOAuth: true },

  // ── No-auth providers ────────────────────────────────────────────────────
  // Path aligned with the sibling opencode-go "zen" gateway
  // (opencode.ai/zen/go/v1/chat/completions). opencode's exact no-auth chat path
  // is not officially documented — best-effort; override via connection baseUrl.
  opencode: {
    endpoint: "https://opencode.ai/zen/v1/chat/completions",
    authStyle: "none",
    extraHeaders: { "x-opencode-client": "desktop" },
  },
  uncloseai: {
    endpoint: "https://hermes.ai.unturf.com/v1/chat/completions",
    authStyle: "none",
  },
  puter: {
    endpoint: "https://api.puter.com/puterai/openai/v1/chat/completions",
    authStyle: "none",
  },

  // ── Anthropic Messages-compatible, API key (x-api-key) ───────────────────
  anthropic: claudeApiKey("https://api.anthropic.com/v1/messages"),
  glm: claudeApiKey("https://api.z.ai/api/anthropic/v1/messages"),
  kimi: claudeApiKey("https://api.kimi.com/coding/v1/messages"),
  minimax: claudeApiKey("https://api.minimax.io/anthropic/v1/messages"),
  "minimax-cn": claudeApiKey("https://api.minimaxi.com/anthropic/v1/messages"),
  // agentrouter: Anthropic-compatible but expects Claude-CLI spoof headers.
  agentrouter: {
    endpoint: "https://agentrouter.org/v1/messages",
    format: Format.Claude,
    authStyle: "x-api-key",
    extraHeaders: CLAUDE_CLI_SPOOF_HEADERS,
    usageShape: "anthropic",
  },

  // ── Anthropic Messages-compatible, OAuth (access token as Bearer) ────────
  // claude (OAuth, Claude Pro/Max): Bearer access token + Claude-CLI spoof
  // headers (docs/PROVIDERS.md: CLAUDE_CLI_SPOOF_HEADERS), distinct from the
  // `anthropic` API-key provider which uses x-api-key + plain CLAUDE_API_HEADERS.
  claude: {
    endpoint: "https://api.anthropic.com/v1/messages",
    format: Format.Claude,
    authStyle: "Bearer",
    extraHeaders: CLAUDE_CLI_SPOOF_HEADERS,
    usageShape: "anthropic",
    isOAuth: true,
  },
  "kimi-coding": {
    endpoint: "https://api.kimi.com/coding/v1/messages",
    format: Format.Claude,
    authStyle: "Bearer",
    extraHeaders: { "anthropic-version": ANTHROPIC_VERSION },
    usageShape: "anthropic",
    isOAuth: true,
  },
};

/** Providers covered by the default executor (table keys). */
export function defaultExecutorProviders(): string[] {
  return Object.keys(providerEndpoints);
}
