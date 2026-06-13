# ZGate — Provider Catalog

Semua provider yang didukung ZGate. Model: **BYOK (Bring Your Own Key)** — user
wajib setup provider connections sendiri; ZGate tidak menyediakan built-in
provider/credits (Addendum 6).

Per provider didokumentasikan: nama + alias/id, tipe auth, base URL, format wire,
env vars yang dibutuhkan, model list, status auto-fetch model, dan special notes.

---

## OAuth Credentials di `open-sse/config/providers.ts`

Semua OAuth credentials di `open-sse/config/providers.ts` **wajib dibaca dari env
vars** — tidak ada satupun yang di-hardcode langsung di source code. Pola ini
berlaku saat mengerjakan TASK-006 (executors) dan TASK-011 (oauth).

Pola yang benar:

```typescript
claude: {
  clientId: process.env.OAUTH_CLAUDE_CLIENT_ID!,
  tokenUrl: process.env.OAUTH_CLAUDE_TOKEN_URL!,
  // ...
}

iflow: {
  clientId: process.env.OAUTH_IFLOW_CLIENT_ID!,
  clientSecret: process.env.OAUTH_IFLOW_CLIENT_SECRET!, // sensitif
  tokenUrl: process.env.OAUTH_IFLOW_TOKEN_URL!,
  authUrl: process.env.OAUTH_IFLOW_AUTH_URL!,
  // ...
}
```

Aturan:

- `CLIENT_ID` = identifier publik, boleh diketahui.
- `CLIENT_SECRET` = sensitif, isi dari sumber terpercaya, jangan commit ke git.
- Semua env vars sudah disediakan di `.env` dan `.env.example` dengan prefix
  `OAUTH_*`.
- Provider yang tidak butuh secret (Claude, Codex, Qwen, GitHub, Kiro, Cursor,
  Kimi Coding, xAI, Cline) tetap membaca `clientId`/URL dari env, bukan literal.

---

## Konvensi Umum

- Model ID format: `provider/model` (mis. `kiro/claude-sonnet-4.5`,
  `deepseek/deepseek-v4-flash`).
- Semua credentials encrypted at rest (AES-256-GCM); tidak pernah dikirim ke
  client.
- OAuth providers: pre-check token expiry + live refresh on 401/403 → retry
  transparan.
- Multi-account: user bisa punya beberapa connections untuk provider yang sama —
  round-robin + cooldown saat 429 (lihat `docs/COMBO.md`).
- Health monitor ping tiap provider tiap 5 menit (lihat TASK-024).
- **Auto-fetch models** = ZGate punya live resolver yang fetch model list dari
  API provider (cache 5 menit). Provider tanpa auto-fetch memakai static list di
  `PROVIDER_MODELS`.
- Tag model: `[type:image]`, `[type:stt]`, `[type:embedding]`, `[type:video]`
  menandai kind non-LLM; `[strip:image,audio]` = modality di-strip sebelum kirim;
  `[capabilities:edit]` = mendukung image edit.

---

## Ringkasan per Kategori

### OAuth Providers

| Provider | Alias | Base URL | Format | Auto-fetch |
|---|---|---|---|---|
| claude | cc | api.anthropic.com/v1/messages | claude (SPOOF) | Yes |
| gemini | — | generativelanguage.googleapis.com/v1beta/models | gemini | Yes |
| gemini-cli | gc | cloudcode-pa.googleapis.com/v1internal | gemini-cli | No |
| codex | cx | chatgpt.com/backend-api/codex/responses | openai-responses | Yes |
| qwen | qw | portal.qwen.ai/v1/chat/completions | openai | No |
| iflow | if | apis.iflow.cn/v1/chat/completions | openai | No |
| antigravity | ag | daily-cloudcode-pa.googleapis.com + sandbox | antigravity | No |
| github | gh | api.githubcopilot.com/chat/completions | openai | No |
| kiro | kr | codewhisperer.us-east-1.amazonaws.com | kiro | Yes (live) |
| cursor | cu | api2.cursor.sh | cursor | No |
| kimi-coding | kmc | api.kimi.com/coding/v1/messages | claude (API) | No |
| xai | — | api.x.ai/v1/chat/completions | openai | Yes |
| cline | — | api.cline.bot/api/v1/chat/completions | openai | Yes |
| gitlab | — | gitlab.com/api/v4/chat/completions | openai | No |
| codebuddy | — | copilot.tencent.com/v1/chat/completions | openai | No |

### API Key Providers (ringkasan)

