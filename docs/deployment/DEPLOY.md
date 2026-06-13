# ZGate — Deployment Guide

Target produksi: `https://zgate.ziron.dev` — **Fly.io sebagai platform utama**,
Cloudflare DNS. Railway tersedia sebagai alternatif opsional (lihat §7).

---

## 1. Prerequisites

| Tool | Versi | Keterangan |
|---|---|---|
| Bun | latest LTS | Runtime + package manager |
| Rust toolchain | latest stable | Build RTK engine (`cargo`) |
| Docker + Docker Compose | latest | Dev stack (PG, Redis, Mailpit) + prod image |
| PostgreSQL | 16 + pgvector | Image: `pgvector/pgvector:pg16` |
| Redis | 7 | `--appendonly yes` |
| flyctl | latest | Fly.io CLI — platform deploy **utama** |
| railway CLI | latest | Opsional — hanya jika pakai alternatif Railway (§7) |
| Akun Resend | — | Email production (`noreply@zgate.ziron.dev`) |
| Akses Cloudflare DNS | — | Zone `ziron.dev` |

---

## 2. Environment Variables

Semua env divalidasi via Zod di `src/lib/env.ts` — app refuse start jika ada yang
missing/invalid.

### App
| Var | Wajib | Deskripsi |
|---|---|---|
| `NODE_ENV` | ✓ | `development` / `production` |
| `PORT` | ✓ | Next.js port, default `3000` |
| `NEXT_PUBLIC_BASE_URL` | ✓ | `http://localhost:3000` dev / `https://zgate.ziron.dev` prod |

### Security
| Var | Wajib | Deskripsi |
|---|---|---|
| `JWT_SECRET` | ✓ | User JWT signing, min 32 chars random |
| `JWT_ADMIN_SECRET` | ✓ | Admin JWT — WAJIB berbeda dari `JWT_SECRET` |
| `API_KEY_SECRET` | ✓ | HMAC secret ZGate API keys (`sk-zg-`), min 32 chars |
| `MACHINE_ID_SALT` | ✓ | Salt machine/device identification (cloud sync) |
| `CREDENTIALS_ENCRYPT_KEY` | ✓ | AES-256-GCM key untuk enkripsi provider credentials (terpisah dari `JWT_SECRET`) |

### Database & Cache
| Var | Wajib | Deskripsi |
|---|---|---|
| `DATABASE_URL` | ✓ | `postgresql://zgate:zgate@localhost:5432/zgate` |
| `REDIS_URL` | ✓ | `redis://localhost:6379` |

### Email
| Var | Wajib | Deskripsi |
|---|---|---|
| `EMAIL_FROM` | ✓ | `ZGate <noreply@zgate.ziron.dev>` (Addendum 6) |
| `SMTP_HOST` | dev | Mailpit host (`localhost`) |
| `SMTP_PORT` | dev | Mailpit SMTP (`1025`) |
| `RESEND_API_KEY` | prod | Resend API key — dipakai saat `NODE_ENV=production` |

### Admin
| Var | Wajib | Deskripsi |
|---|---|---|
| `ADMIN_EMAIL` | ✓ | Email admin (seed `scripts/seed.ts`, bukan register publik) |
| `ADMIN_PASSWORD` | ✓ | Password awal admin |

### OTP
| Var | Default | Deskripsi |
|---|---|---|
| `OTP_EXPIRY_MINUTES` | `10` | Masa berlaku kode |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Cooldown resend |
| `OTP_MAX_ATTEMPTS` | `3` | Salah N kali → suspend |
| `OTP_SUSPEND_HOURS` | `1` | Durasi suspend |

### Memory (Addendum 1)
| Var | Default | Deskripsi |
|---|---|---|
| `MEMORY_ENABLED` | `true` | Toggle global memory system |
| `MEMORY_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Fallback embedding model |
| `MEMORY_TOP_K` | `5` | Top-K retrieval per scope |
| `MEMORY_EXTRACTION_MODEL` | `deepseek/deepseek-v4-flash` | Model ekstraksi memory facts |
| `MEMORY_ENCRYPT_KEY` | — | AES-256 key (32 chars) enkripsi memory |

### WebSocket (Addendum 2)
| Var | Default | Deskripsi |
|---|---|---|
| `WS_PORT` | `3001` | Bun WS sidecar port |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | dev; prod: `wss://zgate.ziron.dev/ws` |

