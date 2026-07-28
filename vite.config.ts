import { cloudflare } from "@cloudflare/vite-plugin";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: process.env.VITEST ? [] : [cloudflare()],
  test: {
    environment: "happy-dom",
    exclude: ["tests/e2e/**", ...configDefaults.exclude]
  }
});