| Provider | Alias | Base URL | Format | Auto-fetch |
|---|---|---|---|---|
| anthropic | — | api.anthropic.com/v1/messages | claude (API) | Yes |
| openai | — | api.openai.com/v1/chat/completions | openai | Yes |
| deepseek | — | api.deepseek.com/chat/completions | openai | Yes |
| groq | — | api.groq.com/openai/v1/chat/completions | openai | Yes |
| openrouter | — | openrouter.ai/api/v1/chat/completions | openai | Yes |
| mistral | — | api.mistral.ai/v1/chat/completions | openai | Yes |
| perplexity | — | api.perplexity.ai/chat/completions | openai | No |
| together | — | api.together.xyz/v1/chat/completions | openai | Yes |
| fireworks | — | api.fireworks.ai/inference/v1/chat/completions | openai | No |
| cerebras | — | api.cerebras.ai/v1/chat/completions | openai | Yes |
| nvidia | — | integrate.api.nvidia.com/v1/chat/completions | openai | Yes |
| glm | — | api.z.ai/api/anthropic/v1/messages | claude (API) | No |
| glm-cn | — | open.bigmodel.cn/api/coding/paas/v4/chat/completions | openai | No |
| kimi | — | api.kimi.com/coding/v1/messages | claude (API) | No |
| minimax | — | api.minimax.io/anthropic/v1/messages | claude (API) | No |
| minimax-cn | — | api.minimaxi.com/anthropic/v1/messages | claude (API) | No |
| alicode | — | coding.dashscope.aliyuncs.com/v1/chat/completions | openai | No |
| alicode-intl | — | coding-intl.dashscope.aliyuncs.com/v1/chat/completions | openai | No |
| volcengine-ark | — | ark.cn-beijing.volces.com/api/coding/v3/chat/completions | openai | No |
| byteplus | — | ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions | openai | No |
| azure | — | dynamic (user config) | openai | No |
| cloudflare-ai | — | api.cloudflare.com/.../ai/v1/chat/completions | openai | No |
| xiaomi-mimo | — | api.xiaomimimo.com/v1/chat/completions | openai | No |
| xiaomi-tokenplan | — | dynamic per region | openai | No |
| qoder | qd | api3.qoder.sh/algo/api/v2/.../agent_chat_generation | openai | Yes (live) |
| kilocode | kc | api.kilo.ai/api/openrouter/chat/completions | openai | No |
| opencode-go | — | opencode.ai/zen/go/v1/chat/completions | openai | No |
| vercel-ai-gateway | — | ai-gateway.vercel.sh/v1/chat/completions | openai | Yes |
| agentrouter | — | agentrouter.org/v1/messages | claude (SPOOF) | No |
| siliconflow | — | api.siliconflow.cn/v1/chat/completions | openai | Yes |
| hyperbolic | — | api.hyperbolic.xyz/v1/chat/completions | openai | No |
| nanobanana | — | api.nanobananaapi.ai/v1/chat/completions | openai | No |
| chutes | — | llm.chutes.ai/v1/chat/completions | openai | No |
| aimlapi | — | api.aimlapi.com/v1/chat/completions | openai | No |
| novita | — | api.novita.ai/v3/openai/chat/completions | openai | No |
| modal | — | api.modal.com/v1/chat/completions | openai | No |
| reka | — | api.reka.ai/v1/chat/completions | openai | No |
| nlpcloud | — | api.nlpcloud.io/v1/gpu/chatbot | openai | No |
| bazaarlink | — | bazaarlink.ai/api/v1/chat/completions | openai | No |
| completions | — | completions.me/api/v1/chat/completions | openai | No |
| enally | — | ai.enally.in/v1/chat/completions | openai | No |
| freetheai | — | api.freetheai.xyz/v1/chat/completions | openai | No |
| llm7 | — | api.llm7.io/v1/chat/completions | openai | No |
| lepton | — | api.lepton.ai/api/v1/chat/completions | openai | No |
| kluster | — | api.kluster.ai/v1/chat/completions | openai | No |
| ai21 | — | api.ai21.com/studio/v1/chat/completions | openai | No |
| inference-net | — | api.inference.net/v1/chat/completions | openai | No |
| predibase | — | serving.app.predibase.com/v1/chat/completions | openai | No |
| bytez | — | api.bytez.com/models/v2 | openai | No |
| morph | — | api.morphllm.com/v1/chat/completions | openai | No |
| longcat | — | api.longcat.chat/openai/v1/chat/completions | openai | No |
| scaleway | — | api.scaleway.ai/v1/chat/completions | openai | No |
| deepinfra | — | api.deepinfra.com/v1/openai/chat/completions | openai | No |
| sambanova | — | api.sambanova.ai/v1/chat/completions | openai | No |
| nscale | — | inference.api.nscale.com/v1/chat/completions | openai | No |
| baseten | — | inference.baseten.co/v1/chat/completions | openai | No |
| publicai | — | api.publicai.co/v1/chat/completions | openai | No |
| nous-research | — | inference-api.nousresearch.com/v1/chat/completions | openai | No |
| glhf | — | glhf.chat/api/openai/v1/chat/completions | openai | No |
| blackbox | — | api.blackbox.ai/chat/completions | openai | No |

### Cookie / Web, No Auth, Local, Vertex

| Provider | Auth | Base URL | Format | Auto-fetch |
|---|---|---|---|---|
| grok-web | Cookie | grok.com/rest/app-chat/conversations/new | grok-web | No |
| perplexity-web | Cookie | www.perplexity.ai/rest/sse/perplexity_ask | perplexity-web | No |
| opencode | None | opencode.ai | openai | No |
| uncloseai | None | hermes.ai.unturf.com/v1/chat/completions | openai | No |
| puter | None | api.puter.com/puterai/openai/v1/chat/completions | openai | No |
| ollama | None | ollama.com/api/chat | ollama | Yes |
| ollama-local | None | localhost:11434/api/chat | ollama | Yes |
| vertex | SA JSON | aiplatform.googleapis.com (dynamic) | vertex | No |
| vertex-partner | SA JSON | aiplatform.googleapis.com (dynamic) | openai | No |

