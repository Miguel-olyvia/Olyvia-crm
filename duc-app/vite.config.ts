import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// App separada do DUC. Reutiliza o mesmo backend Supabase da Olyvia via .env,
// mas não partilha código nem build com o sistema Olyvia.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: false,
  },
});
