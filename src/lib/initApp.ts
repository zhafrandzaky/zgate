/**
 * Application startup hooks.
 *
 * Centralizes the side-effecting background tasks ZGate needs running once per
 * process. Today that is the model-refresh worker (TASK-006); later tasks
 * (health monitor TASK-024, webhook delivery TASK-025) register here too.
 *
 * `initApp` is idempotent and guarded by a global flag so Next.js dev hot-reload
 * doesn't spawn duplicate workers.
 */

import { startModelRefreshWorker } from "@/src/lib/modelRefreshWorker";

const globalForInit = globalThis as unknown as { zgateInitialized?: boolean };

/** Start background workers once per process. Safe to call repeatedly. */
export function initApp(): void {
  if (globalForInit.zgateInitialized) return;
  globalForInit.zgateInitialized = true;

  startModelRefreshWorker();
}