### Media Providers (STT / Image)

| Provider | Auth | Kind | Base URL |
|---|---|---|---|
| deepgram | API Key | STT | api.deepgram.com/v1/listen |
| assemblyai | API Key | STT | api.assemblyai.com/v1/audio/transcriptions |
| fal-ai | API Key | Image | fal.ai |
| stability-ai | API Key | Image | stability.ai |
| black-forest-labs | API Key | Image | blackforestlabs |
| recraft | API Key | Image | recraft.ai |
| runwayml | API Key | Image/Video | runwayml |

---

# OAuth Providers

OAuth providers butuh login flow atau device-code. Token punya refresh flow —
ZGate pre-check expiry dan live refresh on 401/403.

## claude (alias: cc)

- **Auth:** OAuth (Claude Pro/Max account)
- **Base URL:** `https://api.anthropic.com/v1/messages`
- **Format:** claude (dengan `CLAUDE_CLI_SPOOF_HEADERS`)
- **Env vars:** `OAUTH_CLAUDE_CLIENT_ID`, `OAUTH_CLAUDE_TOKEN_URL`
- **Auto-fetch models:** Yes — `GET /v1/models` dengan `x-api-key`
- **Models:**
  - `claude-opus-4-8` (Claude Opus 4.8)
  - `claude-opus-4-7` (Claude Opus 4.7)
  - `claude-opus-4-6` (Claude Opus 4.6)
  - `claude-sonnet-4-6` (Claude Sonnet 4.6)
  - `claude-opus-4-5-20251101` (Claude 4.5 Opus)
  - `claude-sonnet-4-5-20250929` (Claude 4.5 Sonnet)
  - `claude-haiku-4-5-20251001` (Claude 4.5 Haiku)
- **Special notes:** Memakai `CLAUDE_CLI_SPOOF_HEADERS` (spoof header Claude CLI),
  berbeda dari provider `anthropic` (API key) yang memakai `CLAUDE_API_HEADERS`.
  Header `anthropic-version` wajib disertakan executor.

## gemini

- **Auth:** OAuth (Google account)
- **Base URL:** `https://generativelanguage.googleapis.com/v1beta/models`
- **Format:** gemini
- **Env vars:** `OAUTH_GEMINI_CLIENT_ID`, `OAUTH_GEMINI_CLIENT_SECRET`,
  `OAUTH_GEMINI_TOKEN_URL`
- **Auto-fetch models:** Yes
- **Models:** dynamic (fetched dari API)
- **Special notes:** `CLIENT_SECRET` required. Translator `openai-to-gemini`
  menangani role mapping (assistant→model), tool calling, inline image parts.

## gemini-cli (alias: gc)

- **Auth:** OAuth (credentials sama dengan `gemini`)
- **Base URL:** `https://cloudcode-pa.googleapis.com/v1internal`
- **Format:** gemini-cli
- **Env vars:** `OAUTH_GEMINI_CLIENT_ID`, `OAUTH_GEMINI_CLIENT_SECRET`
- **Auto-fetch models:** No
- **Models:**
  - `gemini-3-flash-preview` (Gemini 3 Flash Preview)
  - `gemini-3-pro-preview` (Gemini 3 Pro Preview)
- **Special notes:** Executor terpisah dari `gemini` karena endpoint berbeda
  (Cloud Code companion), tapi pakai OAuth credentials yang sama.

## codex (alias: cx)

- **Auth:** OAuth (ChatGPT account)
- **Base URL:** `https://chatgpt.com/backend-api/codex/responses`
- **Format:** openai-responses
- **Env vars:** `OAUTH_CODEX_CLIENT_ID`, `OAUTH_CODEX_TOKEN_URL`
- **Auto-fetch models:** Yes
- **Models:**
  - `gpt-5.5` (GPT 5.5)
  - `gpt-5.4` (GPT 5.4)
  - `gpt-5.4-mini` (GPT 5.4 Mini)
  - `gpt-5.3-codex` (GPT 5.3 Codex)
  - `gpt-5.3-codex-xhigh` (GPT 5.3 Codex xHigh)
  - `gpt-5.3-codex-high` (GPT 5.3 Codex High)
  - `gpt-5.3-codex-low` (GPT 5.3 Codex Low)
  - `gpt-5.3-codex-none` (GPT 5.3 Codex None)
  - `gpt-5.3-codex-spark` (GPT 5.3 Codex Spark)
  - `gpt-5.5-image` `[type:image]` (GPT 5.5 Image)
  - `gpt-5.4-image` `[type:image]` (GPT 5.4 Image)
  - `gpt-5.3-image` `[type:image]` (GPT 5.3 Image)
- **Special notes:** Setiap model LLM otomatis punya variant `-review` (Codex
  Review). Translator `openai-responses` menangani konversi Chat Completions ↔
  Responses API.

## qwen (alias: qw)

- **Auth:** OAuth device-code
- **Base URL:** `https://portal.qwen.ai/v1/chat/completions`
- **Format:** openai
- **Env vars:** `OAUTH_QWEN_CLIENT_ID`, `OAUTH_QWEN_TOKEN_URL`,
  `OAUTH_QWEN_AUTH_URL`
- **Auto-fetch models:** No
- **Models:**
  - `qwen3-coder-plus` (Qwen3 Coder Plus)
  - `qwen3-coder-flash` (Qwen3 Coder Flash)
  - `vision-model` (Qwen3 Vision Model)
  - `coder-model` (Qwen3.6 Coder Model)
