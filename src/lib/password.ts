import argon2 from "argon2";

/**
 * Password hashing with argon2id (AGENTS.md §6). The OWASP-recommended
 * parameters below favour memory-hardness; argon2 embeds the salt and these
 * parameters into the encoded hash, so `verify` needs no extra state.
 *
 * Node-only module — never import from Edge middleware.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/** Verify a plaintext password against an encoded argon2 hash. Never throws. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
