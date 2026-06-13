# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — RTK engine (Rust)
# ─────────────────────────────────────────────────────────────────────────────
FROM rust:1-slim AS rtk-build
WORKDIR /build
COPY rtk/ ./rtk/
RUN cargo build --release --manifest-path rtk/Cargo.toml

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Next.js build (Bun)
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS app-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1
# Prisma 7 no longer auto-loads .env and prisma.config.ts resolves DATABASE_URL via
# env() (SKIP_ENV_VALIDATION only bypasses src/lib/env.ts, not the Prisma config), so
# `prisma generate` needs a value present. This placeholder is build-only — the real
# DATABASE_URL is injected at runtime in the final stage.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate
RUN bun run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Runtime (Bun slim)
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 zgate \
  && useradd --system --uid 1001 --gid zgate zgate

# Next.js standalone output (server.js + traced node_modules)
COPY --from=app-build --chown=zgate:zgate /app/.next/standalone ./
COPY --from=app-build --chown=zgate:zgate /app/.next/static ./.next/static
COPY --from=app-build --chown=zgate:zgate /app/public ./public

# Prisma schema + config + CLI (for `prisma migrate deploy` at startup).
# Prisma 7's prisma-client generator emits to src/generated/prisma (compiled into
# the Next standalone bundle), so there is no node_modules/.prisma to copy. The
# migrate step loads prisma.config.ts, which imports dotenv and reads DATABASE_URL
# from the runtime environment.
COPY --from=app-build --chown=zgate:zgate /app/prisma ./prisma
COPY --from=app-build --chown=zgate:zgate /app/prisma.config.ts ./prisma.config.ts
COPY --from=app-build --chown=zgate:zgate /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=app-build --chown=zgate:zgate /app/node_modules/prisma ./node_modules/prisma
COPY --from=app-build --chown=zgate:zgate /app/node_modules/dotenv ./node_modules/dotenv

# RTK binary
COPY --from=rtk-build --chown=zgate:zgate /build/rtk/target/release/rtk ./rtk/target/release/rtk

COPY --chown=zgate:zgate scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER zgate
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