- **Special notes:** Free quota per account — multi-account round-robin
  recommended.

## iflow (alias: if)

- **Auth:** OAuth
- **Base URL:** `https://apis.iflow.cn/v1/chat/completions`
- **Format:** openai
- **Env vars:** `OAUTH_IFLOW_CLIENT_ID`, `OAUTH_IFLOW_CLIENT_SECRET`,
  `OAUTH_IFLOW_TOKEN_URL`, `OAUTH_IFLOW_AUTH_URL`
- **Auto-fetch models:** No
- **Models:**
  - `qwen3-coder-plus`, `qwen3-max`, `qwen3-vl-plus`, `qwen3-max-preview`
  - `qwen3-235b`, `qwen3-235b-a22b-instruct`, `qwen3-235b-a22b-thinking-2507`
  - `qwen3-32b`, `kimi-k2`, `deepseek-v3.2`, `deepseek-v3.1`, `deepseek-v3`
  - `deepseek-r1`, `glm-4.7`, `iflow-rome-30ba3b`
- **Special notes:** `CLIENT_SECRET` required (sensitif). Mirror berbagai model
  Qwen/GLM/DeepSeek.

## antigravity (alias: ag)

- **Auth:** OAuth (Google / Antigravity IDE account)
- **Base URLs:** `https://daily-cloudcode-pa.googleapis.com` + sandbox
- **Format:** antigravity
- **Env vars:** `OAUTH_ANTIGRAVITY_CLIENT_ID`, `OAUTH_ANTIGRAVITY_CLIENT_SECRET`
- **Auto-fetch models:** No
- **Models:**
  - `gemini-3-flash-agent` (Gemini 3.5 Flash High)
  - `gemini-3.5-flash-low` (Gemini 3.5 Flash Medium)
  - `gemini-3.5-flash-extra-low` (Gemini 3.5 Flash Low)
  - `gemini-pro-agent` (Gemini 3.1 Pro High)
  - `gemini-3.1-pro-low` (Gemini 3.1 Pro Low)
  - `claude-sonnet-4-6` (Claude Sonnet 4.6 Thinking)
  - `claude-opus-4-6-thinking` (Claude Opus 4.6 Thinking)
  - `gpt-oss-120b-medium` (GPT-OSS 120B Medium)
  - `gemini-3-flash` (Gemini 3 Flash, no thinking)
- **Special notes:** `CLIENT_SECRET` required. Models route ke backends berbeda
  (daily-cloudcode vs sandbox). Translator `antigravity-to-openai` dua arah.

## github / GitHub Copilot (alias: gh)

- **Auth:** OAuth (device-code GitHub)
- **Base URL:** `https://api.githubcopilot.com/chat/completions`
- **Responses URL:** `https://api.githubcopilot.com/responses`
- **Format:** openai
- **Env vars:** `OAUTH_GITHUB_CLIENT_ID`
- **Auto-fetch models:** No
- **Models (OpenAI):** `gpt-3.5-turbo`, `gpt-4`, `gpt-4o`, `gpt-4o-mini`,
  `gpt-4.1`, `gpt-5-mini`, `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.3-codex`, `gpt-5.4`,
  `gpt-5.4-mini`
- **Models (Anthropic):** `claude-haiku-4.5`, `claude-opus-4.5`, `claude-sonnet-4`,
  `claude-sonnet-4.5`, `claude-sonnet-4.6`, `claude-opus-4.6`, `claude-opus-4.7`
- **Models (Google):** `gemini-2.5-pro`, `gemini-3-flash-preview`,
  `gemini-3.1-pro-preview`
- **Models (Other):** `grok-code-fast-1`, `oswe-vscode-prime` (Raptor Mini),
  `goldeneye-free-auto`
- **Models (Embedding):** `text-embedding-3-small` `[type:embedding]`,
  `text-embedding-3-large` `[type:embedding]`
- **Special notes:** Memerlukan special headers (`copilot-integration-id`,
  `editor-version`, dll). Copilot token short-lived — refresh otomatis dari GitHub
  OAuth token.

## kiro (alias: kr)

- **Auth:** OAuth (AWS Cognito device flow)
- **Base URL:** `https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse`
- **Format:** kiro
- **Env vars:** `OAUTH_KIRO_TOKEN_URL`, `OAUTH_KIRO_AUTH_URL`
- **Auto-fetch models:** Yes — live model resolver dari AWS CodeWhisperer API
- **Models (base):**
  - `claude-sonnet-4.5`, `claude-haiku-4.5`
  - `deepseek-3.2` `[strip:image,audio]`
  - `qwen3-coder-next` `[strip:image,audio]`
  - `glm-5`, `MiniMax-M2.5`
- **Models (thinking):** `claude-sonnet-4.5-thinking`, `claude-haiku-4.5-thinking`
- **Models (agentic):** `claude-sonnet-4.5-agentic`, `claude-haiku-4.5-agentic`
- **Models (thinking + agentic):** `claude-sonnet-4.5-thinking-agentic`,
  `claude-haiku-4.5-thinking-agentic`
