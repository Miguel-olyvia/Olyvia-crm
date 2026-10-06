import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// A lista dos ficheiros do build, para o service worker (public/sw.js) os
// guardar todos — sem ela, uma página nunca aberta com rede (o seu bocado de
// JavaScript) não abria sem rede.
function listaParaSemRede(): Plugin {
  return {
    name: "operacao-lista-sem-rede",
    apply: "build",
    generateBundle(_opcoes, bundle) {
      const ficheiros = Object.keys(bundle).filter((f) => f.startsWith("assets/"));
      this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify(ficheiros) });
    },
  };
}

// App separada de Operações. Reutiliza o mesmo backend Supabase da Olyvia via
// .env, mas não partilha código nem build com o sistema Olyvia.
// `base` só no build de produção: servido em olyvia-ai.com/operacao/. Em dev
// local mantém-se em "/" (http://localhost:5274/).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/operacao/" : "/",
  plugins: [react(), listaParaSemRede()],
  server: {
    port: 5274,
    strictPort: false,
    // Aceita ligações da rede local, para se poder abrir no telemóvel sem
    // publicar nada. Só o Wi-Fi de casa/escritório lá chega — não é público.
    host: true,
  },
}));
