/**
 * Seed the admin user from ADMIN_EMAIL + ADMIN_PASSWORD env vars.
 * Admin accounts are NEVER created via public register — only via this seed
 * (docs/ARCHITECTURE.md §7). Run: `bun run db:seed`.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/src/generated/prisma/client";
import argon2 from "argon2";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set to seed the database.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin user.");
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", isVerified: true, isBanned: false, passwordHash },
    create: { email, passwordHash, role: "ADMIN", isVerified: true },
  });

  console.log(`Seeded admin user: ${admin.email} (id=${admin.id})`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
