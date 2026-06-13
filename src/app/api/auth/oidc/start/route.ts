import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { getOidcConfig } from "@/src/lib/auth/oidcConfig";
import {
  fetchOidcDiscovery,
  createPkcePair,
  createOidcState,
  createOidcNonce,
  buildOidcAuthorizationUrl,
  oidcFlowKey,
  OIDC_FLOW_TTL_SECONDS,
} from "@/src/lib/auth/oidc";
import { fail, ApiErrorCode } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/oidc/start — initiate the OIDC Authorization Code + PKCE flow.
 * Gated behind the admin OIDC setting; returns 404 while SSO is disabled
 * (Addendum 8 GAP 10, DEFER roadmap v2).
 */
export async function GET(_request: NextRequest) {
  const config = await getOidcConfig();
  if (!config?.enabled) {
    return fail(404, ApiErrorCode.not_found, "OIDC single sign-on is not enabled.");
  }

  let discovery;
  try {
    discovery = await fetchOidcDiscovery(config.issuer);
  } catch (error) {
    console.error("[auth/oidc/start] discovery error:", (error as Error).message);
    return fail(502, ApiErrorCode.internal_error, "Identity provider is unreachable.");
  }

  const pkce = createPkcePair();
  const state = createOidcState();
  const nonce = createOidcNonce();

  await redis.set(
    oidcFlowKey(state),
    JSON.stringify({ nonce, codeVerifier: pkce.codeVerifier }),
    "EX",
    OIDC_FLOW_TTL_SECONDS,
  );

  const url = buildOidcAuthorizationUrl({
    authorizationEndpoint: discovery.authorization_endpoint,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: config.scope,
    state,
    nonce,
    codeChallenge: pkce.codeChallenge,
  });

  return NextResponse.redirect(url);
}
