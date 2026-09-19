import { PrismaClient } from "@prisma/client";
import { assertDatabaseMatchesEnv, getAppEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  assertDatabaseMatchesEnv();
  return new PrismaClient({
    log: getAppEnv() === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
