/**
 * Test environment bootstrap (loaded via bunfig.toml `[test] preload`).
 *
 * src/lib/env.ts validates required secrets at import time, so unit tests that
 * touch env-backed modules (auth, apiKey, otp, …) need them present before the
 * first import. Values are assigned unconditionally so the suite is deterministic
 * and independent of any local `.env` (which Bun auto-loads and may contain
 * placeholder secrets that fail validation).
 */
const SECRET = "test-secret-0123456789-abcdefghij-XYZ"; // 37 chars, satisfies min(32)

// NODE_ENV is read-only in the type system and Bun already sets it to "test".
process.env.JWT_SECRET = `user-${SECRET}`;
process.env.JWT_ADMIN_SECRET = `admin-${SECRET}`;
process.env.API_KEY_SECRET = `apikey-${SECRET}`;
process.env.MACHINE_ID_SALT = "test-machine-salt";
process.env.CREDENTIALS_ENCRYPT_KEY = `creds-${SECRET}`;
process.env.MEMORY_ENCRYPT_KEY = `memory-${SECRET}`;
process.env.DATABASE_URL = "postgresql://zgate:zgate@localhost:5432/zgate_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.EMAIL_FROM = "ZGate <noreply@zgate.test>";
process.env.ADMIN_EMAIL = "admin@zgate.test";
process.env.ADMIN_PASSWORD = "test-admin-password";
