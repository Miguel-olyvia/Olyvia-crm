import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// App separada do DUC. Reutiliza o mesmo backend Supabase da Olyvia via .env,
// mas não partilha código nem build com o sistema Olyvia.
// `base` só no build de produção: servido em olyvia-ai.com/duc-app/. Em dev
// local mantém-se em "/" (http://localhost:5273/).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/duc-app/" : "/",
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: false,
  },
}));
