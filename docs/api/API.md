# ZGate — API Reference

Semua endpoint ZGate. Auth types:

| Auth | Mekanisme | Dipakai oleh |
|---|---|---|
| `public` | Tanpa auth | Landing, register, login |
| `user-jwt` | JWT HttpOnly cookie (`JWT_SECRET`) | Dashboard APIs |
| `admin-jwt` | Admin JWT HttpOnly cookie (`JWT_ADMIN_SECRET`) | `/api/admin/*` |
| `api-key` | `Authorization: Bearer sk-zg-...` (HMAC verify) | `/v1/*`, `/v1beta/*` |

### Format response standar (management APIs)

```json
{ "success": true,  "data": { ... }, "error": null }
{ "success": false, "data": null,    "error": { "code": "...", "message": "..." } }
```

Paginated: `{ "success": true, "data": [...], "meta": { "total": 120, "page": 1, "limit": 20 } }`

### Error codes umum

| HTTP | code | Arti |
|---|---|---|
| 400 | `invalid_request` | Body/query tidak valid (Zod) |
| 401 | `unauthorized` | Tidak ada/invalid JWT atau API key |
| 402 | `budget_exceeded` | Cost budget user tercapai |
| 403 | `forbidden` | Role tidak cukup / banned / belum verified |
| 404 | `not_found` | Resource tidak ditemukan atau bukan milik user |
| 409 | `conflict` | Duplikat (email, alias, nama) |
| 422 | `unprocessable` | Format valid tapi semantik salah |
| 429 | `rate_limited` | Rate limit / OTP suspend (+ `Retry-After`) |
| 500 | `internal_error` | Server error |
| 503 | `maintenance` | Maintenance mode aktif |

---

## 1. Public

### `GET /`
Landing page (HTML). Auth: `public`.

### `POST /api/auth/register`
Auth: `public`. Rate limit: 3 attempts/jam per IP.

Request:
```json
{ "email": "user@example.com", "password": "min-8-chars" }
```
Response `200`: `{ "success": true, "data": { "userId": "...", "otpSent": true } }`
— user dibuat `isVerified=false`, OTP 6-digit dikirim via email (expiry 10 menit).

Errors: `400` invalid email/password, `409` email sudah terdaftar, `429` rate limit.

### `POST /api/auth/verify-otp`
Auth: `public`.

Request:
```json
{ "email": "user@example.com", "code": "123456" }
```
Response `200`: set JWT HttpOnly cookie, `{ "success": true, "data": { "verified": true } }`.

Errors: `400` kode salah (`attemptsLeft` di error payload), `410` kode expired,
`429` suspended 1 jam setelah 3x salah (`suspendedUntil` di payload).

### `POST /api/auth/resend-otp`
Auth: `public`. Cooldown 60 detik (Redis).

Request: `{ "email": "user@example.com" }`
Response `200`: `{ "success": true, "data": { "otpSent": true } }`
Errors: `429` cooldown belum lewat (`retryAfterSeconds`), `404` email tidak ada.

### `POST /api/auth/login`
Auth: `public`. Rate limit: 5 attempts/15 menit per IP.

Request: `{ "email": "...", "password": "..." }`
Response `200`: set JWT cookie, `{ "success": true, "data": { "user": { "id", "email" } } }`
Errors: `401` kredensial salah, `403` belum verified (`code: "not_verified"`) atau
banned (`code: "banned"`, include `bannedReason`), `429` rate limit.

### `POST /api/auth/logout`
Auth: `user-jwt`. Clear cookie. Response `200`: `{ "success": true }`.

### `GET /api/auth/me`
Auth: `user-jwt`. Response `200`: current user info (id, email, role, createdAt).
Error: `401`.

### OIDC (roadmap v2 — Addendum 9 defer)
- `GET /api/auth/oidc/start` — initiate OIDC flow (redirect ke IdP, PKCE + state + nonce)
- `GET /api/auth/oidc/callback` — exchange code, create session
- `POST /api/auth/oidc/test` — admin test OIDC config
Errors: `400` invalid state/nonce, `502` IdP unreachable.

