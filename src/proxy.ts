import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyUserToken,
  verifyAdminToken,
  SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
  type UserRole,
} from "@/src/lib/auth";

/**
 * Root proxy (formerly `middleware`, renamed in Next.js 16) — the first
 * security boundary (docs/ARCHITECTURE.md §19).
 *
 * Runs on the Edge, so it only does work that is safe there: stateless JWT
 * verification (via `jose`) for the dashboard and admin areas. It cannot touch
 * Postgres/Redis, so `/v1/*` API-key resolution, HMAC verification, and rate
 * limiting happen inside the Node route handlers (TASK-008); here we only reject
 * requests that carry no bearer credential at all.
 *
 * The user/admin identity proven here is forwarded to downstream handlers via
 * `x-zgate-user-id` / `x-zgate-user-role` request headers.
 */

/** Admin paths reachable without an admin session (login page + login API). */
function isAdminPublicPath(pathname: string): boolean {
  return pathname.startsWith("/zyy/admin/login") || pathname.startsWith("/zyy/admin/api/auth");
}

function forwardIdentity(request: NextRequest, userId: string, role: UserRole): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-zgate-user-id", userId);
  headers.set("x-zgate-user-role", role);
  return NextResponse.next({ request: { headers } });
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

function unauthorizedApi(): NextResponse {
  return NextResponse.json(
    {
      error: {
        message: "Missing or invalid API key",
        type: "authentication_error",
        code: "unauthorized",
      },
    },
    { status: 401 },
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Admin area — admin JWT (separate secret) + ADMIN role.
  if (pathname.startsWith("/zyy/admin")) {
    if (isAdminPublicPath(pathname)) return NextResponse.next();
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const payload = token ? await verifyAdminToken(token) : null;
    if (!payload) return redirectTo(request, "/zyy/admin/login");
    return forwardIdentity(request, payload.sub, "ADMIN");
  }

  // User dashboard — user JWT.
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const payload = token ? await verifyUserToken(token) : null;
    if (!payload) return redirectTo(request, "/login");
    return forwardIdentity(request, payload.sub, payload.role);
  }

  // Compatibility API (`/v1/*`, `/v1beta/*`) — full verification in the route
  // handler; reject only the obviously-unauthenticated requests at the edge.
  if (pathname.startsWith("/v1")) {
    const authorization = request.headers.get("authorization");
    if (!authorization || !/^Bearer\s+sk-zg-/i.test(authorization.trim())) {
      return unauthorizedApi();
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/zyy/admin/:path*", "/v1/:path*", "/v1beta/:path*"],
};
