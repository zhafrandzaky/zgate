# ZGate — Provider Catalog

Semua provider yang didukung ZGate. Model: **BYOK (Bring Your Own Key)** — user
wajib setup provider connections sendiri; ZGate tidak menyediakan built-in
provider/credits (Addendum 6).

Per provider didokumentasikan: tipe auth, base URL, format wire, model list,
cara setup, dan special notes.

## Ringkasan

| Provider | Auth | Format | Live model resolver |
|---|---|---|---|
| Claude | OAuth / API key | Anthropic | — |
| Kiro | OAuth (AWS) + social + import | Kiro (CodeWhisperer) | ✓ |
| OpenCode Free | OAuth/device | OpenAI-ish | — |
| Codex | OAuth (ChatGPT) + token import | OpenAI Responses | — |
| GitHub Copilot | OAuth device-code | OpenAI | — |
| Gemini | API key | Gemini | — |
| Gemini CLI | OAuth (Google) | Gemini | — |
| Vertex AI | Service Account JSON | Gemini/Vertex | — |
| Cursor | OAuth + auto-import | Cursor | — |
| Antigravity | OAuth (Google) | Antigravity | — |
| Qwen | OAuth device-code | OpenAI | — |
| iFlow | Cookie auth | OpenAI-ish | — |
| Grok Web | Cookie/web session | Web | — |
| Perplexity Web | Cookie/web session | Web | — |
| Ollama | None (local URL) | Ollama/OpenAI | ✓ |
| OpenRouter | API key | OpenAI | — |
| Azure OpenAI | API key + resource | OpenAI (Azure) | — |
| OpenAI | API key | OpenAI | — |
| GLM | API key | OpenAI-compat | — |
| MiniMax | API key | OpenAI-compat | — |
| Kimi | API key | OpenAI-compat | — |
| Xiaomi TokenPlan | API key/token | OpenAI-compat | — |
| CommandCode | API key/token | CommandCode | — |
| QoderAI | OAuth/credentials | Qoder | ✓ |
| OpenCode Go | OAuth/device | OpenAI-ish | — |
| DeepSeek V4 Flash | API key | OpenAI + Anthropic compat | — |
| DeepSeek V4 Pro | API key | OpenAI + Anthropic compat | — |
| Compatible Node | API key (custom) | OpenAI / Anthropic | ✓ |

---

## Claude (Anthropic)

- **Auth:** OAuth (Claude Pro/Max account) atau Anthropic API key
- **Base URL:** `https://api.anthropic.com`
- **Format:** Anthropic Messages (`/v1/messages`)
- **Models:** `claude-sonnet-4-5`, `claude-opus-4-1`, `claude-haiku-4-5`, dan
  varian terbaru dari Anthropic
- **Setup:** Dashboard → Providers → Add → Claude → pilih OAuth (login flow) atau
  paste API key (`sk-ant-...`)
- **Notes:** OAuth token punya refresh flow — ZGate pre-check expiry dan live
  refresh on 401/403. Header `anthropic-version` wajib disertakan oleh executor.

## Kiro

- **Auth:** OAuth AWS Builder ID / IAM Identity Center + **social login**
  (social-authorize/social-exchange) + auto-import dari instalasi Kiro lokal
- **Base URL:** AWS CodeWhisperer endpoints
- **Format:** Kiro `conversationState` (translator khusus `openai-to-kiro`)
- **Models:** dynamic via `ListAvailableModels` — tiap model di-expand 4 variants:
  base, `-thinking`, `-agentic`, `-thinking-agentic`. Cache 5 menit per credential,
  fallback ke static list jika fetch gagal.
- **Setup:** Dashboard → Providers → Kiro → KiroAuthModal (OAuth / social /
  auto-import / manual import)
- **Notes:** Tool result ada di `conversationState` — RTK punya support khusus.
  Multi-account round-robin sangat berguna di sini (quota per account).

## OpenCode Free

- **Auth:** OAuth/device-code OpenCode account
- **Base URL:** OpenCode endpoint
- **Format:** OpenAI-compatible
- **Models:** free tier models dari OpenCode
- **Setup:** Add provider → OpenCode Free → login flow
- **Notes:** Free tier — rate limits ketat; pasangkan dengan fallback combo.

## Codex (OpenAI ChatGPT)

- **Auth:** OAuth ChatGPT account; juga `import-token` (paste token existing)
- **Base URL:** ChatGPT backend endpoints
- **Format:** OpenAI Responses API
- **Models:** `gpt-5.x-codex` family sesuai subscription
- **Setup:** Add → Codex → OAuth login, atau import token manual
- **Notes:** Pakai Responses API format — translator `openai-responses` menangani
  konversi Chat Completions ↔ Responses. Juga punya image capability (`codex` image
  provider).

