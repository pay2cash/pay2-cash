import { defineConfig } from "drizzle-kit";

// Generates plain SQL migrations into ./drizzle, applied to D1 via
// `wrangler d1 migrations apply` (see package.json scripts).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
