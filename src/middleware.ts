import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Root middleware. Auth guards (user JWT, admin JWT, API-key resolve, rate limit,
 * maintenance check) are implemented in later tasks (TASK-002, TASK-009, TASK-010).
 * For project init this is a pass-through with the matcher wired to the routes
 * that will be guarded.
 */
export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/zyy/admin/:path*", "/v1/:path*", "/v1beta/:path*"],
};
