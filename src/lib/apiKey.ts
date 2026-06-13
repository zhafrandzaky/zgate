import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/db";

/**
 * ZGate API keys (`sk-zg-` prefix) for the compatibility API (`/v1/*`).
 *
 * Only an HMAC-SHA256 hash (keyed by `API_KEY_SECRET`) is stored — the plaintext
 * key is revealed exactly once at creation (docs/ARCHITECTURE.md §19.3). Lookups
 * hash the presented key and match the stored hash, so the DB never holds a
 * recoverable secret.
 *
 * Node-only module — never import from Edge middleware.
 */

export const API_KEY_PREFIX = "sk-zg-";
const SECRET_BYTES = 32;
/** `sk-zg-` + base64url(32 bytes) ⇒ 43 chars of entropy. */
const SECRET_BODY_LENGTH = 43;

export interface GeneratedApiKey {
  /** Full plaintext key — shown to the user once, never persisted. */
  key: string;
  /** Display prefix stored alongside the hash (`sk-zg-` + first 8 chars). */
  keyPrefix: string;
  /** HMAC-SHA256 hash persisted in `ApiKey.keyHash`. */
  keyHash: string;
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/** Generate a new API key, returning the one-time plaintext plus its stored prefix + hash. */
export function generateApiKey(): GeneratedApiKey {
  const body = base64url(randomBytes(SECRET_BYTES));
  const key = `${API_KEY_PREFIX}${body}`;
  return {
    key,
    keyPrefix: `${API_KEY_PREFIX}${body.slice(0, 8)}`,
    keyHash: hashApiKey(key),
  };
}

/** HMAC-SHA256(key, API_KEY_SECRET) as lowercase hex. Deterministic for a given key + secret. */
export function hashApiKey(key: string): string {
  return createHmac("sha256", env.API_KEY_SECRET).update(key).digest("hex");
}

/** Shape check before doing any crypto/DB work. */
export function isValidApiKeyFormat(key: string): boolean {
  if (!key.startsWith(API_KEY_PREFIX)) return false;
  const body = key.slice(API_KEY_PREFIX.length);
  return body.length === SECRET_BODY_LENGTH && /^[A-Za-z0-9_-]+$/.test(body);
}

/** Constant-time comparison of two hex digests of equal length. */
export function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Extract a bearer key from an `Authorization` header value. */
export function extractBearerKey(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() ?? null;
}

export type ApiKeyResolution =
  | { ok: true; userId: string; apiKeyId: string }
  | { ok: false; reason: "invalid" | "inactive" | "banned" };

/**
 * Resolve a presented API key to its owning user. The userId is sourced ONLY
 * from this lookup — never from the request body (AGENTS.md §5/§6).
 * Updates `lastUsedAt` best-effort. Node/DB only.
 */
export async function resolveApiKey(key: string): Promise<ApiKeyResolution> {
  if (!isValidApiKeyFormat(key)) return { ok: false, reason: "invalid" };

  const keyHash = hashApiKey(key);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      isActive: true,
      user: { select: { id: true, isBanned: true } },
    },
  });

  if (!record) return { ok: false, reason: "invalid" };
  if (!record.isActive) return { ok: false, reason: "inactive" };
  if (record.user.isBanned) return { ok: false, reason: "banned" };

  void prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { ok: true, userId: record.user.id, apiKeyId: record.id };
}
