/**
 * WebSocket event publisher (docs/ARCHITECTURE.md §10).
 *
 * Publishers (model refresh, memory extraction, health monitor, ...) call these
 * helpers to push a typed {@link WSEvent} onto a Redis Pub/Sub channel. The Bun
 * WS sidecar (TASK-023) is the single subscriber per instance and fans events
 * out to the connected clients.
 *
 * Publishing is best-effort: a Redis failure logs and resolves rather than
 * throwing, so a downed WS path never breaks the request that triggered it.
 */

import { redis } from "@/src/lib/redis";
import {
  ADMIN_CHANNEL,
  GLOBAL_CHANNEL,
  userChannel,
  type WSEvent,
} from "@/src/lib/ws/events";

async function publish(channel: string, event: WSEvent): Promise<void> {
  try {
    await redis.publish(channel, JSON.stringify(event));
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[ws:publish] failed on ${channel}: ${reason}`);
  }
}

/** Push an event to a single user's clients. */
export function publishToUser(userId: string, event: WSEvent): Promise<void> {
  return publish(userChannel(userId), event);
}

/** Push an event to all connected admins. */
export function publishToAdmins(event: WSEvent): Promise<void> {
  return publish(ADMIN_CHANNEL, event);
}

/** Push a global broadcast (maintenance mode, etc.). */
export function publishGlobal(event: WSEvent): Promise<void> {
  return publish(GLOBAL_CHANNEL, event);
}