- **Special notes:** Live model resolver dari AWS CodeWhisperer (`ListAvailableModels`);
  cache 5 menit per credential, fallback ke static list jika fetch gagal. Tool
  result ada di `conversationState` — RTK punya support khusus. Multi-account
  round-robin sangat berguna (quota per account).

## cursor (alias: cu)

- **Auth:** OAuth (import dari filesystem)
- **Base URL:** `https://api2.cursor.sh`
- **Chat Path:** `/aiserver.v1.ChatService/StreamUnifiedChatWithTools`
- **Format:** cursor (protobuf / connect)
- **Env vars:** `OAUTH_CURSOR_CLIENT_VERSION`
- **Auto-fetch models:** No
- **Models:**
  - `default` (Auto Server Picks)
  - `claude-4.5-opus-high-thinking`, `claude-4.5-opus-high`
  - `claude-4.5-sonnet-thinking`, `claude-4.5-sonnet`, `claude-4.5-haiku`,
    `claude-4.5-opus`
  - `gpt-5.2-codex`, `claude-4.6-opus-max`, `claude-4.6-sonnet-medium-thinking`
  - `kimi-k2.5`, `gemini-3-flash-preview`, `gpt-5.2`, `gpt-5.3-codex`
- **Special notes:** Protocol Cursor proprietary (protobuf/connect).
  `clientVersion` 3.1.0, header `connect-protocol-version: 1`. Token di-import dari
  instalasi Cursor lokal.

## kimi-coding (alias: kmc)

- **Auth:** OAuth
- **Base URL:** `https://api.kimi.com/coding/v1/messages`
- **Format:** claude (`CLAUDE_API_HEADERS`)
- **Env vars:** `OAUTH_KIMI_CODING_CLIENT_ID`, `OAUTH_KIMI_CODING_TOKEN_URL`,
  `OAUTH_KIMI_CODING_REFRESH_URL`
- **Auto-fetch models:** No
- **Models:**
  - `kimi-k2.6` (Kimi K2.6)
  - `kimi-k2.5` (Kimi K2.5)
  - `kimi-k2.5-thinking` (Kimi K2.5 Thinking)
  - `kimi-latest` (Kimi Latest)
- **Special notes:** Format Anthropic Messages dengan `CLAUDE_API_HEADERS`.
  Berbeda dari provider `kimi` (API key) yang juga Anthropic-compat.

## xai / Grok

- **Auth:** OAuth
- **Base URL:** `https://api.x.ai/v1/chat/completions`
- **Responses URL:** `https://api.x.ai/v1/responses`
- **Format:** openai
- **Env vars:** `OAUTH_XAI_CLIENT_ID`, `OAUTH_XAI_TOKEN_URL`,
  `OAUTH_XAI_REFRESH_URL`
- **Auto-fetch models:** Yes — `GET /v1/models`
- **Models:** dynamic (fetched dari API)
- **Special notes:** Berbeda dari `grok-web` (cookie scraping). Endpoint resmi xAI
  dengan dukungan Responses API.

## cline

- **Auth:** OAuth
- **Base URL:** `https://api.cline.bot/api/v1/chat/completions`
- **Format:** openai
- **Env vars:** `OAUTH_CLINE_TOKEN_URL`, `OAUTH_CLINE_REFRESH_URL`
- **Auto-fetch models:** Yes
- **Models:** dynamic (fetched dari API)
- **Special notes:** Token + refresh URL terpisah.

## gitlab / GitLab Duo

- **Auth:** OAuth (PAT — Personal Access Token)
- **Base URL:** `https://gitlab.com/api/v4/chat/completions`
- **Format:** openai
- **Env vars:** —
- **Auto-fetch models:** No
- **Models:** sesuai akses GitLab Duo user
- **Special notes:** Auth via PAT GitLab.

## codebuddy / Tencent CodeBuddy

- **Auth:** OAuth device-code
- **Base URL:** `https://copilot.tencent.com/v1/chat/completions`
- **Format:** openai
- **Env vars:** —
- **Auto-fetch models:** No
- **Models:** sesuai paket CodeBuddy user
- **Special notes:** Device-code flow ala Copilot.

---

# API Key Providers

Provider dengan auth API key (Bearer atau header khusus). Default executor adalah
`openai` kecuali disebutkan lain.

## anthropic

- **Auth:** API Key (`x-api-key` header)
- **Base URL:** `https://api.anthropic.com/v1/messages`
- **Format:** claude (`CLAUDE_API_HEADERS`)
- **Auto-fetch models:** Yes — `GET /v1/models`
- **Special notes:** Berbeda dari provider `claude` (OAuth) — **tidak** memakai
  SPOOF headers, melainkan `CLAUDE_API_HEADERS` standar Anthropic API.

## openai

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.openai.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes — `GET /v1/models`
- **Special notes:** Default executor tanpa translasi. Juga provider default untuk
  embeddings (memory system), TTS/STT, dan image.

## deepseek

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.deepseek.com/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes — `GET /v1/models`
- **Models:**
  - `deepseek-v4-flash` (DeepSeek V4 Flash) — $0.14 / $0.28 per 1M tokens
  - `deepseek-v4-pro` (DeepSeek V4 Pro) — $0.435 / $0.87 per 1M tokens
