import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env["AEROGRAPH_DB_PATH"];
if (!databaseUrl) {
  throw new Error(
    "AEROGRAPH_DB_PATH is required. Run 'aerograph status --verbose' to find the project database."
  );
}

export default defineConfig({
  schema: "./packages/cli/src/db/schema.ts",
  out: "./packages/cli/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl,
  },
});
