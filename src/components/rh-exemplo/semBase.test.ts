// GUARDA: os ecrãs de Recursos Humanos de exemplo (/rh-exemplo) só usam dados em memória, sem ligação à base.
// Este teste lê o código fonte e falha se aparecer uma importação do Supabase ou do react-query, uma chamada a
// fetch, .rpc( ou .from("tabela"), ou uma importação de hrDb. Quem for ligar estes ecrãs à base tem de ALTERAR ESTE
// TESTE DE PROPÓSITO e dizê-lo na revisão: não se contorna com um alias nem se apaga em silêncio.
//
// ALTERADO DE PROPÓSITO (26/10, ligar o exemplo ao real): a fronteira passou a ser «só os wrappers dentro de
// rh-exemplo/hooks/ podem importar de @/hooks (hooks de dados reais), @/lib/hr e @/components/hr». É por esses
// wrappers que cada ecrã passa a falar com a base que já existe. Tudo o resto na pasta continua sem poder importar
// a base. Supabase, react-query, hrDb, fetch, .rpc(, .from(, contextos reais e páginas reais seguem proibidos em
// TODA a pasta, wrappers incluídos (o wrapper usa o hook real, não chama a base). Só as regras marcadas com
// `permitidoNosWrappers` deixam de se aplicar a rh-exemplo/hooks/: os hooks reais e @/lib/hr, @/components/hr, mais
// o que os próprios wrappers precisam para ficarem ligados (CompanyContext e usePermissions reais, o reporte de erros
// @/lib/observability (ALTERADO DE PROPÓSITO, grupo D: o detalhe de ausências, cargo e fim de contrato passaram a reportar
// como o módulo real, por hooks/captureFlowError.ts), @/utils/hr e
// @/types/hr, este último só tipos). Fora de hooks/, nada disto é permitido.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/rh-exemplo", "pages/rh-exemplo"];

const proibido: { nome: string; padrao: RegExp; permitidoNosWrappers?: boolean }[] = [
  { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/ },
  { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
  { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/ },
  { nome: "importação de hrDb", padrao: /from\s+["'][^"']*hrDb["']/ },
  { nome: "importação do CompanyContext real", padrao: /from\s+["']@\/contexts\/CompanyContext["']/, permitidoNosWrappers: true },
  { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
  { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/ },
  { nome: "chamada a .from(\"tabela\") do Supabase", padrao: /\.from\s*\(\s*["'`]/ },
  { nome: "chamada a functions.invoke", padrao: /functions\s*\.\s*invoke\s*\(/ },
  { nome: "importação de código real de RH fora dos wrappers (@/components/hr, @/lib/hr)", padrao: /from\s+["']@\/(?:components\/hr\/|lib\/hr\/)/, permitidoNosWrappers: true },
  { nome: "importação de código real de RH (@/utils/hr, @/types/hr)", padrao: /from\s+["']@\/(?:utils\/hr\/|types\/hr)/, permitidoNosWrappers: true },
  { nome: "importação de um hook de dados real (@/hooks/use...Rh/Pessoa/Ausencias/Assiduidade/Processamento...)", padrao: /from\s+["']@\/hooks\/use(?:Pessoa|Ausencias|Assiduidade|Locais|Modelos|Clausulas|Codigos|Processamento|Regras|Convite|Relatorio|Retribuicoes|Configuracao|Cargos)/, permitidoNosWrappers: true },
  { nome: "importação de uma página real (@/pages fora de rh-exemplo)", padrao: /from\s+["']@\/pages\/(?!rh-exemplo\/)/ },
  { nome: "importação do contexto real de permissões ou de organização", padrao: /from\s+["']@\/(?:hooks\/usePermissions|contexts\/(?:CompanyContext|PermissionsContext))["']/, permitidoNosWrappers: true },
  { nome: "relatório de erros real (posthog, captureFlowError real)", padrao: /from\s+["']@\/lib\/(?:analytics|observability)\//, permitidoNosWrappers: true },
];

/** Os wrappers: ficheiros dentro de components/rh-exemplo/hooks/. */
const ehWrapper = (f: string): boolean => relative(SRC, f).replace(/\\/g, "/").startsWith("components/rh-exemplo/hooks/");

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
      "pages/rh-exemplo/RhPortalColaborador.tsx",
      "components/rh-exemplo/assiduidade/PainelDoDia.tsx",
      "components/rh-exemplo/convite/ConvitePagina1.tsx",
      "components/rh-exemplo/processamento/ProcessamentoVisaoGeralTab.tsx",
      "components/rh-exemplo/hooks/useAssiduidadeDaPessoa.ts",
      "components/rh-exemplo/hooks/useConviteAdmissaoPublico.ts",
      "components/rh-exemplo/dados/lojaGestao.ts",
      "components/rh-exemplo/dados/lojaPortalDocumentos.ts",
      "components/rh-exemplo/dados/accoesPortalDocumentos.ts",
      "components/rh-exemplo/portal/PortalConectado.tsx",
      "components/rh-exemplo/portal/PortalColaboradorRh.tsx",
    ]) {
      expect(nomes).toContain(esperado);
    }
  });

  it.each(proibido)("nenhum ficheiro tem $nome", ({ padrao, permitidoNosWrappers }) => {
    const culpados = analisados
      .filter((f) => !(permitidoNosWrappers && ehWrapper(f)))
      .filter((f) => padrao.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(culpados).toEqual([]);
  });
});
