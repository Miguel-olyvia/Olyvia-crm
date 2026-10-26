import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // Testes de Edge Functions escritos para o vitest. O sufixo `.vitest.`
      // e deliberado: os `*.test.ts` que ja vivem em `supabase/functions/`
      // sao testes de Deno (`Deno.test`, imports de deno.land) e nao correm
      // aqui — apanha-los partiria a suite inteira.
      "supabase/functions/**/*.vitest.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Specifiers do Deno das Edge Functions: so para os testes de handler (vitest), que os simulam com vi.mock.
      "npm:zod": "zod",
      "https://esm.sh/@supabase/supabase-js@2.80.0": "@supabase/supabase-js",
    },
  },
});
