import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
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
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // 4/11: o VAD da chamada em direto (vad-web) usa o onnxruntime só em WebAssembly, sem WebGPU/JSEP:
      // ficheiros do runtime em public/chamadas/vad (15 MB em vez de 44 MB) e sem workers, por causa da CSP.
      { find: /^onnxruntime-web(\/wasm)?$/, replacement: path.resolve(__dirname, "node_modules/onnxruntime-web/dist/ort.wasm.min.mjs") },
    ],
  },
  define: {
    global: "globalThis",
  },
  build: {
    // Required for Sentry to symbolicate minified stack traces.
    sourcemap: true,
  },
}));
