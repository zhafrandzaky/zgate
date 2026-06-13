import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Used by Docker/Fly.io healthchecks. Deep dependency checks
 * (PostgreSQL, Redis) are added in TASK-024.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", service: "zgate", timestamp: new Date().toISOString() });
}