---

## 2. User API (auth: `user-jwt`)

Semua route di bawah WAJIB filter `userId` dari JWT (AGENTS.md §5).
Error umum semua route: `401` no session, `403` banned.

### Providers

#### `GET /api/providers`
List provider connections user. Query: `?provider=`, `?isActive=`.
Response: array connection (TANPA secrets — token/key di-mask).

#### `POST /api/providers`
Request:
```json
{
  "provider": "deepseek",
  "authType": "apikey",
  "name": "DeepSeek main",
  "apiKey": "sk-...",
  "baseUrl": null,
  "priority": 1,
  "metadata": { "thinking": "enabled" }
}
```
Response `201`: connection (masked). Errors: `400`, `422` provider tidak dikenal.

#### `GET /api/providers/[id]` / `PATCH` / `DELETE`
Detail, update, hapus connection. `404` jika bukan milik user.

#### `POST /api/providers/[id]/test`
Kirim minimal request ke provider. Response:
`{ "success": true, "data": { "status": "ok", "responseMs": 412, "model": "..." } }`
Errors: `502` provider error (include upstream status + message).

#### `POST /api/providers/[id]/test-models`
Test semua models satu provider (background). Response `202`: `{ "started": true }`,
hasil per-model via WS `provider:status` + tersimpan di ModelTestResult.

#### `POST /api/providers/test-batch`
Test SEMUA connections user sekaligus (background job).
Response `202`: `{ "started": true, "count": 5 }`. Hasil via WS `provider:status`.

#### `POST /api/providers/validate`
Validate provider config sebelum save (tanpa persist).
Request: sama dengan POST /api/providers. Response: `{ "valid": true|false, "errors": [...] }`.

#### `GET /api/providers/client`
Provider info untuk client-side rendering — NO secrets (nama, type, status saja).

#### `GET /api/providers/suggested-models`
Suggest recommended models saat user tambah provider baru.
Query: `?provider=kiro`. Filter berdasarkan provider type + existing setup user.
Response: `{ "suggestions": [{ "model": "...", "reason": "..." }] }`.

#### `GET /api/providers/kilo/free-models`
Kilo free model list. Response: array model IDs.

### Provider Nodes (custom compatible endpoints)

#### `GET|POST /api/provider-nodes`
CRUD compatible nodes (custom baseUrl, format openai|anthropic).
POST request: `{ "name", "baseUrl", "format", "apiKey" }`.

#### `POST /api/provider-nodes/validate`
Validate compatible node config (hit `{baseUrl}/models`, timeout 5s).
Response: `{ "valid": true, "modelsFound": 12 }` atau `{ "valid": false, "error": "..." }`.

### OAuth

#### `GET|POST /api/oauth/[provider]/[action]`
Generic OAuth flow. `provider`: claude|gemini|gemini-cli|codex|github|qwen|kiro|
cursor|antigravity|iflow. `action`: `start` (return authorize URL / device code),
`poll` (device-code polling: `pending|complete`), `callback`, `refresh`, `revoke`.
Errors: `400` unknown provider/action, `408` device-code expired, `502` upstream.

Special flows (GAP 16):
- `POST /api/oauth/cursor/auto-import` — auto-import Cursor token dari filesystem client
- `POST /api/oauth/cursor/import` — manual paste import
- `POST /api/oauth/kiro/auto-import` — auto-import Kiro credentials
- `POST /api/oauth/kiro/import`
- `POST /api/oauth/kiro/social-authorize` — Kiro social login (return URL)
- `POST /api/oauth/kiro/social-exchange` — exchange social code → tokens
- `POST /api/oauth/codex/import-token` — import Codex token
- `POST /api/oauth/gitlab/pat` — GitLab Personal Access Token
- `POST /api/oauth/iflow/cookie` — iFlow cookie auth (paste cookie)

### API Keys

#### `GET /api/keys`
List ZGate API keys user (prefix + name + lastUsedAt; TIDAK pernah full key).

