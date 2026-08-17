import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// Base path is configurable at build time so the app can be deployed under
// a sub-path (e.g. `npm run build -- --base=/play/`), while defaulting to
// root for local dev / preview.
export default defineConfig({
  base: "/",
  plugins: [preact()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
