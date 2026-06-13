#!/bin/sh
set -e

echo "[zgate] Applying database migrations..."
bunx prisma migrate deploy

echo "[zgate] Starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
exec bun server.js