- **Special notes:**
  - **Thinking mode:** `{ "thinking": { "type": "enabled" | "disabled" } }`
  - **Effort:** `reasoning_effort: "high" | "max"`
  - Response: `reasoning_content` **terpisah** dari `content`; di streaming delta
    thinking datang di `delta.reasoning_content`. Translator memetakan ini ke
    Anthropic `thinking` blocks untuk client Claude-format dan menjaga keduanya
    tetap terpisah untuk client OpenAI-format.
  - Pricing-aware: cost dihitung dari usage dan dicatat ke `UsageEntry.costUsd`.
  - `deepseek-v4-flash` adalah default `MEMORY_EXTRACTION_MODEL` (murah + cepat).
  - **Error codes:** 400 (invalid request — no retry, fallback), 401 (key
    salah/expired — tandai error, fallback), 402 (saldo habis — skip connection,
    fallback + WS notify), 422 (param invalid semantik — no retry, fallback),
    429 (rate limit — round-robin + exponential backoff), 500 (server error —
    retry 1x → fallback), 503 (overloaded — fallback langsung).

## groq

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.groq.com/openai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes — `GET /models`

## openrouter

- **Auth:** API Key (Bearer)
- **Base URL:** `https://openrouter.ai/api/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes — `GET /api/v1/models` (300+ models)
- **Special notes:** Header `HTTP-Referer`, `X-Title` (untuk leaderboard).
  **HTTP 200 bisa berisi mid-stream error di body** — streamErrorDetector wajib
  cek body, bukan hanya status code. Free models bagus untuk fallback terakhir.

## mistral

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.mistral.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes

## perplexity

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.perplexity.ai/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Special notes:** Sonar family; berbeda dari `perplexity-web` (cookie).

## together

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.together.xyz/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes

## fireworks

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.fireworks.ai/inference/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## cerebras

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.cerebras.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes

## nvidia

- **Auth:** API Key (Bearer)
- **Base URL:** `https://integrate.api.nvidia.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes

## glm (GLM International)

- **Auth:** API Key
- **Base URL:** `https://api.z.ai/api/anthropic/v1/messages`
- **Format:** claude (`CLAUDE_API_HEADERS`)
- **Auto-fetch models:** No
- **Special notes:** Endpoint Anthropic-compatible.

## glm-cn (GLM China)

- **Auth:** API Key
- **Base URL:** `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## kimi

- **Auth:** API Key
- **Base URL:** `https://api.kimi.com/coding/v1/messages`
- **Format:** claude (`CLAUDE_API_HEADERS`)
- **Auto-fetch models:** No

## minimax

- **Auth:** API Key
- **Base URL:** `https://api.minimax.io/anthropic/v1/messages`
- **Format:** claude (`CLAUDE_API_HEADERS`)
- **Auto-fetch models:** No

## minimax-cn

- **Auth:** API Key
- **Base URL:** `https://api.minimaxi.com/anthropic/v1/messages`
- **Format:** claude (`CLAUDE_API_HEADERS`)
- **Auto-fetch models:** No

## alicode

- **Auth:** API Key
- **Base URL:** `https://coding.dashscope.aliyuncs.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## alicode-intl

- **Auth:** API Key
- **Base URL:** `https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## volcengine-ark

- **Auth:** API Key
- **Base URL:** `https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## byteplus

- **Auth:** API Key
- **Base URL:** `https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## azure / Azure OpenAI

- **Auth:** API Key
- **Base URL:** dynamic (dari user config)
- **Format:** openai
- **Auto-fetch models:** No
- **Special notes:** Executor menyusun URL deployment-based
  (`/openai/deployments/{deployment}/chat/completions?api-version=...`).

## cloudflare-ai

- **Auth:** API Key
- **Base URL:** `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Special notes:** `accountId` diambil dari
  `credentials.providerSpecificData.accountId`.

## xiaomi-mimo

- **Auth:** API Key
- **Base URL:** `https://api.xiaomimimo.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## xiaomi-tokenplan

- **Auth:** API Key
- **Base URL:** dynamic per region (`sgp` default, `cn`, `ams`)
- **Format:** openai
- **Auto-fetch models:** No
- **Special notes:** Executor menangani header khusus + quota tracking per region.

## qoder (alias: qd)

- **Auth:** API Key (custom signing)
- **Base URL:** `https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation`
- **Format:** openai
- **Auto-fetch models:** Yes — live model resolver
- **Models:** `auto`, `ultimate`, `performance`, `efficient`, `lite`, `qmodel`,
  `qmodel_latest`, `dmodel`, `dfmodel`, `gm51model`, `kmodel`, `mmodel`
- **Special notes:** Live model resolver (`resolveQoderModels`), cache 5 menit.
  Executor membangun URL sendiri (custom signing).

## kilocode (alias: kc)

- **Auth:** API Key
- **Base URL:** `https://api.kilo.ai/api/openrouter/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `anthropic/claude-sonnet-4-20250514`,
  `anthropic/claude-opus-4-20250514`, `google/gemini-2.5-pro`,
  `google/gemini-2.5-flash`, `openai/gpt-4.1`, `openai/o3`,
  `deepseek/deepseek-chat`, `deepseek/deepseek-reasoner`

## opencode-go

- **Auth:** API Key
- **Base URL:** `https://opencode.ai/zen/go/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `kimi-k2.6`, `kimi-k2.5`, `glm-5.1`, `glm-5`, `qwen3.5-plus`

## vercel-ai-gateway

