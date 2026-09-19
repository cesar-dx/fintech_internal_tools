export const APP_ENVS = ["development", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export class EnvConfigError extends Error {}

function isAppEnv(value: string): value is AppEnv {
  return (APP_ENVS as readonly string[]).includes(value);
}

/**
 * Which deployment tier this process belongs to. Distinct from NODE_ENV, which
 * Next.js sets to "production" for any optimised build, including staging.
 * Unset means development so a fresh checkout works without ceremony.
 */
export function getAppEnv(): AppEnv {
  const raw = process.env.APP_ENV?.trim() || "development";
  if (!isAppEnv(raw)) {
    throw new EnvConfigError(
      `APP_ENV must be one of ${APP_ENVS.join(", ")} (got "${raw}")`,
    );
  }
  return raw;
}

export function isProduction(): boolean {
  return getAppEnv() === "production";
}

const DB_NAME_SUFFIX: Record<AppEnv, string> = {
  development: "dev",
  staging: "staging",
  production: "prod",
};

function databaseName(url: string): string | undefined {
  try {
    return new URL(url).pathname.replace(/^\//, "") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fails fast when the process is pointed at another tier's database, e.g.
 * APP_ENV=staging with DATABASE_URL naming `ops_tools_prod`. Each tier owns a
 * database whose name ends in its suffix; a database that matches no tier is
 * allowed so local scratch databases keep working.
 */
export function assertDatabaseMatchesEnv(
  env: AppEnv = getAppEnv(),
  url: string | undefined = process.env.DATABASE_URL,
): void {
  if (!url) {
    throw new EnvConfigError("DATABASE_URL is not configured");
  }
  const name = databaseName(url);
  if (!name) return;
  for (const [otherEnv, suffix] of Object.entries(DB_NAME_SUFFIX)) {
    if (otherEnv !== env && name.endsWith(`_${suffix}`)) {
      throw new EnvConfigError(
        `APP_ENV is "${env}" but DATABASE_URL points at "${name}", which belongs to ${otherEnv}`,
      );
    }
  }
}

/** Seeding and other destructive helpers must never touch production data. */
export function assertNotProduction(operation: string): void {
  if (isProduction()) {
    throw new EnvConfigError(`${operation} is not allowed when APP_ENV=production`);
  }
}