## GitHub Copilot

- **Auth:** OAuth device-code GitHub
- **Base URL:** `https://api.githubcopilot.com`
- **Format:** OpenAI-compatible
- **Models:** `gpt-4.1`, `claude-sonnet-4.5` (via Copilot), `gemini-2.5-pro`, dll
  sesuai Copilot plan
- **Setup:** Add → GitHub Copilot → device code → buka github.com/login/device →
  masukkan kode
- **Notes:** Copilot token short-lived — executor refresh otomatis dari GitHub
  OAuth token.

## Gemini (API key)

- **Auth:** Google AI Studio API key
- **Base URL:** `https://generativelanguage.googleapis.com`
- **Format:** Gemini (`generateContent` / `streamGenerateContent`)
- **Models:** `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`, embedding +
  image models
- **Setup:** Add → Gemini → paste API key dari aistudio.google.com
- **Notes:** Translator `openai-to-gemini` menangani role mapping
  (assistant→model), tool calling format, dan inline image parts.

## Gemini CLI

- **Auth:** OAuth Google account (flow yang sama dengan gemini-cli tool)
- **Base URL:** Cloud Code companion endpoints
- **Format:** Gemini
- **Models:** sama dengan Gemini, kuota gratis per Google account
- **Setup:** Add → Gemini CLI → OAuth login Google
- **Notes:** Executor terpisah (`gemini-cli`) karena auth + endpoint berbeda dari
  API-key Gemini.

## Vertex AI

- **Auth:** GCP Service Account JSON (paste/upload)
- **Base URL:** `https://{region}-aiplatform.googleapis.com`
- **Format:** Vertex (Gemini di Vertex + partner models)
- **Models:** Gemini family, Claude via Vertex, Llama via Vertex Model Garden
- **Setup:** Add → Vertex AI → paste service account JSON + pilih region + project
- **Notes:** ZGate generate access token dari service account (JWT grant).
  Translator `openai-to-vertex`.

## Cursor

- **Auth:** OAuth Cursor account + **auto-import** token dari instalasi Cursor lokal
- **Base URL:** Cursor API endpoints
- **Format:** Cursor (translator khusus `openai-to-cursor`)
- **Models:** model yang tersedia di Cursor subscription user
- **Setup:** Add → Cursor → CursorAuthModal (OAuth atau auto-import/manual import)
- **Notes:** Protocol Cursor proprietary — executor `cursor` menangani handshake.

## Antigravity

- **Auth:** OAuth Google (Antigravity IDE account)
- **Base URL:** Antigravity backend
- **Format:** Antigravity (translator `antigravity-to-openai` dua arah)
- **Models:** Gemini family via Antigravity quota
- **Setup:** Add → Antigravity → OAuth login
- **Notes:** Executor khusus `antigravity`.

## Qwen

- **Auth:** OAuth device-code (qwen.ai)
- **Base URL:** Qwen/DashScope endpoints
- **Format:** OpenAI-compatible
- **Models:** `qwen3-coder-plus`, `qwen3-max`, dll
- **Setup:** Add → Qwen → device-code flow
- **Notes:** Free quota per account — multi-account round-robin recommended.

## iFlow

- **Auth:** Cookie auth (paste cookie dari session browser iflow.cn)
- **Base URL:** iFlow endpoints
- **Format:** OpenAI-ish
- **Models:** model list iFlow (Qwen/GLM/DeepSeek mirror)
- **Setup:** Add → iFlow → IFlowCookieModal → paste cookie
- **Notes:** Cookie bisa expire sewaktu-waktu — health monitor menandai connection
  `down` dan dashboard prompt re-paste.

## Grok Web

- **Auth:** Web session/cookie x.com (Grok)
- **Base URL:** Grok web endpoints
- **Format:** Web reverse (executor `grok-web`)
- **Models:** `grok-4`, `grok-4-mini` sesuai akun
- **Setup:** Add → Grok Web → paste session credentials
- **Notes:** Web-reverse provider — best effort, jadikan fallback bukan primary.

## Perplexity Web

- **Auth:** Web session/cookie perplexity.ai
- **Base URL:** Perplexity web endpoints
- **Format:** Web reverse (executor `perplexity-web`)
- **Models:** sonar family via web session
- **Setup:** Add → Perplexity Web → paste session
- **Notes:** Juga berguna sebagai web-search provider (`/v1/search`).

## Ollama

