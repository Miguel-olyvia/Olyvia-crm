import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { levantamentoProxy } from "./tools/ia/levantamentoProxy";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    // o levantamento por conversa do protótipo: a chave só existe no servidor (.env.local, sem o prefixo VITE_)
    levantamentoProxy(loadEnv(mode, process.cwd(), "").ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY),
    // Sourcemap upload only runs when SENTRY_AUTH_TOKEN is set (CI/Vercel build),
    // so local builds without the token still work unchanged.
    process.env.SENTRY_AUTH_TOKEN &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: "globalThis",
  },
  build: {
    // Required for Sentry to symbolicate minified stack traces.
    sourcemap: true,
  },
}));
