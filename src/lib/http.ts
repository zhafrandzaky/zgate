import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Standard JSON envelope for management APIs (docs/api/API.md §"Format response
 * standar"). Compatibility (`/v1/*`) routes use provider-shaped errors instead and
 * must not use these helpers.
 */

export const ApiErrorCode = {
  invalid_request: "invalid_request",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  not_found: "not_found",
  conflict: "conflict",
  unprocessable: "unprocessable",
  rate_limited: "rate_limited",
  internal_error: "internal_error",
  maintenance: "maintenance",
} as const;

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

interface ErrorBody {
  code: ApiErrorCodeValue;
  message: string;
  [key: string]: unknown;
}

/** Successful envelope: `{ success: true, data, error: null }`. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data, error: null }, init);
}

/** Error envelope: `{ success: false, data: null, error: { code, message, ... } }`. */
export function fail(
  status: number,
  code: ApiErrorCodeValue,
  message: string,
  extra?: Record<string, unknown>,
  headers?: HeadersInit,
): NextResponse {
  const error: ErrorBody = { code, message, ...extra };
  return NextResponse.json({ success: false, data: null, error }, { status, headers });
}

/**
 * Best-effort client IP for per-IP rate limiting. Trusts the first hop of
 * `x-forwarded-for` (set by the reverse proxy / platform edge); falls back to
 * `x-real-ip`. Returns `"unknown"` when neither is present so a missing header
 * never bypasses the limiter silently.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
