import { z } from "zod";
import { redis } from "@/src/lib/redis";

/**
 * Admin-managed OIDC provider configuration (enterprise SSO).
 *
 * Stored in Redis under a single key and DISABLED by default. The admin settings
 * UI (TASK-017) writes here; the OIDC routes refuse to start a flow unless
 * `enabled` is true. Node-only.
 *
 * NOTE: `clientSecret` is stored as-is for now. At-rest encryption
 * (AES-256-GCM via `CREDENTIALS_ENCRYPT_KEY`) is centralised in TASK-011, the
 * same task that encrypts provider credentials; this store adopts it then.
 */

const OIDC_CONFIG_KEY = "settings:oidc";

export const oidcConfigSchema = z.object({
  enabled: z.boolean().default(false),
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  scope: z.string().default("openid email profile"),
});

export type OidcConfig = z.infer<typeof oidcConfigSchema>;

/** Read the stored OIDC config, or `null` when unset/invalid. */
export async function getOidcConfig(): Promise<OidcConfig | null> {
  try {
    const raw = await redis.get(OIDC_CONFIG_KEY);
    if (!raw) return null;
    const parsed = oidcConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function setOidcConfig(config: OidcConfig): Promise<void> {
  await redis.set(OIDC_CONFIG_KEY, JSON.stringify(config));
}

/** Convenience guard used by the OIDC routes. */
export async function isOidcEnabled(): Promise<boolean> {
  const config = await getOidcConfig();
  return Boolean(config?.enabled);
}
