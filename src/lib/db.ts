import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/src/generated/prisma/client";
import { env } from "@/src/lib/env";

/**
 * Prisma client singleton. The `globalThis` cache prevents new connection
 * pools being opened on every hot reload in development.
 *
 * Prisma 7's Rust-free client connects through a driver adapter rather than a
 * `url` in the schema datasource, so we pass `@prisma/adapter-pg` explicitly.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