- **Auth:** none (local/remote URL user)
- **Base URL:** `http://localhost:11434` (configurable)
- **Format:** Ollama native + OpenAI-compat endpoint
- **Models:** live dari `GET {baseUrl}/api/tags` → `ollama/{model-name}`;
  fallback ke static list jika tidak reachable
- **Setup:** Add → Ollama → isi base URL instance user
- **Notes:** Executor `ollama-local`. ZGate juga expose `GET /api/tags`
  (Ollama-compatible) agar Ollama clients bisa discover model ZGate.

## OpenRouter

- **Auth:** API key (`sk-or-...`)
- **Base URL:** `https://openrouter.ai/api/v1`
- **Format:** OpenAI-compatible
- **Models:** 200+ models, termasuk `*-free` variants
  (mis. `meta-llama/llama-3.3-70b-instruct:free`)
- **Setup:** Add → OpenRouter → paste API key
- **Notes:** Free models bagus untuk fallback terakhir di combo. Header
  `HTTP-Referer`/`X-Title` optional untuk leaderboard.

## Azure OpenAI

- **Auth:** API key + resource name + deployment
- **Base URL:** `https://{resource}.openai.azure.com`
- **Format:** OpenAI (Azure flavor: `api-version` query + deployment path)
- **Models:** deployment-based (gpt-4o, gpt-4.1, embedding, DALL-E sesuai deployment)
- **Setup:** Add → Azure OpenAI → resource, deployment name, API key, api-version
- **Notes:** Executor `azure` menyusun URL
  `/openai/deployments/{deployment}/chat/completions?api-version=...`.

## OpenAI

- **Auth:** API key (`sk-...`)
- **Base URL:** `https://api.openai.com/v1`
- **Format:** OpenAI (native)
- **Models:** `gpt-5.x`, `gpt-4o`, `o4`, `text-embedding-3-small/large`, `dall-e-3`,
  `whisper-1`, `tts-1`/`gpt-4o-mini-tts`
- **Setup:** Add → OpenAI → paste API key (optional: org ID, project ID)
- **Notes:** Default executor tanpa translasi. Juga provider default untuk
  embeddings (memory system) + TTS/STT/image.

## GLM (Zhipu)

- **Auth:** API key
- **Base URL:** `https://open.bigmodel.cn/api/paas/v4`
- **Format:** OpenAI-compatible
- **Models:** `glm-4.6`, `glm-4.5-air`, dll
- **Setup:** Add → GLM → paste API key
- **Notes:** Coding plan endpoint berbeda — bisa diconfig via custom baseUrl.

## MiniMax

- **Auth:** API key (+ group ID)
- **Base URL:** `https://api.minimax.io/v1` (atau region China)
- **Format:** OpenAI-compatible
- **Models:** `MiniMax-M2`, `abab` family; TTS: `speech-02-hd` dll
- **Setup:** Add → MiniMax → API key + group ID
- **Notes:** Juga TTS provider (voices via
  `/api/media-providers/tts/minimax/voices`).

## Kimi (Moonshot)

- **Auth:** API key
- **Base URL:** `https://api.moonshot.ai/v1`
- **Format:** OpenAI-compatible
- **Models:** `kimi-k2`, `kimi-k2-thinking`, `moonshot-v1` family
- **Setup:** Add → Kimi → paste API key
- **Notes:** Long-context strong — capability router menandai `long_context`.

## Xiaomi TokenPlan

- **Auth:** API key/token TokenPlan
- **Base URL:** Xiaomi TokenPlan endpoints
- **Format:** OpenAI-compatible
- **Models:** sesuai paket TokenPlan user
- **Setup:** Add → Xiaomi TokenPlan → paste token
- **Notes:** Executor `xiaomi-tokenplan` menangani header khusus + quota tracking.

## CommandCode

- **Auth:** API key/token
- **Base URL:** CommandCode endpoints
- **Format:** CommandCode (translator `openai-to-commandcode`)
- **Models:** model list CommandCode
- **Setup:** Add → CommandCode → kredensial
- **Notes:** Executor `commandcode`.

## QoderAI

- **Auth:** OAuth/credentials Qoder account
- **Base URL:** Qoder API
- **Format:** Qoder
- **Models:** **dynamic per account** — live resolver `resolveQoderModels`
- **Setup:** Add → QoderAI → login flow
- **Notes:** Model list berubah per account/waktu; cache 5 menit.

## OpenCode Go

- **Auth:** OAuth/device OpenCode
- **Base URL:** OpenCode Go endpoint
- **Format:** OpenAI-ish
- **Models:** OpenCode Go tier
- **Setup:** Add → OpenCode Go → login flow
- **Notes:** Executor `opencode-go`, terpisah dari OpenCode Free.

