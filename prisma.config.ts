import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 configuration (replaces the deprecated `package.json#prisma` block).
 *
 * Prisma 7 removed `url` from the schema `datasource` block and no longer loads
 * `.env` automatically, so the Migrate/CLI connection string lives here. The
 * runtime client connects via a driver adapter (see src/lib/db.ts).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun run scripts/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
