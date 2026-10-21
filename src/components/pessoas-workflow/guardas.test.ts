// GUARDAS do Workflow de Pessoas (components/pessoas-workflow e hooks/pessoas/workflow). Lêem o código fonte, como semBase.test.ts:
//  1. os componentes não falam com a base (a base só entra por @/hooks/pessoas);
//  2. a ESCRITA das regras só passa pela função da base: nenhum ficheiro faz upsert, insert, update ou delete numa tabela;
//  3. do código de Leads só se reutiliza o catálogo de condições (puro) e a chave da cache de regras de Leads (para a refrescar).
// Quem precisar de mais uma ligação a Leads acrescenta-a aqui e diz porquê na revisão.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const COMPONENTES = "components/pessoas-workflow";
const HOOKS = "hooks/pessoas/workflow";

const ehCodigo = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);
function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? ficheirosDe(caminho) : ehCodigo(caminho) ? [caminho] : [];
  });
}
const nome = (f: string): string => relative(SRC, f).replace(/\\/g, "/");
/** O código sem comentários: os comentários explicam o que NÃO se faz e podem citar os nomes proibidos. */
const codigoDe = (f: string): string => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const doComponentes = ficheirosDe(join(SRC, COMPONENTES));
const doHooks = ficheirosDe(join(SRC, HOOKS));

describe("o Workflow de Pessoas: os ficheiros vigiados existem (o teste não passa por estar vazio)", () => {
  it("encontra os componentes e os hooks", () => {
    expect(doComponentes.map(nome)).toEqual(expect.arrayContaining([
      `${COMPONENTES}/BotaoWorkflowPessoas.tsx`, `${COMPONENTES}/WorkflowPessoasDialogo.tsx`, `${COMPONENTES}/QualificacaoSeparador.tsx`,
      `${COMPONENTES}/EditorCondicoes.tsx`, `${COMPONENTES}/LevantamentoSeparador.tsx`, `${COMPONENTES}/NegociosSeparador.tsx`,
    ]));
    expect(doHooks.map(nome)).toEqual(expect.arrayContaining([
      `${HOOKS}/useRegrasQualificacao.ts`, `${HOOKS}/regrasQualificacao.ts`, `${HOOKS}/errosWorkflow.ts`,
      `${HOOKS}/useQuestionarioLevantamento.ts`, `${HOOKS}/useRascunhoQuestionario.ts`, `${HOOKS}/questionario.ts`,
      `${HOOKS}/questionarioEdicao.ts`, `${HOOKS}/errosQuestionario.ts`, `${HOOKS}/useConfigNegocios.ts`, `${HOOKS}/configNegocios.ts`,
    ]));
  });
});

describe("os componentes não falam com a base", () => {
  const proibido: { nome: string; padrao: RegExp }[] = [
    { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/ },
    { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
    { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/ },
    { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
    { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/ },
    { nome: "chamada a .from(\"tabela\")", padrao: /\.from\s*\(\s*["'`]/ },
  ];
  it.each(proibido)("nenhum componente tem $nome", ({ padrao }) => {
    expect(doComponentes.filter((f) => padrao.test(codigoDe(f))).map(nome)).toEqual([]);
  });

  it("os componentes só importam hooks de @/hooks/pessoas/ e useTranslation", () => {
    const culpados: string[] = [];
    for (const f of doComponentes) {
      for (const m of codigoDe(f).matchAll(/from\s+["'](@\/hooks\/[^"']*)["']/g)) {
        if (!m[1].startsWith("@/hooks/pessoas/") && m[1] !== "@/hooks/useTranslation") culpados.push(`${nome(f)} -> ${m[1]}`);
      }
    }
    expect(culpados).toEqual([]);
  });
});

describe("a escrita só passa pela função da base", () => {
  const escritas = [/\.upsert\s*\(/, /\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/];
  it("nenhum ficheiro do Workflow escreve numa tabela", () => {
    const culpados = [...doComponentes, ...doHooks].filter((f) => escritas.some((p) => p.test(codigoDe(f)))).map(nome);
    expect(culpados).toEqual([]);
  });

  it("os hooks chamam só as funções do Workflow: gravar as regras, gravar o questionário e lê-lo, gravar a configuração dos negócios e, nas consequências, a cadeia e a recusa do orçamento (nenhuma outra neg_)", () => {
    const chamadas = doHooks.flatMap((f) => [...codigoDe(f).matchAll(/["'`](neg_[a-z_]+)["'`]/g)].map((m) => m[1]));
    expect([...new Set(chamadas)].sort()).toEqual([
      "neg_guardar_cadeia", "neg_guardar_config_negocios", "neg_guardar_questionario", "neg_guardar_recusa_orcamento", "neg_guardar_regras_qualificacao",
      "neg_questionario_levantamento",
    ]);
  });

  it("cada função de escrita tem um só hook que a chama", () => {
    const quemChama = (funcao: string) => doHooks.filter((f) => codigoDe(f).includes(`"${funcao}"`)).map(nome);
    expect(quemChama("neg_guardar_regras_qualificacao")).toEqual([`${HOOKS}/useRegrasQualificacao.ts`]);
    expect(quemChama("neg_guardar_questionario")).toEqual([`${HOOKS}/useQuestionarioLevantamento.ts`]);
    expect(quemChama("neg_guardar_config_negocios")).toEqual([`${HOOKS}/useConfigNegocios.ts`]);
    expect(quemChama("neg_guardar_cadeia")).toEqual([`${HOOKS}/useConsequencias.ts`]);
    expect(quemChama("neg_guardar_recusa_orcamento")).toEqual([`${HOOKS}/useConsequencias.ts`]);
  });
});

describe("do código de Leads só se reutiliza o que está nesta lista", () => {
  const PERMITIDO = [
    "@/components/leads/workflow/conditionCatalog",
    "@/hooks/useLeadPipelineRules",
  ];
  it("nenhum ficheiro importa de Leads fora do catálogo de condições e da chave da cache", () => {
    const culpados: string[] = [];
    for (const f of [...doComponentes, ...doHooks]) {
      for (const m of codigoDe(f).matchAll(/from\s+["'](@\/(?:components\/leads|pages\/AnewLeads|hooks\/useLead|hooks\/useLeads)[^"']*)["']/g)) {
        if (!PERMITIDO.includes(m[1])) culpados.push(`${nome(f)} -> ${m[1]}`);
      }
    }
    expect(culpados).toEqual([]);
  });

  it("e de @/hooks/useLeadPipelineRules só se importa a chave da cache, nunca o hook que lê quatro tabelas de Leads", () => {
    const culpados = [...doComponentes, ...doHooks]
      .filter((f) => /\buseLeadPipelineRules\b/.test(codigoDe(f).replace(/@\/hooks\/useLeadPipelineRules/g, "")))
      .map(nome);
    expect(culpados).toEqual([]);
  });

  it("não usa chaves de tradução leads.*", () => {
    expect([...doComponentes, ...doHooks].filter((f) => /\bt\(\s*["'`]leads\./.test(codigoDe(f))).map(nome)).toEqual([]);
  });
});
