import type { NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from "@/src/lib/auth";
import { fetchOidcDiscovery } from "@/src/lib/auth/oidc";
import { ok, fail, ApiErrorCode } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testSchema = z.object({
  issuer: z.string().url(),
});

/**
 * POST /api/auth/oidc/test — admin-only reachability/shape check of an OIDC
 * provider's discovery document before saving config (Addendum 8 GAP 10).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const admin = token ? await verifyAdminToken(token) : null;
  if (!admin) {
    return fail(403, ApiErrorCode.forbidden, "Admin session required.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, ApiErrorCode.invalid_request, "Request body must be valid JSON.");
  }

  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, ApiErrorCode.invalid_request, "A valid issuer URL is required.");
  }

  try {
    const discovery = await fetchOidcDiscovery(parsed.data.issuer);
    return ok({
      valid: true,
      endpoints: {
        authorization: discovery.authorization_endpoint,
        token: discovery.token_endpoint,
        jwks: discovery.jwks_uri,
        userinfo: discovery.userinfo_endpoint ?? null,
      },
    });
  } catch (error) {
    return ok({ valid: false, error: (error as Error).message });
  }
}
