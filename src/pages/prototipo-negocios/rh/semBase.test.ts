// GUARDA: a moldura do RH no protótipo (pasta rh/) e os ecrãs que ela mostra só usam dados de teste em memória. Lê o código fonte e falha se
// aparecer uma importação do Supabase ou do react-query, ou uma chamada a fetch, .rpc( ou .from("tabela"). Os ecrãs de rh-exemplo têm a sua própria
// guarda (components/rh-exemplo/semBase.test.ts); esta cobre a moldura nova.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PASTA = __dirname;
const proibido: { nome: string; padrao: RegExp }[] = [
  { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/ },
  { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
  { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/ },
  { nome: "importação do código real de RH (@/components/hr)", padrao: /from\s+["']@\/components\/hr\// },
  { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
  { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/ },
  { nome: "chamada a .from(\"tabela\")", padrao: /\.from\s*\(\s*["'`]/ },
];
// recursivo: as subpastas futuras de rh/ ficam vigiadas (caminhos relativos a PASTA, com barra normal)
const codigo = (readdirSync(PASTA, { recursive: true }) as string[]).map((f) => f.replace(/\\/g, "/")).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("RH no protótipo: sem ligação à base", () => {
  it("encontra os ficheiros a vigiar", () => {
    expect(codigo).toEqual(expect.arrayContaining(["RhPagina.tsx", "MenuRh.tsx", "abas.ts"]));
  });
  it.each(proibido)("nenhum ficheiro tem $nome", ({ padrao }) => {
    const culpados = codigo.filter((f) => padrao.test(readFileSync(join(PASTA, f), "utf8")));
    expect(culpados).toEqual([]);
  });
});