### Optional
| Var | Deskripsi |
|---|---|
| `NEXT_PUBLIC_CLOUD_URL` | Cloud sync URL |
| `HTTP_PROXY` / `HTTPS_PROXY` | Upstream proxy |
| `RTK_BINARY_PATH` | Default `./rtk/target/release/rtk` |
| `ENABLE_REQUEST_LOGS` | `false` — debug request logging |

---

## 3. Development Setup

```bash
# 1. Clone + install
bun install

# 2. Copy env
cp .env.example .env
# edit secrets minimal: JWT_SECRET, JWT_ADMIN_SECRET, API_KEY_SECRET, MEMORY_ENCRYPT_KEY

# 3. Start infra (PG + Redis + Mailpit + ws-server)
docker compose up -d postgres redis mailpit

# 4. Migrate + seed admin
bunx prisma migrate dev
bun run scripts/seed.ts        # buat admin dari ADMIN_EMAIL + ADMIN_PASSWORD

# 5. Build RTK engine (sekali, atau saat rtk/ berubah)
cd rtk && cargo build --release && cd ..

# 6. Run
bun dev                        # Next.js :3000
bun run ws-server/index.ts     # WS sidecar :3001 (terminal terpisah)

# Mailpit UI: http://localhost:8025
```

Helper: `scripts/setup.sh` menjalankan langkah 1–5 otomatis.

---

## 4. Docker Compose

`docker-compose.yml` di root berisi 5 services:

| Service | Image | Port | Keterangan |
|---|---|---|---|
| `app` | build `.` (multi-stage) | 3000 | Next.js + RTK binary |
| `ws-server` | build `ws-server/Dockerfile` | 3001 | Bun WS sidecar |
| `postgres` | `pgvector/pgvector:pg16` | 5432 | + `scripts/init-db.sql` (pgvector ext) |
| `redis` | `redis:7-alpine` | 6379 | `--appendonly yes` |
| `mailpit` | `axllent/mailpit:latest` | 1025/8025 | Dev email only |

```bash
docker compose up -d            # full stack
docker compose up -d --build app ws-server   # rebuild app
docker compose logs -f app
```

Healthchecks: postgres `pg_isready`, redis `redis-cli ping`; `app` dan `ws-server`
depend on healthy state.

---

## 5. Production Build

`Dockerfile` multi-stage:

```
Stage 1 (rust:latest)    → cargo build --release rtk/        → /rtk binary
Stage 2 (oven/bun)       → bun install && bunx prisma generate && bun run build
Stage 3 (oven/bun slim)  → copy .next standalone + rtk binary + Prisma client/CLI
                           (Rust-free prisma-client — no query-engine binary)
                           CMD: migrate deploy && start
```

```bash
docker build -t zgate:latest .
docker run --env-file .env -p 3000:3000 zgate:latest
```

---

## 6. Fly.io Deployment

```bash
fly launch --no-deploy            # generate awal, lalu sesuaikan fly.toml
fly postgres create               # atau attach existing (pastikan pgvector enabled)
fly redis create                  # Upstash Redis

# secrets
fly secrets set \
  JWT_SECRET=... JWT_ADMIN_SECRET=... API_KEY_SECRET=... MACHINE_ID_SALT=... \
  DATABASE_URL=... REDIS_URL=... RESEND_API_KEY=... \
  ADMIN_EMAIL=admin@zgate.ziron.dev ADMIN_PASSWORD=... \
  MEMORY_ENCRYPT_KEY=... \
  EMAIL_FROM="ZGate <noreply@zgate.ziron.dev>" \
  NEXT_PUBLIC_BASE_URL=https://zgate.ziron.dev \
  NEXT_PUBLIC_WS_URL=wss://zgate.ziron.dev/ws

fly deploy
fly certs add zgate.ziron.dev     # custom domain cert
```

