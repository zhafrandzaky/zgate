/**
 * Background model-refresh worker (TASK-006 "Auto-fetch Model System",
 * deliverable 4).
 *
 * Consumes connection ids from the `MODEL_REFRESH_QUEUE` Redis list (pushed by
 * `refreshModelsBackground` during stale-while-revalidate) and runs
 * `refreshModelsNow` for each. Uses a dedicated blocking Redis connection so the
 * shared client stays free for normal commands. Started once at app startup via
 * `initApp`.
 */

import type Redis from "ioredis";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";
import { MODEL_REFRESH_QUEUE, refreshModelsNow } from "@/src/lib/modelCache";

const BRPOP_TIMEOUT_SECONDS = 5;

let running = false;
let blockingClient: Redis | null = null;

/** Whether the worker loop is currently active. */
export function isWorkerRunning(): boolean {
  return running;
}

/**
 * Start the worker loop. Idempotent — a second call while running is a no-op.
 * Resolves immediately; the loop runs detached until `stopModelRefreshWorker`.
 */
export function startModelRefreshWorker(): void {
  if (running) return;
  running = true;
  // A blocking BRPOP must not occupy the shared client.
  blockingClient = redis.duplicate();
  void runLoop(blockingClient);
}

/** Signal the loop to stop after its current iteration and release the client. */
export async function stopModelRefreshWorker(): Promise<void> {
  running = false;
  if (blockingClient) {
    const client = blockingClient;
    blockingClient = null;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

async function runLoop(client: Redis): Promise<void> {
  while (running) {
    let connectionId: string | undefined;
    try {
      const popped = await client.brpop(MODEL_REFRESH_QUEUE, BRPOP_TIMEOUT_SECONDS);
      connectionId = popped?.[1];
    } catch (error: unknown) {
      if (!running) break;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[modelRefreshWorker] brpop failed: ${reason}`);
      await delay(1000);
      continue;
    }

    if (!connectionId) continue; // timeout, loop again
    await processJob(connectionId);
  }
}

async function processJob(connectionId: string): Promise<void> {
  try {
    const connection = await prisma.providerConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        userId: true,
        provider: true,
        baseUrl: true,
        apiKey: true,
        accessToken: true,
        isActive: true,
      },
    });
    if (!connection || !connection.isActive) return;
    await refreshModelsNow(connection);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[modelRefreshWorker] refresh failed for ${connectionId}: ${reason}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
