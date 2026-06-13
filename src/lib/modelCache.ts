/**
 * Model cache management (TASK-006 "Auto-fetch Model System", deliverable 3).
 *
 * Stale-while-revalidate over the `ProviderConnection.cachedModels` /
 * `cachedModelsAt` columns:
 *   - fresh (< 5 min): serve the cache.
 *   - stale (>= 5 min): serve the cache now, refresh in the background.
 *   - cold (null): fetch synchronously, persist, then serve.
 *
 * Fetching delegates to the live resolvers (open-sse/services) which never
 * throw, so this layer always returns an array — empty only when every source
 * (live + static) is empty.
 */

import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { publishToUser } from "@/src/lib/ws/publish";
import { resolveModels } from "@/open-sse/services/liveModelResolvers";
import { getStaticModels, mergeModels } from "@/open-sse/services/modelFetcher";

const CACHE_TTL_MS = 5 * 60_000;

/** Shared refresh queue consumed by `modelRefreshWorker`. */
export const MODEL_REFRESH_QUEUE = "model-refresh:queue";
/** Per-connection rate-limit lock key (1 refresh / 5 min). */
export function modelRefreshRateKey(connectionId: string): string {
  return `model-refresh:rate:${connectionId}`;
}

/**
 * Connection fields needed to resolve and cache models. The Prisma
 * `ProviderConnection` is structurally compatible; `apiKey`/`accessToken` are
 * expected to be decrypted by the services layer before reaching here.
 */
export interface CachedConnection {
  id: string;
  userId: string;
  provider: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  accessToken?: string | null;
  cachedModels?: unknown;
  cachedModelsAt?: Date | null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string") ? (value as string[]) : null;
}

function isFresh(cachedModelsAt?: Date | null): boolean {
  if (!cachedModelsAt) return false;
  return Date.now() - cachedModelsAt.getTime() < CACHE_TTL_MS;
}

/**
 * Models for a connection, applying stale-while-revalidate. Never throws.
 */
export async function getModelsForConnection(connection: CachedConnection): Promise<string[]> {
  const cached = asStringArray(connection.cachedModels);

  if (cached) {
    if (isFresh(connection.cachedModelsAt)) return cached;
    // Stale: serve cached now, refresh out of band.
    void refreshModelsBackground(connection.id);
    return cached;
  }

  // Cold cache: fetch synchronously and persist.
  return refreshModelsNow(connection);
}

/**
 * Enqueue a background refresh, rate-limited to one per connection per 5 min.
 * Best-effort: a Redis failure logs and resolves.
 */
export async function refreshModelsBackground(connectionId: string): Promise<void> {
  try {
    const acquired = await redis.set(modelRefreshRateKey(connectionId), "1", "EX", 300, "NX");
    if (acquired !== "OK") return; // refreshed recently — skip
    await redis.rpush(MODEL_REFRESH_QUEUE, connectionId);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[modelCache] background enqueue failed for ${connectionId}: ${reason}`);
  }
}

/**
 * Force the next request to refetch by clearing the freshness timestamp and the
 * rate-limit lock. Called when a connection is updated or a model test runs.
 */
export async function invalidateCache(connectionId: string): Promise<void> {
  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { cachedModelsAt: null },
  });
  try {
    await redis.del(modelRefreshRateKey(connectionId));
  } catch {
    // lock will expire on its own; non-fatal
  }
}

/**
 * Fetch the live model list now (ignoring cache), persist it, notify the user
 * over WebSocket, and return it. Never throws on fetch failure — falls back to
 * the static list via the resolver chain.
 */
export async function refreshModelsNow(connection: CachedConnection): Promise<string[]> {
  const resolved = await resolveModels({
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey ?? null,
    accessToken: connection.accessToken ?? null,
  });

  const staticModels = getStaticModels(connection.provider);
  const custom = await loadCustomModels(connection.userId, connection.id);
  const finalModels = mergeModels(resolved, staticModels, custom);

  await prisma.providerConnection.update({
    where: { id: connection.id },
    data: { cachedModels: finalModels, cachedModelsAt: new Date() },
  });

  void publishToUser(connection.userId, {
    type: "models:updated",
    connectionId: connection.id,
    count: finalModels.length,
  });

  return finalModels;
}

/** User's manually-added models for a connection (multi-user scoped). */
async function loadCustomModels(userId: string, providerConnectionId: string): Promise<string[]> {
  const rows = await prisma.customModel.findMany({
    where: { userId, providerConnectionId },
    select: { modelId: true },
  });
  return rows.map((row) => row.modelId);
}