#### `POST /api/keys`
Request: `{ "name": "laptop-claude-code" }`
Response `201`: `{ "key": "sk-zg-xxxxxxxx...", "id": "..." }` — **full key hanya
sekali di response ini** (one-time reveal). Server simpan HMAC hash saja.

#### `PATCH /api/keys/[id]` — rename / toggle isActive.
#### `DELETE /api/keys/[id]` — revoke. `404` bukan milik user.

### Models

#### `GET /api/models`
List semua models user dari semua active connections (live + static + custom,
minus disabled). Lihat Model Resolution Pipeline di ARCHITECTURE.md §12.

#### `GET|POST|DELETE /api/models/custom`
CRUD custom models per user per provider connection.
POST: `{ "providerConnectionId", "modelId", "displayName", "kind": "llm" }`.
`409` duplikat (unique userId+connection+modelId).

#### `GET|POST /api/models/disabled`
GET: list disabled models. POST toggle:
`{ "providerAlias": "kiro", "modelId": "claude-sonnet-4.5", "disabled": true }`.

#### `GET|POST|DELETE /api/models/alias`
Model aliases per user. POST: `{ "alias": "fast", "target": "deepseek/deepseek-v4-flash" }`.
`409` alias sudah ada.

#### `GET /api/models/availability`
Check availability semua models (atau `?connectionId=`). Untuk compatible
providers: fetch `{baseUrl}/models` live. Response: per-model availability status.

#### `POST /api/models/test`
Ping test model tertentu. Request: `{ "connectionId", "modelId" }`.
Response: `{ "status": "success|failed|slow", "responseMs": 850 }` (disimpan ke
ModelTestResult).

### Combos

#### `GET /api/combos`
List combos user dengan chain visual data.

#### `POST /api/combos`
Request:
```json
{
  "name": "main",
  "strategy": "fallback",
  "models": [
    { "provider": "kiro", "model": "claude-sonnet-4.5" },
    { "provider": "deepseek", "model": "deepseek-v4-flash" },
    { "provider": "openrouter", "model": "llama-3.3-70b-free" }
  ]
}
```
Urutan array = urutan eksekusi (index 0 = PRIMARY). `strategy`: `fallback` (default)
| `round-robin`. `409` nama combo duplikat.

#### `GET|PATCH|DELETE /api/combos/[id]` — detail/update (termasuk reorder)/delete.

### Pricing

#### `GET /api/pricing`
Pricing table per provider/model (USD per 1M tokens input/output).
Query: `?provider=deepseek`.

### Usage

#### `GET /api/usage`
Summary usage user. Query: `?from=&to=&groupBy=provider|model|day`.
Response: totals (requests, promptTokens, completionTokens, costUsd) + breakdown.

#### `GET /api/usage/logs`
Request logs paginated. Query: `?page=&limit=&provider=&model=&status=`.

#### `GET /api/usage/providers` — per-provider usage stats (quota tracking).
#### `GET /api/usage/stats` — summary stats (today/week/month).
#### `GET /api/usage/chart` — chart data (timeseries per provider).
#### `GET /api/usage/stream` — SSE stream live usage events.
#### `GET /api/usage/request-details?id=` — detail satu request (request/response
meta, fallback chain, timing). Storage: `src/lib/requestDetailsDb.ts`.
#### `GET /api/usage/request-logs` — raw request logs.
#### `GET /api/usage/[connectionId]` — usage per provider connection.

### Settings & Profile

#### `GET|PATCH /api/settings`
User settings: `rtkEnabled`, `memoryEnabled`, `maxCostPerRequest`, `maxCostPerDay`,
`maxCostPerMonth`, `locale`, preferences. PATCH partial update.

#### `GET|PATCH /api/profile`
Profile: email (read-only), password change (`{ "currentPassword", "newPassword" }`
→ `401` jika current salah), delete account flow.

#### `GET|PUT /api/locale`
Get/set locale preference (`en` | `id` saat launch; full i18n roadmap v2).

### Sync

