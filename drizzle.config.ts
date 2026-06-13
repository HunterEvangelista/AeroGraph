import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/cli/src/db/schema.ts",
  out: "./packages/cli/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: ".kioku/kioku.db",
  },
});