---

## DeepSeek V4 Flash & V4 Pro ★

- **Auth:** API key (`sk-...` dari platform.deepseek.com)
- **Base URL (OpenAI-compatible):** `https://api.deepseek.com`
- **Base URL (Anthropic-compatible):** `https://api.deepseek.com/anthropic`
- **Format:** OpenAI Chat Completions DAN Anthropic Messages — executor pilih
  sesuai kebutuhan translasi
- **Models:** `deepseek-v4-flash`, `deepseek-v4-pro`

### Thinking Mode

Request body (OpenAI-compat):
```json
{
  "model": "deepseek-v4-pro",
  "messages": [...],
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high"
}
```
- `thinking.type`: `"enabled"` | `"disabled"`
- `reasoning_effort`: `"high"` | `"max"` (effort level saat thinking enabled)
- Response: **`reasoning_content` terpisah dari `content`** — di streaming, delta
  thinking datang di `delta.reasoning_content`. Translator memetakan ini ke
  Anthropic `thinking` blocks untuk client Claude-format dan menjaga keduanya
  tetap terpisah untuk client OpenAI-format.

### Pricing (per 1M tokens)

| Model | Input | Output |
|---|---|---|
| `deepseek-v4-flash` | $0.14 | $0.28 |
| `deepseek-v4-pro` | $0.435 | $0.87 |

Executor DeepSeek pricing-aware: cost dihitung dari usage dan dicatat ke
UsageEntry (`costUsd`).

### Error Codes

| Code | Arti | Handling ZGate |
|---|---|---|
| 400 | Invalid request body/params | Tidak retry — fix request; fallback combo |
| 401 | API key salah/expired | Tandai connection error, fallback |
| 402 | Saldo habis (insufficient balance) | Skip connection, fallback; WS notify |
| 422 | Parameter tidak valid (semantik) | Tidak retry; fallback combo |
| 429 | Rate limit | Account round-robin + exponential backoff |
| 500 | Server error | Retry 1x → fallback |
| 503 | Server overloaded | Fallback langsung |

### Setup

Dashboard → Providers → Add → DeepSeek → `DeepSeekForm`:
API key + default model select (`v4-flash`/`v4-pro`) + thinking mode toggle +
reasoning effort selector.

### Special Notes

- `deepseek-v4-flash` adalah default `MEMORY_EXTRACTION_MODEL` (murah + cepat).
- Anthropic-compat endpoint memungkinkan Claude Code dipoint langsung; lewat ZGate
  hal ini sudah ditangani translator, jadi gunakan endpoint OpenAI-compat saja.
- Context caching otomatis di sisi DeepSeek (hit lebih murah) — tidak perlu config.

---

## Compatible Node (Custom)

- **Auth:** API key custom (Bearer atau `x-api-key`)
- **Base URL:** apapun yang diisi user
- **Format:** `openai` atau `anthropic` (dipilih saat setup)
- **Models:** live fetch `GET {baseUrl}/models` (timeout 5s, fail gracefully):
  OpenAI format `data[].id`; Anthropic format `data[].id` atau `models[].id`.
  Plus CustomModel manual per node.
- **Setup:** Add → Compatible Node → nama + baseUrl + format + API key →
  `POST /api/provider-nodes/validate` sebelum save
- **Notes:** Untuk self-hosted (vLLM, LiteLLM, TGI, LM Studio) atau provider yang
  belum punya executor khusus.

---

## Media Providers

### TTS
OpenAI, ElevenLabs, MiniMax, Google TTS, Edge TTS, Gemini, OpenRouter, LocalDevice.
Voices listing juga untuk Deepgram & Inworld. Endpoint: `POST /v1/audio/speech`,
`GET /v1/audio/voices`. Config: `open-sse/config/ttsModels.ts`,
`googleTtsLanguages.ts`.

### STT
OpenAI Whisper, Deepgram, HuggingFace, + semua provider dengan `sttConfig`.
Endpoint: `POST /v1/audio/transcriptions`.

### Image Generation
OpenAI DALL-E, Black Forest Labs (FLUX), fal.ai, Stability AI, RunwayML,
HuggingFace, Gemini, Cloudflare AI, ComfyUI (local), SD WebUI (local), NanoBanana,
Codex. Endpoint: `POST /v1/images/generations`.

### Web Search / Fetch
Provider-backed search + `chatSearch` LLM-wrap fallback.
Endpoints: `POST /v1/search`, `POST /v1/web/fetch`.

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
