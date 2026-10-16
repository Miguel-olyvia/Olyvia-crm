import { defineConfig } from "vitest/config";
import path from "path";

// Testes de INTEGRACAO do RH contra a base DEV (uetjghdkwbywbftedtth).
// Separado do vitest.config.ts (unitario, jsdom, Supabase simulado): estes
// falam com a rede e com uma base real, por isso correm sequencialmente e
// so por pedido explicito (`npm run test:integration:rh`).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/rh/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
