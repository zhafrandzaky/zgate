import { z } from "zod";

/**
 * Zod-validated environment. The app refuses to start when a required variable
 * is missing or invalid (docs/ARCHITECTURE.md §18).
 *
 * Set `SKIP_ENV_VALIDATION=1` to bypass validation during build / lint steps
 * where real secrets are not present.
 */
const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  NEXT_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Security
  JWT_SECRET: z.string().min(32),
  JWT_ADMIN_SECRET: z.string().min(32),
  API_KEY_SECRET: z.string().min(32),
  MACHINE_ID_SALT: z.string().min(1),
  CREDENTIALS_ENCRYPT_KEY: z.string().min(32),

  // Database & cache
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Email
  EMAIL_FROM: z.string().min(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  RESEND_API_KEY: z.string().optional(),

  // Admin seed
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),

  // OTP
  OTP_EXPIRY_MINUTES: z.coerce.number().default(10),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(3),
  OTP_SUSPEND_HOURS: z.coerce.number().default(1),

  // Optional cloud sync
  NEXT_PUBLIC_CLOUD_URL: z.string().optional(),

  // Optional upstream proxy
  HTTP_PROXY: z.string().optional(),
  HTTPS_PROXY: z.string().optional(),

  // RTK engine
  RTK_BINARY_PATH: z.string().default("./rtk/target/release/rtk"),

  // Debug
  ENABLE_REQUEST_LOGS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Memory
  MEMORY_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  MEMORY_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  MEMORY_TOP_K: z.coerce.number().default(5),
  MEMORY_EXTRACTION_MODEL: z.string().default("deepseek/deepseek-v4-flash"),
  MEMORY_ENCRYPT_KEY: z.string().min(32),

  // WebSocket
  WS_PORT: z.coerce.number().default(3001),
  NEXT_PUBLIC_WS_URL: z.string().default("ws://localhost:3001"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION) {
    return process.env as unknown as Env;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