#### `GET|POST /api/sync/cloud`
Multi-device sync per user. GET: pull state (connections/combos/settings versioned).
POST: push state. Conflict resolution: newer token wins. Error tidak stop local
runtime di client.

### Memory

#### `GET /api/memory`
List memories user. Query: `?scope=GLOBAL|PROJECT|SESSION&workingDir=&page=`.

#### `DELETE /api/memory` — clear ALL memories user (konfirmasi di UI).
#### `GET|PATCH|DELETE /api/memory/[id]` — detail / edit content (re-embed) / delete.
#### `POST /api/memory/search`
Semantic search manual. Request: `{ "query": "...", "scope?", "workingDir?", "topK": 5 }`.
Response: matches dengan similarity score.

#### `GET /api/sessions` — list conversation sessions (workingDir, summary, counts).
#### `GET /api/sessions/[id]` — detail session + memories yang diekstrak dari session ini.

### Webhooks

#### `GET|POST /api/webhooks`
CRUD webhooks. POST: `{ "url": "https://...", "events": ["provider.down",
"budget.warning", "quota.exceeded", "fallback.occurred"] }`.
Response `201` include `secret` (HMAC signing key) — reveal sekali.
Delivery: POST ke URL user + header `X-ZGate-Signature: sha256=<hex>`,
retry 3x exponential backoff (5s, 30s, 5min), delivery log tersimpan.

#### `GET|PATCH|DELETE /api/webhooks/[id]` + `POST /api/webhooks/[id]/test`
Test: kirim sample payload. Response include delivery result.

### User Audit Log

#### `GET /api/audit-log`
Aktivitas akun user sendiri, paginated, last 90 hari. Actions: LOGIN, LOGOUT,
PROVIDER_ADD, PROVIDER_DELETE, KEY_CREATE, KEY_REVOKE, COMBO_CREATE,
SETTINGS_CHANGE, PASSWORD_CHANGE.

### Proxy Pools

#### `GET|POST /api/proxy-pools`
CRUD proxy pools. POST: `{ "name", "proxyUrl", "noProxy?", "type":
"http|vercel|cloudflare|deno", "strictProxy": false }`.

#### `GET|PATCH|DELETE /api/proxy-pools/[id]`
#### `POST /api/proxy-pools/[id]/test` — test connectivity lewat proxy.
#### `POST /api/proxy-pools/vercel-deploy` — one-click deploy proxy worker ke Vercel.
#### `POST /api/proxy-pools/cloudflare-deploy` — deploy ke Cloudflare Workers.
#### `POST /api/proxy-pools/deno-deploy` — deploy ke Deno Deploy.
Errors: `502` deploy gagal (include platform error).

### CLI Tools Auto-Config

`GET` per tool — generate config siap-paste (endpoint + API key placeholder):
- `/api/cli-tools/claude-settings` — claude.json config
- `/api/cli-tools/codex-settings`
- `/api/cli-tools/cline-settings`
- `/api/cli-tools/openclaw-settings`
- `/api/cli-tools/opencode-settings`
- `/api/cli-tools/copilot-settings`
- `/api/cli-tools/cowork-settings`
- `/api/cli-tools/deepseek-tui-settings`
- `/api/cli-tools/droid-settings`
- `/api/cli-tools/hermes-settings`
- `/api/cli-tools/jcode-settings`
- `/api/cli-tools/kilo-settings`
- `GET /api/cli-tools/all-statuses` — status configured/not semua tools sekaligus
- `GET /api/cli-tools/cowork-mcp-registry` — Cowork MCP registry
- `GET /api/cli-tools/cowork-mcp-tools` — MCP tools list

### Translator Debug (dev tool)

- `POST /api/translator/send` — kirim test request lewat translator (real call)
- `POST /api/translator/translate` — translate request TANPA send (dry run)
- `GET /api/translator/load?id=` — load saved translation log
- `POST /api/translator/save` — save translation untuk replay
- `GET /api/translator/console-logs` — get translation logs
- `GET /api/translator/console-logs/stream` — SSE stream live logs

