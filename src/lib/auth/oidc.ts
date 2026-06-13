import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * OIDC foundation (Addendum 8 GAP 10 — DEFER to roadmap v2 per Addendum 9).
 *
 * Library primitives for an Authorization Code + PKCE flow against a generic
 * OIDC provider (Keycloak, Google, GitHub Enterprise, …). The flow is gated
 * behind an admin setting and disabled by default (see `oidcConfig.ts`); these
 * helpers are wired up but inert until an enterprise SSO request enables them.
 *
 * Node-only (uses `node:crypto`).
 */

const discoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  userinfo_endpoint: z.string().url().optional(),
  end_session_endpoint: z.string().url().optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
});

export type OidcDiscovery = z.infer<typeof discoverySchema>;

/** Flow state persisted in Redis between /start and /callback (PKCE verifier + nonce). */
export const OIDC_FLOW_TTL_SECONDS = 600;
export const oidcFlowKey = (state: string) => `oidc:flow:${state}`;

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/** Fetch and validate the provider's discovery document. Throws on network/shape errors. */
export async function fetchOidcDiscovery(issuer: string): Promise<OidcDiscovery> {
  const base = issuer.replace(/\/+$/, "");
  const url = `${base}/.well-known/openid-configuration`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: ${response.status} ${response.statusText}`);
  }
  const json: unknown = await response.json();
  return discoverySchema.parse(json);
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

/** Create a PKCE verifier/challenge pair (RFC 7636, S256). */
export function createPkcePair(): PkcePair {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

/** Opaque anti-CSRF state value. */
export function createOidcState(): string {
  return base64url(randomBytes(24));
}

/** Replay-protection nonce, echoed back inside the id_token. */
export function createOidcNonce(): string {
  return base64url(randomBytes(24));
}

export interface AuthorizationUrlParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

/** Build the IdP authorization URL for the Authorization Code + PKCE flow. */
export function buildOidcAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scope ?? "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  id_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

export type OidcTokenResponse = z.infer<typeof tokenResponseSchema>;

export interface ExchangeCodeParams {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

/** Exchange an authorization code for tokens at the token endpoint. */
export async function exchangeOidcCode(params: ExchangeCodeParams): Promise<OidcTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
  });
  const response = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  if (!response.ok) {
    throw new Error(`OIDC token exchange failed: ${response.status} ${response.statusText}`);
  }
  const json: unknown = await response.json();
  return tokenResponseSchema.parse(json);
}
