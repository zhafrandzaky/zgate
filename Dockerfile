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

# Prisma schema + CLI + generated client (for migrate deploy at startup)
COPY --from=app-build --chown=zgate:zgate /app/prisma ./prisma
COPY --from=app-build --chown=zgate:zgate /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=app-build --chown=zgate:zgate /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=app-build --chown=zgate:zgate /app/node_modules/prisma ./node_modules/prisma

# RTK binary
COPY --from=rtk-build --chown=zgate:zgate /build/rtk/target/release/rtk ./rtk/target/release/rtk

COPY --chown=zgate:zgate scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER zgate
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
