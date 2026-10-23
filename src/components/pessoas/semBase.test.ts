// GUARDA: as páginas Pessoas e Negócio e metas (e as pastas que partilham, incluindo a Lista real em components/pessoas-lista)
// não falam com a base. A base só entra por `@/hooks/pessoas` (a Lista real lê por useListaPessoas e useNegociosAtivos).
// Este teste lê o código fonte e falha se aparecer uma importação do Supabase ou do react-query, ou uma chamada a fetch,
// .rpc( ou .from("tabela"). Quem for ligar mais ecrãs à base tem de passar a ligação por `@/hooks/pessoas` e dizê-lo
// na revisão: não se contorna com um alias nem se apaga em silêncio. O aviso "Dados de exemplo" do cabeçalho vive nas
// páginas de exemplo; a Lista real esconde-o.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** A raiz do código: o vitest corre sempre a partir da raiz do projeto. */
const SRC = join(process.cwd(), "src");

/** As pastas e os ficheiros que têm de continuar sem base. */
const PASTAS = ["components/pessoas", "components/pessoas-lista", "components/pessoas-processo", "components/ficha-comum", "components/negocio-metas"];
const FICHEIROS = ["pages/Pessoas.tsx", "pages/NegocioMetas.tsx"];

const proibido: { nome: string; padrao: RegExp }[] = [
  { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/ },
  { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
  { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/ },
  { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
  { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/ },
  { nome: "chamada a .from(\"tabela\") do Supabase", padrao: /\.from\s*\(\s*["'`]/ },
];

// fabricaLista.ts e traducaoTeste.ts são auxiliares de teste: ficam de fora, como os ficheiros .test.
const AUXILIARES_DE_TESTE = /(fabricaLista|traducaoTeste)\.ts$/;
const ehCodigo = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !AUXILIARES_DE_TESTE.test(f);

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

/**
 * Os ÚNICOS ficheiros da Lista real (components/pessoas-lista e components/pessoas-processo) que podem tocar em localStorage: a escolha de
 * colunas, guardada por organização (`colunasPessoas.ts`), e o hook que a usa (`useColunasPessoas.ts`). Os outros nunca guardam nada no
 * browser: quem precisar acrescenta o ficheiro aqui e diz porquê na revisão.
 */
const USAM_LOCALSTORAGE = ["components/pessoas-lista/colunasPessoas.ts", "components/pessoas-lista/useColunasPessoas.ts"];

describe("Lista real: localStorage só nos ficheiros autorizados", () => {
  const daListaReal = analisados.filter((f) => /\/components\/pessoas-(lista|processo)\//.test(f.replace(/\\/g, "/")));
  const relativo = (f: string): string => relative(SRC, f).replace(/\\/g, "/");

  it("a lista de autorizados só tem ficheiros que existem (não fica a autorizar fantasmas)", () => {
    const existentes = daListaReal.map(relativo);
    for (const f of USAM_LOCALSTORAGE) expect(existentes, f).toContain(f);
  });

  it("nenhum outro ficheiro usa localStorage", () => {
    const culpados = daListaReal.map(relativo).filter((f) => !USAM_LOCALSTORAGE.includes(f) && /\blocalStorage\b/.test(readFileSync(join(SRC, f), "utf8")));
    expect(culpados).toEqual([]);
  });

  it("os autorizados continuam a precisar dele (um autorizado que já não o usa sai da lista)", () => {
    const sem = USAM_LOCALSTORAGE.filter((f) => !/\blocalStorage\b/.test(readFileSync(join(SRC, f), "utf8")));
    expect(sem).toEqual([]);
  });
});

describe("pessoas-processo: sem base", () => {
  it("a pasta é vigiada (encontra os seus ficheiros)", () => {
    const nomes = analisados.map((f) => f.replace(/\\/g, "/")).filter((f) => f.includes("/components/pessoas-processo/")).map((f) => f.split("/").pop());
    expect(nomes).toEqual(expect.arrayContaining(["ProcessoProviderReal.tsx", "PainelOrcamentoReal.tsx", "PainelPropostaReal.tsx", "BarraVoltar.tsx"]));
  });
});

/** Os únicos hooks da app que a Lista real (components/pessoas-lista) pode importar. */
const HOOKS_PERMITIDOS = ["@/hooks/pessoas/", "@/hooks/useTranslation", "@/hooks/useDebounce"];

describe("Lista real: só importa os hooks permitidos", () => {
  const daLista = analisados.filter((f) => f.replace(/\\/g, "/").includes("/components/pessoas-lista/"));

  it("encontra os ficheiros da Lista real e deixa de fora os auxiliares de teste", () => {
    const nomes = daLista.map((f) => f.replace(/\\/g, "/").split("/").pop());
    expect(nomes).toEqual(expect.arrayContaining(["PessoasRota.tsx", "PessoasReal.tsx", "useFiltrosLista.ts"]));
    expect(nomes).not.toContain("fabricaLista.ts");
    expect(nomes).not.toContain("traducaoTeste.ts");
  });

  it("nenhum importa um hook fora de @/hooks/pessoas/, useTranslation e useDebounce", () => {
    const culpados: string[] = [];
    for (const f of daLista) {
      const importados = [...readFileSync(f, "utf8").matchAll(/from\s+["'](@\/hooks\/[^"']*)["']/g)].map((m) => m[1]);
      for (const origem of importados) {
        if (!HOOKS_PERMITIDOS.some((p) => origem === p || origem.startsWith(p.endsWith("/") ? p : `${p}/`))) {
          culpados.push(`${relative(SRC, f).replace(/\\/g, "/")} -> ${origem}`);
        }
      }
    }
    expect(culpados).toEqual([]);
  });
});