### Media Providers (TTS voices)

- `GET /api/media-providers/tts/voices` — semua voices dari semua providers
- `GET /api/media-providers/tts/elevenlabs/voices`
- `GET /api/media-providers/tts/minimax/voices`
- `GET /api/media-providers/tts/deepgram/voices`
- `GET /api/media-providers/tts/inworld/voices`

### Tags (Ollama-compatible)

#### `GET /api/tags`
Return models user dalam format Ollama `{ "models": [{ "name", "model", ... }] }` —
memungkinkan Ollama-compatible clients discover ZGate models.

### Health

#### `GET /api/health`
Public-ish health check (ping DB + Redis). Response: `{ "status": "ok", "db": true,
"redis": true }`. `503` jika dependency down.

#### `GET /api/health/providers`
Auth: `user-jwt`. Status semua provider connections user dari health monitor
(Redis `health:{provider}:{connectionId}`): `up|down|degraded`, responseMs,
errorRate, lastChecked.

### MCP (roadmap v2 — Addendum 9 defer)

- `GET /api/mcp/[plugin]/sse` — MCP SSE endpoint
- `POST /api/mcp/[plugin]/message` — MCP message endpoint

---

## 3. Admin API (auth: `admin-jwt`, prefix `/api/admin/*`)

Semua aksi mutasi dicatat ke AdminLog. Error umum: `401` no admin session,
`403` bukan ADMIN.

### `GET /api/admin/users`
List semua user. Query: `?page=&limit=&search=&status=active|banned|unverified`.
Response paginated: id, email, isVerified, isBanned, createdAt, usage ringkas.

### `GET /api/admin/users/[id]`
Detail user: profile, connections count (read-only, tanpa secrets), usage,
rate-limit overrides, audit trail.

### `POST /api/admin/users/[id]/ban`
Request: `{ "reason": "abuse" }`. Set isBanned + bannedAt + bannedReason, revoke
semua session + API keys aktif, kirim BanNotificationEmail. Response `200`.
`404` user tidak ada, `409` sudah banned.

### `POST /api/admin/users/[id]/unban`
Unban + notifikasi. `409` tidak sedang banned.

### `DELETE /api/admin/users/[id]`
Hapus user permanen (cascade semua data). `409` jika target adalah admin.

### `GET /api/admin/usage`
Global usage stats. Query: `?from=&to=&groupBy=user|provider|model|day`.

### `GET /api/admin/usage/logs`
Global request logs paginated + filter per user/provider/status.

### `POST /api/admin/maintenance`
Request: `{ "active": true, "message": "Upgrading database" }`.
Set Redis `maintenance:active`; publish `maintenance:on|off` ke `ws:global`;
semua `/v1/*` return 503 saat aktif. Response: current state.

### `GET /api/admin/stats`
Dashboard stats: total users, requests today, cost today, active connections,
top providers, signups 7 hari.

### `POST /api/admin/broadcast`
Request: `{ "subject": "...", "message": "...", "channel": "email|in-app|both" }`.
Email ke semua user (batched) dan/atau WS `admin:broadcast`. Response `202`:
`{ "queued": 1234 }`.

### `GET /api/admin/audit-log`
Semua aksi admin paginated: adminId, action, targetId, targetType, metadata,
createdAt. Filter: `?action=&adminId=&from=&to=`.

### `POST /zyy/admin/api/auth/login` / `POST /zyy/admin/api/auth/logout`
Admin login/logout — terpisah total dari user auth, signed dengan
`JWT_ADMIN_SECRET`. `401` kredensial salah, `403` bukan role ADMIN.

---

## 4. Compatibility API (auth: `api-key`)

Semua route: maintenance check (503), rate limit (429 + `X-RateLimit-*` +
`Retry-After`), budget check (402), request dedup. **Error format mengikuti standar
provider yang diminta client** (OpenAI error object untuk `/v1/*` OpenAI-style,
Anthropic error object untuk `/v1/messages` & `/v1beta/*`).

