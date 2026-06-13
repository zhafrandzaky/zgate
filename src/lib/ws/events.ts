/**
 * WebSocket event contract (docs/ARCHITECTURE.md §10).
 *
 * This is the single source of truth for the shape of events published to
 * clients. The Bun WS sidecar (TASK-023) consumes the same union when it relays
 * Redis messages, and every publisher imports `WSEvent` so payloads stay
 * type-safe.
 *
 * NOTE: TASK-023 owns the WS server itself. This file (and `publish.ts`) provide
 * the publisher-side contract that earlier tasks need; TASK-023 extends rather
 * than redefines it.
 */

/** Memory layer (mirrors Prisma `MemoryScope`, kept decoupled from the client). */
export type MemoryScope = "GLOBAL" | "PROJECT" | "SESSION";

export type WSEvent =
  | { type: "memory:saved"; count: number; scope: MemoryScope }
  | { type: "session:ended"; sessionId: string; memoriesExtracted: number }
  | { type: "provider:status"; providerId: string; status: string; error?: string }
  | { type: "provider:health"; providerId: string; status: string; responseMs: number }
  | { type: "maintenance:on"; message?: string }
  | { type: "maintenance:off" }
  | { type: "usage:update"; tokens: number; costUsd: number; provider: string }
  | { type: "admin:broadcast"; message: string }
  | { type: "budget:warning"; percent: number }
  // Provider model catalog refreshed (TASK-006 auto-fetch).
  | { type: "models:updated"; connectionId: string; count: number }
  // Internal dashboard event — usage stats only, never forwarded to AI clients.
  | {
      type: "stream:fallback";
      requestId: string;
      fromProvider: string;
      toProvider: string;
      atChunk: number;
    };

/** Redis Pub/Sub channel for a single user's events. */
export function userChannel(userId: string): string {
  return `ws:user:${userId}`;
}

/** Broadcast channel for all connected admins. */
export const ADMIN_CHANNEL = "ws:admin";

/** Broadcast channel for global events (maintenance mode, etc.). */
export const GLOBAL_CHANNEL = "ws:global";
