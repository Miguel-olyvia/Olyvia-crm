// GUARDA: as páginas Pessoas e Negócio e metas (e as pastas que partilham) só usam dados de exemplo, sem ligação à base.
// Este teste lê o código fonte e falha se aparecer uma importação do Supabase ou do react-query, ou uma chamada a fetch,
// .rpc( ou .from("tabela"). Quem for ligar estas páginas à base de dados tem de ALTERAR ESTE TESTE DE PROPÓSITO (por
// exemplo, tirando da lista de ficheiros os que passam a poder falar com a base) e dizê-lo na revisão: não se contorna
// com um alias nem se apaga em silêncio. Ver também o aviso "Dados de exemplo" do cabeçalho das páginas.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** A raiz do código: o vitest corre sempre a partir da raiz do projeto. */
const SRC = join(process.cwd(), "src");

/** As pastas e os ficheiros que têm de continuar sem base. */
const PASTAS = ["components/pessoas", "components/ficha-comum", "components/negocio-metas"];
const FICHEIROS = ["pages/Pessoas.tsx", "pages/NegocioMetas.tsx"];

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

describe("sem ligação à base de dados", () => {
  it("encontra os ficheiros a vigiar (o teste não passa por estar vazio)", () => {
    expect(analisados.length).toBeGreaterThan(60);
    expect(analisados.some((f) => f.endsWith("Pessoas.tsx"))).toBe(true);
    expect(analisados.some((f) => f.endsWith("NegocioMetas.tsx"))).toBe(true);
  });

  it.each(proibido)("nenhum ficheiro tem $nome", ({ padrao }) => {
    const culpados = analisados
      .filter((f) => padrao.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(culpados).toEqual([]);
  });
});
