// GUARDA: os ecrãs do canal de denúncias de exemplo (/canal-denuncias) só usam dados em memória, sem ligação à base.
// Este teste lê o código fonte e falha se aparecer uma importação do Supabase ou do react-query, uma chamada a fetch,
// .rpc( ou .from("tabela"), armazenamento do navegador (quem denuncia de um computador partilhado não deve deixar lá
// o que escreveu) ou uma importação de outros módulos (RH de exemplo, negócios, pessoas). Quem for ligar estes ecrãs à
// base tem de ALTERAR ESTE TESTE DE PROPÓSITO e dizê-lo na revisão: não se contorna com um alias nem se apaga em silêncio.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/canal-denuncias", "pages/canal-denuncias"];

const proibido: { nome: string; padrao: RegExp }[] = [
  { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/ },
  { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
  { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/ },
  { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
  { nome: "chamada a XMLHttpRequest ou sendBeacon", padrao: /XMLHttpRequest|sendBeacon/ },
  { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/ },
  { nome: "chamada a .from(\"tabela\") do Supabase", padrao: /\.from\s*\(\s*["'`]/ },
  { nome: "chamada a functions.invoke", padrao: /functions\s*\.\s*invoke\s*\(/ },
  { nome: "uso de localStorage, sessionStorage, indexedDB ou cookies", padrao: /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/ },
  { nome: "importação do contexto real de organização ou de permissões", padrao: /from\s+["']@\/(?:hooks\/usePermissions|contexts\/(?:CompanyContext|PermissionsContext))["']/ },
  { nome: "importação de outro módulo de exemplo ou da app (rh-exemplo, negocio-metas, pessoas, utilizadores-perfis)", padrao: /from\s+["']@\/components\/(?:rh-exemplo|negocio-metas|pessoas|utilizadores-perfis)\// },
  { nome: "importação de uma página fora de canal-denuncias", padrao: /from\s+["']@\/pages\/(?!canal-denuncias\/)/ },
  { nome: "relatório de erros real (posthog, captureFlowError real)", padrao: /from\s+["']@\/lib\/(?:analytics|observability)\// },
  { nome: "ligação mailto: ou tel:", padrao: /["'`](?:mailto|tel):/ },
];

const ehCodigo = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);

function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? ficheirosDe(caminho) : ehCodigo(caminho) ? [caminho] : [];
  });
}

const analisados = PASTAS.flatMap((p) => ficheirosDe(join(SRC, p)));
const nomes = analisados.map((f) => relative(SRC, f).replace(/\\/g, "/"));

describe("canal-denuncias: sem ligação à base de dados", () => {
  it("encontra os ficheiros a vigiar (o teste não passa por estar vazio)", () => {
    expect(analisados.length).toBeGreaterThan(30);
    for (const esperado of [
      "components/canal-denuncias/dados/loja.ts",
      "components/canal-denuncias/dados/rascunho.ts",
      "components/canal-denuncias/formulario/FormularioDenuncia.tsx",
      "components/canal-denuncias/acompanhar/VistaAcompanhamento.tsx",
      "components/canal-denuncias/gestao/PainelDenuncia.tsx",
      "pages/canal-denuncias/NovaDenuncia.tsx",
      "pages/canal-denuncias/AcompanharDenuncia.tsx",
      "components/canal-denuncias/gestao/PaginaGestao.tsx",
      "components/canal-denuncias/minhaArea/PaginaMinhasDenuncias.tsx",
      "components/canal-denuncias/minhaArea/PaginaDenunciar.tsx",
    ]) {
      expect(nomes).toContain(esperado);
    }
  });

  it.each(proibido)("nenhum ficheiro tem $nome", ({ padrao }) => {
    const culpados = analisados
      .filter((f) => padrao.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(culpados).toEqual([]);
  });
});
