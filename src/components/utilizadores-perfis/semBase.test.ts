// GUARDA: a página "Utilizadores e perfis" só usa dados de exemplo, sem ligação à base. Falha se aparecer uma importação do
// Supabase ou do react-query, ou uma chamada a fetch, .rpc( ou .from("tabela"). Quem for ligar a página à base tem de
// ALTERAR ESTE TESTE DE PROPÓSITO e dizê-lo na revisão. Mesmo padrão das outras páginas de exemplo da app.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/utilizadores-perfis"];
const FICHEIROS = ["pages/UtilizadoresPerfis.tsx", "translations/utilizadoresPerfis.ts", "translations/utilizadoresPerfisForm.ts"];

const proibido: { nome: string; padrao: RegExp }[] = [
  { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/ },
  { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
  { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/ },
  { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
  { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/ },
  { nome: "chamada a .from(\"tabela\") do Supabase", padrao: /\.from\s*\(\s*["'`]/ },
];

const ehCodigo = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);

function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? ficheirosDe(caminho) : ehCodigo(caminho) ? [caminho] : [];
  });
}

const analisados = [...PASTAS.flatMap((p) => ficheirosDe(join(SRC, p))), ...FICHEIROS.map((f) => join(SRC, f))];

describe("Utilizadores e perfis: sem ligação à base de dados", () => {
  it("encontra os ficheiros a vigiar (o teste não passa por estar vazio)", () => {
    expect(analisados.length).toBeGreaterThan(15);
    expect(analisados.some((f) => f.endsWith("UtilizadoresPerfis.tsx"))).toBe(true);
  });

  it.each(proibido)("nenhum ficheiro tem $nome", ({ padrao }) => {
    const culpados = analisados
      .filter((f) => padrao.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(culpados).toEqual([]);
  });
});
