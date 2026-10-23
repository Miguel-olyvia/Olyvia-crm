// GUARDA: a «Nova lead» de Pessoas (components/pessoas-leads e hooks/pessoas/novaLead) COPIA o fluxo de Leads e nunca depende dele. A página
// de Leads deixa de ser usada e a Mudelar usa-a em produção: nada aqui importa dela, do seu diálogo de duplicados, das suas regras de
// bloqueio nem das suas traduções `leads.*`, e nenhum ficheiro de Pessoas chama o «criar mesmo assim» nem o «partilhar» de Leads.
// Lê o código fonte (como o semBase.test.ts) e falha se aparecer uma dessas ligações.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/pessoas-leads", "hooks/pessoas/novaLead"];

const ehCodigo = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !/supabaseFalso\.ts$/.test(f);
function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? ficheirosDe(caminho) : ehCodigo(caminho) ? [caminho] : [];
  });
}
const analisados = PASTAS.flatMap((p) => ficheirosDe(join(SRC, p)));
const nome = (f: string): string => relative(SRC, f).replace(/\\/g, "/");
/** O código sem comentários: os comentários explicam o que NÃO se faz e podem citar os nomes proibidos. */
const codigoDe = (f: string): string => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** O que só Leads usa (e desaparece com ele): importar daqui é uma dependência escondida. */
const NAO_SE_IMPORTA: { nome: string; padrao: RegExp }[] = [
  { nome: "pages/AnewLeads", padrao: /from\s+["']@\/pages\/AnewLeads/ },
  { nome: "pages/anewLeadsHelpers", padrao: /from\s+["']@\/pages\/anewLeadsHelpers/ },
  { nome: "components/leads/*", padrao: /from\s+["']@\/components\/leads\// },
  { nome: "lib/leadDuplicateCheck", padrao: /from\s+["']@\/lib\/leadDuplicateCheck/ },
  { nome: "lib/groupDuplicateMatches", padrao: /from\s+["']@\/lib\/groupDuplicateMatches/ },
  { nome: "lib/duplicateBlockingRule", padrao: /from\s+["']@\/lib\/duplicateBlockingRule/ },
  { nome: "lib/leads/campaignFieldCoverage", padrao: /from\s+["']@\/lib\/leads\/campaignFieldCoverage/ },
  { nome: "utils/leadFieldValidation", padrao: /from\s+["']@\/utils\/leadFieldValidation/ },
  { nome: "utils/addressSanitization", padrao: /from\s+["']@\/utils\/addressSanitization/ },
  { nome: "lib/assertNoSupabaseError", padrao: /from\s+["']@\/lib\/assertNoSupabaseError/ },
  { nome: "utils/entityContactSync", padrao: /from\s+["']@\/utils\/entityContactSync/ },
  { nome: "components/shared/DuplicateEntityDialog", padrao: /from\s+["']@\/components\/shared\/DuplicateEntityDialog/ },
  { nome: "hooks/useLeadPipelineRules", padrao: /from\s+["']@\/hooks\/useLeadPipelineRules/ },
  { nome: "chaves de tradução leads.*", padrao: /\bt\(\s*["'`]leads\./ },
];

/** Chamadas à base que a «Nova lead» de Pessoas nunca faz: o «criar mesmo assim», o «partilhar» e a função que ficou sem uso. */
const NUNCA_SE_CHAMA = ["rpc_create_lead_duplicate_override", "link_entity_to_org", "neg_criar_lead", "find_entity_matches"];

describe("a «Nova lead» de Pessoas não depende de Leads", () => {
  it("encontra os ficheiros a vigiar (o teste não passa por estar vazio)", () => {
    expect(analisados.length).toBeGreaterThan(20);
    const nomes = analisados.map(nome);
    expect(nomes).toEqual(expect.arrayContaining([
      "components/pessoas-leads/NovaLeadReal.tsx", "components/pessoas-leads/DuplicadosNovaLead.tsx",
      "hooks/pessoas/novaLead/regraDuplicadosPessoas.ts", "hooks/pessoas/novaLead/atualizarPessoaExistente.ts",
    ]));
  });

  it.each(NAO_SE_IMPORTA)("nenhum ficheiro importa $nome", ({ padrao }) => {
    const culpados = analisados.filter((f) => padrao.test(codigoDe(f))).map(nome);
    expect(culpados).toEqual([]);
  });

  it.each(NUNCA_SE_CHAMA)("nenhum ficheiro chama %s", (funcao) => {
    const padrao = new RegExp(`["'\`]${funcao}["'\`]`);
    const culpados = analisados.filter((f) => padrao.test(codigoDe(f))).map(nome);
    expect(culpados).toEqual([]);
  });

  it("não há «Criar mesmo assim» nem «Partilhar» no código", () => {
    const culpados = analisados.filter((f) => /criar mesmo assim|create anyway|partilhar com|share with/i.test(codigoDe(f))).map(nome);
    expect(culpados).toEqual([]);
  });
});