`fly.toml` pokok:
- `[[services]]` internal_port 3000 (app) + service kedua port 3001 (ws-server,
  atau jalankan ws-server sebagai process group `[processes]`)
- `[checks]` HTTP `/api/health`
- `release_command = "bunx prisma migrate deploy"`

Catatan pgvector di Fly Postgres: `fly postgres connect` lalu
`CREATE EXTENSION IF NOT EXISTS vector;`

---

## 7. Alternative: Railway

> **Railway tersedia sebagai alternatif tapi tidak direkomendasikan untuk ZGate**
> karena: (1) biaya ~30-40% lebih mahal untuk stack yang sama, (2) Bun WebSocket
> server port 3001 butuh service terpisah yang menambah cost, (3) billing base
> $5/bulan wajib bahkan saat usage kecil.
>
> Fly.io (§6) adalah pilihan utama — pakai Railway hanya jika ada alasan spesifik.

1. New Project → Deploy from GitHub repo.
2. Tambah plugin **PostgreSQL** (pakai image pgvector atau enable extension via
   `CREATE EXTENSION vector;`) dan **Redis**.
3. Set semua env vars (section 2) di Railway dashboard — `DATABASE_URL` dan
   `REDIS_URL` otomatis dari plugin reference variables.
4. `railway.json` mengatur build (Dockerfile) + healthcheck `/api/health` +
   restart policy.
5. Tambah service kedua untuk `ws-server/` (root directory `ws-server`,
   port 3001).
6. Custom domain: Settings → Domains → `zgate.ziron.dev` → ikuti CNAME instruksi.

---

## 8. Cloudflare DNS (`zgate.ziron.dev`)

| Record | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `zgate` | `<app>.fly.dev` (alternatif Railway: `<app>.up.railway.app`) | Proxied (orange) |

- SSL/TLS mode: **Full (strict)**.
- WebSocket: Cloudflare support WS pass-through otomatis pada proxied records —
  pastikan `Network → WebSockets: On`.
- Route `wss://zgate.ziron.dev/ws` → origin port 3001: gunakan origin rule /
  reverse proxy (Nginx di origin) yang map path `/ws` ke ws-server:3001.
- Recommended: Cache Rules bypass untuk `/v1/*` dan `/api/*` (SSE/streaming).
- HSTS + security headers via Transform Rules (lihat security checklist).

---

## 9. Database Migrations

```bash
# Development (membuat migration baru)
bunx prisma migrate dev --name <nama>

# Production (apply only — jalan otomatis via release_command)
bunx prisma migrate deploy

# Prisma client regenerate
bunx prisma generate
```

Wajib sebelum migration pertama di environment baru:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
(di dev otomatis via `scripts/init-db.sql` mount; di managed PG jalankan manual.)

---

## 10. Backup Strategy

### PostgreSQL
```bash
# Dump harian (cron)
pg_dump "$DATABASE_URL" -Fc -f /backups/zgate-$(date +%F).dump

# Restore
pg_restore -d "$DATABASE_URL" --clean /backups/zgate-2026-06-13.dump
```
- Retensi: 7 daily + 4 weekly.
- Fly.io: `fly postgres backup` snapshots otomatis; Railway: backup plugin/manual cron.
- Test restore minimal sebulan sekali.

### Redis Persistence
- `appendonly yes` (AOF) — sudah diset di docker-compose command.
- Data Redis bersifat re-derivable (sessions, OTP, rate limit, cache, pub/sub) —
  kehilangan Redis = users re-login, bukan data loss permanen.
- Prod managed Redis (Upstash/Railway): persistence default on.

---

## 11. Post-Deploy Checklist

- [ ] `GET /api/health` → 200 (db + redis true)
- [ ] Register flow end-to-end (OTP email masuk via Resend)
- [ ] Admin login `/zyy/admin/` dengan seeded account
- [ ] `POST /v1/chat/completions` dengan API key test
- [ ] WS connect `wss://zgate.ziron.dev/ws?token=...`
- [ ] Maintenance toggle → `/v1/*` return 503
- [ ] pgvector query jalan (memory search)
