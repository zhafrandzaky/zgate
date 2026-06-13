# ZGate

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-latest-black.svg)](https://bun.sh)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Route to any AI, never stop coding.** A hosted, multi-user AI gateway and router with one OpenAI-compatible endpoint.

## Overview

ZGate is a hosted multi-user SaaS AI gateway. Each user registers with email (OTP verification), connects their own provider credentials (**BYOK — Bring Your Own Key**; ZGate does not bundle providers or credits), generates a ZGate API key (`sk-zg-...`), and points any tool (Claude Code, Cursor, Codex, Cline, and more) at a single endpoint: `https://zgate.ziron.dev/v1`.

Behind that endpoint, ZGate translates request and response formats across providers (OpenAI, Anthropic, Gemini, Kiro, Cursor, and others), runs **full seamless combo fallback** (the client never knows a fallback happened), saves input tokens through the **RTK** Rust engine, stores **persistent cross-session memory** via pgvector, and reports usage in real time over WebSocket.

There are no plans or tiers at launch — every user is equal. A personal cost budget is available as a per-user control.

## Features

- **Full Seamless Fallback** — client tidak pernah tahu ada fallback selama masih ada provider tersedia; chunk IDs di-rewrite continuous.
- **RTK Token Saver** — hemat 20-40% token input, output AI tetap 100% sama (hanya `tool_result` di input yang dikompres).
- **Persistent AI Memory** — ingat konteks lintas sesi dengan 3 scope (global / project / session) lewat pgvector semantic search.
- **40+ Provider Support** — Claude, DeepSeek, Gemini, OpenAI, Kiro, Cursor, dan banyak lagi.
- **Combo System** — urutan fallback drag-drop: PRIMARY -> FALLBACK 1 -> FALLBACK 2.
- **Multi-User SaaS** — tiap user punya provider connections, combos, dan API keys sendiri, terisolasi penuh.
- **Real-time Dashboard** — usage stats, provider health, dan push update via WebSocket.
- **Secure by Design** — OTP email, argon2id password hashing, JWT sessions, HMAC API keys, AES-256-GCM credential encryption.
- **CLI Tool** — manage ZGate langsung dari terminal.
- **OpenAI + Anthropic Compatible** — drop-in replacement endpoint untuk tool apapun.

## Supported Providers

| Provider | Auth | Format | Live model resolver |
|---|---|---|---|
| Claude | OAuth / API key | Anthropic | - |
| Kiro | OAuth (AWS) + social + import | Kiro (CodeWhisperer) | yes |
| OpenCode Free | OAuth/device | OpenAI-ish | - |
| Codex | OAuth (ChatGPT) + token import | OpenAI Responses | - |
| GitHub Copilot | OAuth device-code | OpenAI | - |
| Gemini | API key | Gemini | - |
| Gemini CLI | OAuth (Google) | Gemini | - |
| Vertex AI | Service Account JSON | Gemini/Vertex | - |
| Cursor | OAuth + auto-import | Cursor | - |
| Antigravity | OAuth (Google) | Antigravity | - |
| Qwen | OAuth device-code | OpenAI | - |
| iFlow | Cookie auth | OpenAI-ish | - |
| Grok Web | Cookie/web session | Web | - |
| Perplexity Web | Cookie/web session | Web | - |
| Ollama | None (local URL) | Ollama/OpenAI | yes |
| OpenRouter | API key | OpenAI | - |
| Azure OpenAI | API key + resource | OpenAI (Azure) | - |
| OpenAI | API key | OpenAI | - |
| GLM | API key | OpenAI-compat | - |
| MiniMax | API key | OpenAI-compat | - |
| Kimi | API key | OpenAI-compat | - |
| Xiaomi TokenPlan | API key/token | OpenAI-compat | - |
| CommandCode | API key/token | CommandCode | - |
| QoderAI | OAuth/credentials | Qoder | yes |
| OpenCode Go | OAuth/device | OpenAI-ish | - |
| DeepSeek V4 Flash | API key | OpenAI + Anthropic compat | - |
| DeepSeek V4 Pro | API key | OpenAI + Anthropic compat | - |
| Compatible Node | API key (custom) | OpenAI / Anthropic | yes |

Plus media providers for TTS, STT, image generation, and web search/fetch. See [docs/PROVIDERS.md](docs/PROVIDERS.md) for the full catalog and setup notes.

## Quick Start

### 1. Register and Connect Your Provider

Register at `https://zgate.ziron.dev`, verify the OTP sent to your email, then open the dashboard and add your first provider connection (BYOK) under **Providers -> Add**.

### 2. Create a Combo

Go to **Combos**, create a combo, and add models in fallback order. The top item is PRIMARY; the rest are fallbacks used in sequence when the one above fails.

```
[kiro/claude-sonnet-4.5] -> [deepseek/deepseek-v4-flash] -> [openrouter/llama-3.3-70b-free]
PRIMARY                     FALLBACK 1                       FALLBACK 2
```

### 3. Use with Your Tools

Generate a ZGate API key under **Keys**, then point your tool at the ZGate endpoint. Use the combo name as the model.

Claude Code:

```bash
export ANTHROPIC_BASE_URL=https://zgate.ziron.dev
export ANTHROPIC_API_KEY=sk-zg-xxxx
```

Cursor / Codex / any OpenAI-compatible client:

```bash
export OPENAI_BASE_URL=https://zgate.ziron.dev/v1
export OPENAI_API_KEY=sk-zg-xxxx
```

Request body uses your combo name as the model:

```json
{
  "model": "my-ai-stack",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": true
}
```

## Self-Hosting

Full deployment guide: [docs/deployment/DEPLOY.md](docs/deployment/DEPLOY.md). Fly.io is the primary platform; Railway is available as an alternative.

Local development quick start:

```bash
bun install
cp .env.example .env
docker compose up -d postgres redis mailpit
bunx prisma migrate dev
cd rtk && cargo build --release && cd ..
bun dev
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime / package manager | Bun (latest) |
| Framework | Next.js 15 (App Router) |
| Language | TypeScript strict |
| Database | PostgreSQL 16 + pgvector |
| Cache / Pub-Sub | Redis 7 |
| RTK engine | Rust (latest stable) |
| Styling | Tailwind v4 |
| Animation | Motion v12 |
| ORM | Prisma |
| WebSocket | Bun native sidecar |

## Project Structure

```
app/                  Landing, auth, dashboard, admin, API routes
  (landing)/          Public landing page
  (auth)/             Login, register, verify
  dashboard/          User dashboard (providers, combos, keys, usage, ...)
  zyy/admin/          Admin dashboard (separate login)
src/
  middleware.ts       JWT / admin JWT / API key guard
  lib/                env, db, redis, auth, otp, apiKey, rtk, memory, ws, webhook
  app/api/            auth, providers, keys, combos, usage, admin, v1, v1beta
  hooks/              useWebSocket, useRealtimeUsage, ...
open-sse/             chatCore, executors, translators, fallback engine
rtk/                  Rust crate (RTK token saver engine)
ws-server/            Bun native WebSocket sidecar (port 3001)
emails/               React Email templates
cli/                  CLI tool
prisma/               schema.prisma + migrations
scripts/              init-db.sql, setup.sh, seed.ts
tests/                unit + integration
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full module mapping and system design.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening a pull request.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
Copyright 2026 [Ziona Zyy](https://github.com/zhafrandzaky)
