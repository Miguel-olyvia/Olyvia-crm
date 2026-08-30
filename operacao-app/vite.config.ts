import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// App separada de Operações. Reutiliza o mesmo backend Supabase da Olyvia via
// .env, mas não partilha código nem build com o sistema Olyvia.
// `base` só no build de produção: servido em olyvia-ai.com/operacao/. Em dev
// local mantém-se em "/" (http://localhost:5274/).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/operacao/" : "/",
  plugins: [react()],
  server: {
    port: 5274,
    strictPort: false,
  },
}));
