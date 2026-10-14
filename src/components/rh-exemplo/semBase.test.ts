// GUARDA: os ecrãs de Recursos Humanos de exemplo (/rh-exemplo) só usam dados em memória, sem ligação à base.
// Este teste lê o código fonte e falha se aparecer uma importação do Supabase ou do react-query, uma chamada a
// fetch, .rpc( ou .from("tabela"), ou uma importação de hrDb. Quem for ligar estes ecrãs à base tem de ALTERAR ESTE
// TESTE DE PROPÓSITO e dizê-lo na revisão: não se contorna com um alias nem se apaga em silêncio.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/rh-exemplo", "pages/rh-exemplo"];

const proibido: { nome: string; padrao: RegExp }[] = [
  { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/ },
  { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
  { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/ },
  { nome: "importação de hrDb", padrao: /from\s+["'][^"']*hrDb["']/ },
  { nome: "importação do CompanyContext real", padrao: /from\s+["']@\/contexts\/CompanyContext["']/ },
  { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
  { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/ },
  { nome: "chamada a .from(\"tabela\") do Supabase", padrao: /\.from\s*\(\s*["'`]/ },
  { nome: "chamada a functions.invoke", padrao: /functions\s*\.\s*invoke\s*\(/ },
];

const ehCodigo = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);

function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? ficheirosDe(caminho) : ehCodigo(caminho) ? [caminho] : [];
  });
}

const analisados = PASTAS.flatMap((p) => ficheirosDe(join(SRC, p)));

describe("rh-exemplo: sem ligação à base de dados", () => {
  it("encontra os ficheiros a vigiar (o teste não passa por estar vazio)", () => {
    expect(analisados.length).toBeGreaterThan(100);
    expect(analisados.some((f) => f.endsWith("PessoasRh.tsx"))).toBe(true);
    expect(analisados.some((f) => f.endsWith("PessoaRhDetalhe.tsx"))).toBe(true);
  });

  it.each(proibido)("nenhum ficheiro tem $nome", ({ padrao }) => {
    const culpados = analisados
      .filter((f) => padrao.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(culpados).toEqual([]);
  });
});
