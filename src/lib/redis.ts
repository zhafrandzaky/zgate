import Redis from "ioredis";
import { env } from "@/src/lib/env";

/**
 * ioredis client singleton. Uses lazy connection so importing this module during
 * build/lint never opens a socket. Connection errors are logged but do not crash
 * the process — callers decide how to degrade (docs/ARCHITECTURE.md §17).
 */
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedis(): Redis {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on("error", (error: Error) => {
    console.error("[redis] connection error:", error.message);
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedis();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
