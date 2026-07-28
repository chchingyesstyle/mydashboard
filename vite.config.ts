import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: process.env.VITEST ? [] : [cloudflare()],
  test: {
    environment: "happy-dom"
  }
});
