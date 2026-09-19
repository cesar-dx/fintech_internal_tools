import { assertDatabaseMatchesEnv, assertNotProduction, getAppEnv } from "../src/lib/env";

/**
 * Pre-flight for npm scripts that must not run against the wrong tier.
 *
 *   tsx scripts/assert-env.ts <operation> [--dev-only]
 *
 * Loads .env the same way Prisma does, checks DATABASE_URL belongs to APP_ENV,
 * refuses production, and with --dev-only refuses staging too (for
 * `prisma migrate dev`, which can reset a database).
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env: the environment is expected to be configured by the host.
}

const [operation = "This operation", flag] = process.argv.slice(2);
const env = getAppEnv();

assertNotProduction(operation);
assertDatabaseMatchesEnv(env);

if (flag === "--dev-only" && env !== "development") {
  console.error(
    `${operation} is only allowed when APP_ENV=development (got "${env}"). Use \`npm run db:deploy\` instead.`,
  );
  process.exit(1);
}
