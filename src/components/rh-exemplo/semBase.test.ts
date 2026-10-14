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
  { nome: "importação de código real de RH (@/components/hr, @/lib/hr, @/utils/hr, @/types/hr)", padrao: /from\s+["']@\/(?:components\/hr\/|lib\/hr\/|utils\/hr\/|types\/hr)/ },
  { nome: "importação de um hook de dados real (@/hooks/use...Rh/Pessoa/Ausencias/Assiduidade/Processamento...)", padrao: /from\s+["']@\/hooks\/use(?:Pessoa|Ausencias|Assiduidade|Locais|Modelos|Clausulas|Codigos|Processamento|Regras|Convite|Relatorio|Retribuicoes|Configuracao|Cargos)/ },
  { nome: "importação de uma página real (@/pages fora de rh-exemplo)", padrao: /from\s+["']@\/pages\/(?!rh-exemplo\/)/ },
  { nome: "importação do contexto real de permissões ou de organização", padrao: /from\s+["']@\/(?:hooks\/usePermissions|contexts\/(?:CompanyContext|PermissionsContext))["']/ },
  { nome: "relatório de erros real (posthog, captureFlowError real)", padrao: /from\s+["']@\/lib\/(?:analytics|observability)\// },
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

  it("vigia também os ecrãs de gestão, os hooks em memória e os dados de exemplo", () => {
    const nomes = analisados.map((f) => relative(SRC, f).replace(/\\/g, "/"));
    for (const esperado of [
      "pages/rh-exemplo/RhAssiduidadeEAusencias.tsx",
      "pages/rh-exemplo/RhMeuPonto.tsx",
      "pages/rh-exemplo/RhMinhasAusencias.tsx",
      "pages/rh-exemplo/RhMeusDocumentos.tsx",
      "pages/rh-exemplo/RhCentrosTrabalho.tsx",
      "pages/rh-exemplo/RhModelosDocumentos.tsx",
      "pages/rh-exemplo/RhProcessamentoSalarial.tsx",
      "pages/rh-exemplo/RhConfiguracaoAdmissao.tsx",
      "pages/rh-exemplo/RhRegrasFimContrato.tsx",
      "pages/rh-exemplo/RhConviteAdmissao.tsx",
      "components/rh-exemplo/assiduidade/PainelDoDia.tsx",
      "components/rh-exemplo/convite/ConvitePagina1.tsx",
      "components/rh-exemplo/processamento/ProcessamentoVisaoGeralTab.tsx",
      "components/rh-exemplo/hooks/useAssiduidadeDaPessoa.ts",
      "components/rh-exemplo/hooks/useConviteAdmissaoPublico.ts",
      "components/rh-exemplo/dados/lojaGestao.ts",
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
