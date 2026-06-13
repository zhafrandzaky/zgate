import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { getOidcConfig } from "@/src/lib/auth/oidcConfig";
import { fetchOidcDiscovery, exchangeOidcCode, oidcFlowKey } from "@/src/lib/auth/oidc";
import {
  signUserToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  USER_TOKEN_TTL_SECONDS,
} from "@/src/lib/auth";
import { fail, ApiErrorCode } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const flowSchema = z.object({ nonce: z.string(), codeVerifier: z.string() });
const idTokenClaimsSchema = z.object({
  email: z.string().email(),
  nonce: z.string().optional(),
});

/**
 * GET /api/auth/oidc/callback — exchange the authorization code, verify the
 * id_token (signature via JWKS, issuer, audience, nonce), provision/locate the
 * user, and start a session (Addendum 8 GAP 10, DEFER roadmap v2).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return fail(400, ApiErrorCode.invalid_request, "Missing authorization code or state.");
  }

  const config = await getOidcConfig();
  if (!config?.enabled) {
    return fail(404, ApiErrorCode.not_found, "OIDC single sign-on is not enabled.");
  }

  const rawFlow = await redis.getdel(oidcFlowKey(state));
  if (!rawFlow) {
    return fail(400, ApiErrorCode.invalid_request, "Invalid or expired authentication state.");
  }
  const flow = flowSchema.safeParse(JSON.parse(rawFlow));
  if (!flow.success) {
    return fail(400, ApiErrorCode.invalid_request, "Invalid authentication state.");
  }

  try {
    const discovery = await fetchOidcDiscovery(config.issuer);
    const tokens = await exchangeOidcCode({
      tokenEndpoint: discovery.token_endpoint,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri: config.redirectUri,
      codeVerifier: flow.data.codeVerifier,
    });

    const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: discovery.issuer,
      audience: config.clientId,
    });

    const claims = idTokenClaimsSchema.safeParse(payload);
    if (!claims.success) {
      return fail(400, ApiErrorCode.invalid_request, "Identity provider did not return an email.");
    }
    if (claims.data.nonce !== flow.data.nonce) {
      return fail(400, ApiErrorCode.invalid_request, "Authentication nonce mismatch.");
    }

    const email = claims.data.email.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      update: { isVerified: true },
      // SSO users have no local password; store an unusable sentinel that can
      // never satisfy argon2 verification.
      create: { email, passwordHash: `oidc:${randomBytes(24).toString("hex")}`, isVerified: true },
      select: { id: true, email: true, role: true, isBanned: true },
    });

    if (user.isBanned) {
      return fail(403, ApiErrorCode.forbidden, "This account has been suspended.", {
        code: "banned",
      });
    }

    const token = await signUserToken({ sub: user.id, email: user.email, role: user.role });
    const redirectUrl = new URL("/dashboard", env.NEXT_PUBLIC_BASE_URL);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(USER_TOKEN_TTL_SECONDS));
    return response;
  } catch (error) {
    console.error("[auth/oidc/callback] error:", (error as Error).message);
    return fail(502, ApiErrorCode.internal_error, "Single sign-on failed.");
  }
}
