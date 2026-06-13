/**
 * Static per-provider model catalogs (docs/PROVIDERS.md).
 *
 * These are the fallback lists used when a provider has no live resolver or when
 * a live fetch fails. Providers that are purely auto-fetch (e.g. openrouter's
 * 300+ models) intentionally have no static list — `getStaticModels` returns an
 * empty array for them and the merge step relies on the fetched/custom lists.
 *
 * Model ids are bare (no `provider/` prefix); the resolution pipeline prefixes
 * them. Non-LLM kinds are inferred via `utils/modelKind.ts` / declared in
 * `config/modelCapabilities.ts`, not encoded into the id here.
 */

export const PROVIDER_MODELS: Record<string, string[]> = {
  // OAuth providers
  claude: [
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-opus-4-5-20251101",
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
  ],
  "gemini-cli": ["gemini-3-flash-preview", "gemini-3-pro-preview"],
  codex: [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gpt-5.3-codex-xhigh",
    "gpt-5.3-codex-high",
    "gpt-5.3-codex-low",
    "gpt-5.3-codex-none",
    "gpt-5.3-codex-spark",
    "gpt-5.5-image",
    "gpt-5.4-image",
    "gpt-5.3-image",
  ],
  qwen: ["qwen3-coder-plus", "qwen3-coder-flash", "vision-model", "coder-model"],
  iflow: [
    "qwen3-coder-plus",
    "qwen3-max",
    "qwen3-vl-plus",
    "qwen3-max-preview",
    "qwen3-235b",
    "qwen3-235b-a22b-instruct",
    "qwen3-235b-a22b-thinking-2507",
    "qwen3-32b",
    "kimi-k2",
    "deepseek-v3.2",
    "deepseek-v3.1",
    "deepseek-v3",
    "deepseek-r1",
    "glm-4.7",
    "iflow-rome-30ba3b",
  ],
  antigravity: [
    "gemini-3-flash-agent",
    "gemini-3.5-flash-low",
    "gemini-3.5-flash-extra-low",
    "gemini-pro-agent",
    "gemini-3.1-pro-low",
    "claude-sonnet-4-6",
    "claude-opus-4-6-thinking",
    "gpt-oss-120b-medium",
    "gemini-3-flash",
  ],
  github: [
    "gpt-3.5-turbo",
    "gpt-4",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-5-mini",
    "gpt-5.2",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.4-mini",
    "claude-haiku-4.5",
    "claude-opus-4.5",
    "claude-sonnet-4",
    "claude-sonnet-4.5",
    "claude-sonnet-4.6",
    "claude-opus-4.6",
    "claude-opus-4.7",
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
    "grok-code-fast-1",
    "oswe-vscode-prime",
    "goldeneye-free-auto",
    "text-embedding-3-small",
    "text-embedding-3-large",
  ],
  kiro: [
    "claude-sonnet-4.5",
    "claude-haiku-4.5",
    "deepseek-3.2",
    "qwen3-coder-next",
    "glm-5",
    "MiniMax-M2.5",
  ],
  cursor: [
    "default",
    "claude-4.5-opus-high-thinking",
    "claude-4.5-opus-high",
    "claude-4.5-sonnet-thinking",
    "claude-4.5-sonnet",
    "claude-4.5-haiku",
    "claude-4.5-opus",
    "gpt-5.2-codex",
    "claude-4.6-opus-max",
    "claude-4.6-sonnet-medium-thinking",
    "kimi-k2.5",
    "gemini-3-flash-preview",
    "gpt-5.2",
    "gpt-5.3-codex",
  ],
  "kimi-coding": ["kimi-k2.6", "kimi-k2.5", "kimi-k2.5-thinking", "kimi-latest"],

  // API key providers with documented static lists
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  qoder: [
    "auto",
    "ultimate",
    "performance",
    "efficient",
    "lite",
    "qmodel",
    "qmodel_latest",
    "dmodel",
    "dfmodel",
    "gm51model",
    "kmodel",
    "mmodel",
  ],
  kilocode: [
    "anthropic/claude-sonnet-4-20250514",
    "anthropic/claude-opus-4-20250514",
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "openai/gpt-4.1",
    "openai/o3",
    "deepseek/deepseek-chat",
    "deepseek/deepseek-reasoner",
  ],
  "opencode-go": ["kimi-k2.6", "kimi-k2.5", "glm-5.1", "glm-5", "qwen3.5-plus"],
  bytez: ["meta-llama/Llama-3.3-70B", "mistralai/Mistral-7B-v0.3", "Qwen/Qwen2.5-72B"],
  morph: ["morph-v3-large", "morph-v3-fast"],
  longcat: ["LongCat-Flash-Chat", "LongCat-Flash-Thinking", "LongCat-Flash-Lite"],
  scaleway: ["qwen3-235b-a22b-instruct-2507", "llama-3.3-70b-instruct", "mistral-small-3.1-24b"],
  deepinfra: ["meta-llama/Meta-Llama-3.1-70B", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B"],
  sambanova: ["Meta-Llama-3.1-405B", "Meta-Llama-3.1-70B", "Meta-Llama-3.1-8B"],
  nscale: ["meta-llama/Llama-3.3-70B", "Qwen/Qwen2.5-Coder-32B"],
  baseten: ["deepseek-ai/DeepSeek-R1", "meta-llama/Llama-3.3-70B"],
  publicai: ["auto"],
  "nous-research": ["Hermes-4-405B", "Hermes-4-70B"],
  glhf: [
    "hf:meta-llama/Meta-Llama-3.1-405B",
    "hf:meta-llama/Meta-Llama-3.1-70B",
    "hf:Qwen/Qwen2.5-72B",
  ],

  // No-auth providers
  uncloseai: ["auto", "gpt-4o-mini"],
  puter: ["gpt-5", "claude-opus-4", "gemini-3-pro-preview", "grok-4", "deepseek-chat"],
};

/**
 * Static fallback for Ollama when `/api/tags` is unreachable. Common community
 * models; the live resolver supersedes this whenever the daemon responds.
 */
export const ollamaModels: string[] = [
  "llama3.3",
  "qwen2.5-coder",
  "deepseek-r1",
  "mistral",
  "phi4",
];

/** Bare static model ids for a provider, or `[]` when none are documented. */
export function getStaticModels(provider: string): string[] {
  if (provider === "ollama" || provider === "ollama-local") return [...ollamaModels];
  return PROVIDER_MODELS[provider] ? [...PROVIDER_MODELS[provider]] : [];
}