### `POST /v1/chat/completions`
OpenAI Chat Completions compatible. Request: standar OpenAI (`model`, `messages`,
`stream`, `tools`, `temperature`, dll). `model` bisa: nama combo | alias |
`provider/model`.

Custom headers (memory system):
```
X-ZGate-Working-Dir: /absolute/path/to/project
X-ZGate-Session-Id: <uuid>
X-ZGate-Memory: off
X-ZGate-Memory-Scope: global
```
Response: OpenAI format (stream SSE atau JSON). Fallback combo full seamless —
chunk IDs di-rewrite continuous, tidak ada event recovery ke client.

Errors (OpenAI format): `400` invalid body, `401` invalid key, `402` budget,
`404` model not found, `429` rate limit, `502` semua provider gagal (aggregate
error info), `503` maintenance.

### `POST /v1/messages`
Anthropic Messages compatible (`model`, `messages`, `max_tokens`, `system`,
`stream`). Response & error: Anthropic format (`type: "error"`).

### `POST /v1/messages/count_tokens`
Anthropic count tokens. Response: `{ "input_tokens": 1234 }`.

### `POST /v1/responses`
OpenAI Responses API compatible (termasuk `function_call_output` items).

### `POST /v1/responses/compact`
Compact mode — strip unnecessary fields untuk mengurangi response size
(transformer: `responsesTransformer.ts`, `streamToJsonConverter.ts`).

### `GET /v1/models`
OpenAI models list — hasil Model Resolution Pipeline (combos di posisi pertama,
lalu semua model dari connections user). Response: `{ "object": "list", "data": [...] }`.

### `GET /v1/models/[kind]`
Filter by capability kind: `llm` | `image` | `tts` | `embedding` | `stt` | `web`.
Contoh: `GET /v1/models/image` → hanya image generation models.

### `GET /v1/models/info?id=kiro/claude-sonnet-4.5`
Detail model: capabilities, context window, pricing, dimensions (embedding).
`404` model tidak dikenal.

### `POST /v1/embeddings`
OpenAI embeddings compatible. Request: `{ "model", "input": "..."|["..."] }`.
Routed ke embedding-capable connection user.

### `POST /v1/images/generations`
OpenAI images compatible. Routed ke image provider user (DALL-E, FLUX, fal.ai,
Stability, dll). Request: `{ "model", "prompt", "n", "size" }`.

### `POST /v1/audio/speech`
OpenAI TTS compatible. Request: `{ "model", "input", "voice", "response_format" }`.
Response: audio binary. Providers: OpenAI, ElevenLabs, MiniMax, Google TTS,
Edge TTS, Gemini, OpenRouter, LocalDevice.

### `GET /v1/audio/voices`
List available voices semua TTS providers user.

### `POST /v1/audio/transcriptions`
OpenAI STT compatible (multipart file + `model`). Providers: Whisper, Deepgram,
HuggingFace, dll. Response: `{ "text": "..." }`.

### `POST /v1/search`
Web search. Request: `{ "query": "...", "provider?", "maxResults?" }`.
Response: normalized results `[{ "title", "url", "snippet" }]`.
Fallback `chatSearch`: wrap LLM untuk search jika tidak ada search provider.

### `POST /v1/web/fetch`
Web page fetch. Request: `{ "url": "...", "format": "markdown|text|html" }`.
Response: page content. Errors: `400` invalid URL, `502` fetch gagal.

### `GET /v1beta/models`
Anthropic-compatible models list (`/v1beta` namespace). Response Anthropic format.

---

## 5. Rate Limit Headers

Semua `/v1/*` responses menyertakan:

```
X-RateLimit-Limit-Minute: 60
X-RateLimit-Remaining-Minute: 57
X-RateLimit-Limit-Hour: 1000
X-RateLimit-Remaining-Hour: 943
Retry-After: 12        ← hanya saat 429
```

Defaults (admin dapat override per user): `/v1/*` 60 req/menit + 1000 req/jam;
login 5/15 menit per IP; register 3/jam per IP; resend-otp cooldown 60s.