- **Auth:** API Key
- **Base URL:** `https://ai-gateway.vercel.sh/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes

## agentrouter

- **Auth:** API Key (`x-api-key`)
- **Base URL:** `https://agentrouter.org/v1/messages`
- **Format:** claude (`CLAUDE_CLI_SPOOF_HEADERS`)
- **Auto-fetch models:** No
- **Special notes:** Memakai SPOOF headers ala Claude CLI.

## siliconflow

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.siliconflow.cn/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** Yes

## hyperbolic

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.hyperbolic.xyz/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## nanobanana

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.nanobananaapi.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## chutes

- **Auth:** API Key (Bearer)
- **Base URL:** `https://llm.chutes.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## aimlapi

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.aimlapi.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## novita

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.novita.ai/v3/openai/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## modal

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.modal.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## reka

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.reka.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## nlpcloud

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.nlpcloud.io/v1/gpu/chatbot`
- **Format:** openai
- **Auto-fetch models:** No

## bazaarlink

- **Auth:** API Key (Bearer)
- **Base URL:** `https://bazaarlink.ai/api/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## completions

- **Auth:** API Key (Bearer)
- **Base URL:** `https://completions.me/api/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## enally

- **Auth:** API Key (`X-API-Key` header — **bukan** Bearer)
- **Base URL:** `https://ai.enally.in/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Special notes:** Auth header non-standar (`X-API-Key`, bukan `Authorization`).

## freetheai

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.freetheai.xyz/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## llm7

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.llm7.io/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## lepton

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.lepton.ai/api/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## kluster

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.kluster.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## ai21

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.ai21.com/studio/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## inference-net

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.inference.net/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## predibase

- **Auth:** API Key (Bearer)
- **Base URL:** `https://serving.app.predibase.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

## bytez

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.bytez.com/models/v2`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `meta-llama/Llama-3.3-70B`, `mistralai/Mistral-7B-v0.3`,
  `Qwen/Qwen2.5-72B`

## morph

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.morphllm.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `morph-v3-large`, `morph-v3-fast`

## longcat

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.longcat.chat/openai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `LongCat-Flash-Chat`, `LongCat-Flash-Thinking`, `LongCat-Flash-Lite`

## scaleway

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.scaleway.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `qwen3-235b-a22b-instruct-2507`, `llama-3.3-70b-instruct`,
  `mistral-small-3.1-24b`

## deepinfra

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.deepinfra.com/v1/openai/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `meta-llama/Meta-Llama-3.1-70B`, `deepseek-ai/DeepSeek-V3`,
  `Qwen/Qwen2.5-72B`

## sambanova

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.sambanova.ai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `Meta-Llama-3.1-405B`, `Meta-Llama-3.1-70B`, `Meta-Llama-3.1-8B`

## nscale

- **Auth:** API Key (Bearer)
- **Base URL:** `https://inference.api.nscale.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `meta-llama/Llama-3.3-70B`, `Qwen/Qwen2.5-Coder-32B`

## baseten

- **Auth:** API Key (Bearer)
- **Base URL:** `https://inference.baseten.co/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `deepseek-ai/DeepSeek-R1`, `meta-llama/Llama-3.3-70B`

## publicai

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.publicai.co/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `auto` (Community)

## nous-research

- **Auth:** API Key (Bearer)
- **Base URL:** `https://inference-api.nousresearch.com/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `Hermes-4-405B`, `Hermes-4-70B`

## glhf

- **Auth:** API Key (Bearer)
- **Base URL:** `https://glhf.chat/api/openai/v1/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No
- **Models:** `hf:meta-llama/Meta-Llama-3.1-405B`, `hf:meta-llama/Meta-Llama-3.1-70B`,
  `hf:Qwen/Qwen2.5-72B`

## blackbox

- **Auth:** API Key (Bearer)
- **Base URL:** `https://api.blackbox.ai/chat/completions`
- **Format:** openai
- **Auto-fetch models:** No

---

# Cookie / Web Providers

Web-reverse providers — best effort, jadikan fallback bukan primary.

## grok-web

- **Auth:** Cookie
- **Base URL:** `https://grok.com/rest/app-chat/conversations/new`
- **Format:** grok-web
- **Env vars:** —
- **Auto-fetch models:** No
- **Special notes:** Web scraping, tidak stabil. Cookie bisa expire — health
  monitor menandai connection `down`.

## perplexity-web

- **Auth:** Cookie
- **Base URL:** `https://www.perplexity.ai/rest/sse/perplexity_ask`
- **Format:** perplexity-web
- **Env vars:** —
- **Auto-fetch models:** No
- **Special notes:** Web scraping, tidak stabil. Juga berguna sebagai web-search
  provider.

---

# No Auth Providers

## opencode

- **Auth:** None (`noAuth: true`)
- **Base URL:** `https://opencode.ai`
- **Format:** openai
- **Env vars:** —
- **Auto-fetch models:** No
- **Special notes:** Header `x-opencode-client: desktop`.

## uncloseai

- **Auth:** None
- **Base URL:** `https://hermes.ai.unturf.com/v1/chat/completions`
- **Format:** openai
- **Env vars:** —
- **Auto-fetch models:** No
- **Models:** `auto` (Free), `gpt-4o-mini`

## puter

