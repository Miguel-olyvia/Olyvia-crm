// 25/11 (Obra Viva, etapa 3b): empacota o motor dos agentes para a Edge Function agentes-obra (Deno). Corre-se antes de publicar:
//   npm run build:agentes-obra && npx supabase functions deploy agentes-obra --no-verify-jwt --project-ref <projeto>
// O «@/integrations/supabase/client» da app passa a ser o clienteServidor.ts (o cliente da conta robô); o resto do «@/» é o src/.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pasta = path.join(raiz, "supabase", "functions", "agentes-obra");
const cliente = path.join(pasta, "clienteServidor.ts");

await build({
  entryPoints: [path.join(pasta, "entrada.ts")],
  outfile: path.join(pasta, "motor.bundle.js"),
  bundle: true, format: "esm", platform: "neutral", target: "es2022", mainFields: ["module", "main"], jsx: "automatic",
  logLevel: "warning", legalComments: "none",
  define: { "import.meta.env.VITE_SUPABASE_URL": '""', "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""', "import.meta.env.DEV": "false", "import.meta.env.PROD": "true", "import.meta.env.MODE": '"production"' },
  plugins: [{
    name: "aliases-do-servidor",
    setup(b) {
      b.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({ path: cliente }));
      b.onResolve({ filter: /^@\// }, (a) => b.resolve("./" + a.path.slice(2), { resolveDir: path.join(raiz, "src"), kind: a.kind }));
    },
  }],
  // o @supabase/supabase-js vem do index.ts (Deno); aqui só os tipos
  external: ["@supabase/supabase-js"],
});
console.log("motor.bundle.js pronto em", pasta);
