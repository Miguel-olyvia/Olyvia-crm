import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config de testes do duc-app. Corre com `npm run test`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