- **Auth:** None
- **Base URL:** `https://api.puter.com/puterai/openai/v1/chat/completions`
- **Format:** openai
- **Env vars:** —
- **Auto-fetch models:** No
- **Models:** `gpt-5`, `claude-opus-4`, `gemini-3-pro-preview`, `grok-4`,
  `deepseek-chat`

---

# Local Providers

## ollama

- **Auth:** None
- **Base URL:** `https://ollama.com/api/chat`
- **Format:** ollama
- **Env vars:** —
- **Auto-fetch models:** Yes — `GET /api/tags`
- **Special notes:** ZGate juga expose `GET /api/tags` (Ollama-compatible) agar
  Ollama clients bisa discover model ZGate.

## ollama-local

- **Auth:** None
- **Base URL:** `http://localhost:11434/api/chat` (configurable)
- **Format:** ollama
- **Env vars:** —
- **Auto-fetch models:** Yes — `GET /api/tags`
- **Special notes:** Untuk instance Ollama lokal/remote milik user; fallback ke
  static list jika tidak reachable.

---

# Vertex AI

## vertex

- **Auth:** Service Account JSON
- **Base URL:** `https://aiplatform.googleapis.com` (dynamic)
- **Format:** vertex
- **Env vars:** —
- **Auto-fetch models:** No
- **Special notes:** `VertexExecutor` membangun URL secara dinamis per
  model/region. Gemini family di Vertex.

## vertex-partner

- **Auth:** Service Account JSON
- **Base URL:** `https://aiplatform.googleapis.com` (dynamic)
- **Format:** openai
- **Env vars:** —
- **Auto-fetch models:** No
- **Special notes:** Partner models (Claude, Llama, Mistral, GLM) via Vertex Model
  Garden, format OpenAI-compat.

---

# STT (Speech-to-Text) Providers

## deepgram

- **Auth:** API Key
- **Base URL:** `https://api.deepgram.com/v1/listen`
- **Models `[type:stt]`:** `nova-3`, `nova-2`, `whisper-large` (semua support
  `language` param)

## assemblyai

- **Auth:** API Key
- **Base URL:** `https://api.assemblyai.com/v1/audio/transcriptions`
- **Models `[type:stt]`:** `universal-3-pro`, `universal-2`

---

# Image Generation Providers

## fal-ai

- **Auth:** API Key
- **Models `[type:image]`:**
  - `fal-ai/flux/schnell`, `fal-ai/flux/dev`, `fal-ai/flux-pro/v1.1`
  - `fal-ai/flux-pro/v1.1-ultra`, `fal-ai/recraft-v3`
  - `fal-ai/ideogram/v2`, `fal-ai/stable-diffusion-v35-large`

## stability-ai

- **Auth:** API Key
- **Models `[type:image]`:** `stable-image-ultra`, `stable-image-core`,
  `sd3.5-large`, `sd3.5-large-turbo`, `sd3.5-medium`

## black-forest-labs

- **Auth:** API Key
- **Models `[type:image]`:**
  - `flux-pro-1.1`, `flux-pro-1.1-ultra`, `flux-pro`, `flux-dev`
  - `flux-kontext-pro` `[capabilities:edit]`, `flux-kontext-max` `[capabilities:edit]`

## recraft

- **Auth:** API Key
- **Models `[type:image]`:** `recraftv3`, `recraftv2`

## runwayml

- **Auth:** API Key
- **Models:**
  - `gen4_image` `[type:image]`, `gen4_image_turbo` `[type:image]`
  - `gen4_turbo` `[type:video]`, `gen3a_turbo` `[type:video]`

---

# Compatible Node (Custom)

- **Auth:** API Key (Bearer atau `x-api-key`)
- **Base URL:** user-defined
- **Format:** `openai` atau `anthropic` (dipilih user saat setup)
- **Env vars:** —
- **Auto-fetch models:** Yes — `GET {baseUrl}/v1/models`
- **Special notes:** Untuk self-hosted (vLLM, LiteLLM, TGI, LM Studio) atau
  provider yang belum punya executor khusus. Live fetch model list dari
  `{baseUrl}/v1/models` (timeout 5s, fail gracefully): OpenAI format `data[].id`;
  Anthropic format `data[].id` atau `models[].id`. Plus CustomModel manual per
  node. Validasi via `POST /api/provider-nodes/validate` sebelum save.

---

## Media Providers (Lain-lain)

### TTS
OpenAI, ElevenLabs, MiniMax, Google TTS, Edge TTS, Gemini, OpenRouter, LocalDevice.
Voices listing juga untuk Deepgram & Inworld. Endpoint: `POST /v1/audio/speech`,
`GET /v1/audio/voices`. Config: `open-sse/config/ttsModels.ts`,
`googleTtsLanguages.ts`.

### STT
Deepgram, AssemblyAI, OpenAI Whisper, HuggingFace, + semua provider dengan
`sttConfig`. Endpoint: `POST /v1/audio/transcriptions`.

### Image Generation
fal.ai, Stability AI, Black Forest Labs (FLUX), Recraft, RunwayML, OpenAI DALL-E,
Gemini, Cloudflare AI, ComfyUI (local), SD WebUI (local), NanoBanana, Codex.
Endpoint: `POST /v1/images/generations`.

### Web Search / Fetch
Provider-backed search + `chatSearch` LLM-wrap fallback. Endpoints:
`POST /v1/search`, `POST /v1/web/fetch`.
