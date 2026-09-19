import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  assertDatabaseMatchesEnv,
  assertNotProduction,
  EnvConfigError,
  getAppEnv,
} from "@/lib/env";

const original = process.env.APP_ENV;

afterEach(() => {
  if (original === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = original;
});

describe("getAppEnv", () => {
  it("defaults to development", () => {
    delete process.env.APP_ENV;
    assert.equal(getAppEnv(), "development");
  });

  it("rejects unknown values", () => {
    process.env.APP_ENV = "prod";
    assert.throws(() => getAppEnv(), EnvConfigError);
  });
});

describe("assertDatabaseMatchesEnv", () => {
  const url = (db: string) => `postgresql://u:p@host:5432/${db}?schema=public`;

  it("accepts the tier's own database", () => {
    assertDatabaseMatchesEnv("staging", url("ops_tools_staging"));
    assertDatabaseMatchesEnv("production", url("ops_tools_prod"));
    assertDatabaseMatchesEnv("development", url("ops_tools_dev"));
  });

  it("accepts a database that belongs to no tier", () => {
    assertDatabaseMatchesEnv("development", url("scratch"));
  });

  it("refuses another tier's database", () => {
    assert.throws(
      () => assertDatabaseMatchesEnv("staging", url("ops_tools_prod")),
      /belongs to production/,
    );
    assert.throws(
      () => assertDatabaseMatchesEnv("production", url("ops_tools_dev")),
      /belongs to development/,
    );
  });

  it("requires DATABASE_URL", () => {
    assert.throws(() => assertDatabaseMatchesEnv("development", undefined), EnvConfigError);
  });
});

describe("assertNotProduction", () => {
  it("only throws in production", () => {
    process.env.APP_ENV = "staging";
    assertNotProduction("Seeding");
    process.env.APP_ENV = "production";
    assert.throws(() => assertNotProduction("Seeding"), /not allowed/);
  });
});
