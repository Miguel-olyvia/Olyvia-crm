/**
 * Todas as chaves de tradução que a UI de Pessoas (lista, ficha, «Nova pessoa» e a página) usa existem em inglês e em
 * português, não vazias e diferentes da própria chave. Os outros três idiomas (es, fr, de) caem para o inglês: é a
 * regra de `useTranslation`, e por isso as chaves novas só levam pt e en.
 *
 * `useTranslation` devolve a própria chave quando nenhuma língua a tem: quem esquecesse uma veria
 * «rhNova.f.nome» no ecrã. A lista de chaves sai do próprio código-fonte (não de uma lista escrita à mão), para não
 * poder ficar desatualizada. Os códigos de permissão (`hasPermission("hr.pessoas.create")`) parecem chaves mas não são:
 * tiram-se antes de procurar. Os prefixos de chaves dinâmicas (`hr.genero` + valor) expandem-se pelos domínios reais.
 *
 * Também fecha o que NÃO pode existir: chaves e referências do protótipo, que eram só da maquete.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import {
  CATEGORIAS_FUNCAO, CONJUGE_SITUACOES_PROFISSIONAIS, ESTADOS_CIVIS, FORMATOS_CONTA, GENEROS, HABILITACOES_ACADEMICAS,
  HORAS_FREQUENCIAS, POLITICAS_FERIADOS, REGIMES_CONTRATUAIS, REGIMES_TRABALHO, TIPOS_CONTRATO, TIPOS_DOCUMENTO, TIPOS_TRABALHO,
} from "@/types/hr";
import { ABAS_FICHA } from "../ficha/abas";
import { FILTROS } from "../lista/filtros";
import { ABAS_NOVA } from "../novaPessoa/ids";

const FONTES = import.meta.glob(
  [
    "../ficha/*.{ts,tsx}",
    "../lista/*.{ts,tsx}",
    "../novaPessoa/*.{ts,tsx}",
    "../NovaPessoaDialogo.tsx",
    "../PessoaOutrosDadosCard.tsx",
    "../fimContrato/IndicacaoDoResponsavel.tsx",
    "../../../pages/Pessoas.tsx",
    "../../../pages/PessoaDetail.tsx",
    "!../**/*.test.*",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const NAMESPACES = "hr|rhNova|rhForm|rhAbas|rhA|rhExemplo|employees|sidebar|common|pessoasPagina";
const PADRAO = new RegExp(`["'\`]((?:${NAMESPACES})\\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'\`]`, "g");
/** `hasPermission("...")`, `has("...")` e `permission="..."`: códigos de permissão, não chaves de tradução. */
const PERMISSOES = /\b(?:hasPermission|has)\(\s*["'][^"']*["']\s*\)|\bpermissions?=\{?\s*["'][^"']*["']/g;

const TEXTOS = translations as unknown as Record<string, Record<string, string>>;

/** Os comentários citam chaves e permissões entre acentos graves; não são código. */
const COMENTARIOS = /\/\*[\s\S]*?\*\/|(^|[^:"'`])\/\/[^\n]*/g;

function chavesDe(codigo: string): string[] {
  const semComentarios = codigo.replace(COMENTARIOS, "$1");
  return [...semComentarios.replace(PERMISSOES, "").matchAll(PADRAO)].map((m) => m[1]);
}

/** Um prefixo de chaves dinâmicas (`hr.genero`): não existe sozinho, existem `hr.genero.<valor>`. */
const ePrefixo = (chave: string): boolean => !TEXTOS.en[chave] && Object.keys(TEXTOS.en).some((k) => k.startsWith(`${chave}.`));

const comPrefixo = (prefixo: string, valores: readonly string[]): string[] => valores.map((v) => `${prefixo}.${v}`);

/** As chaves dinâmicas que se sabem de cor, expandidas pelo domínio real. */
const DINAMICAS: string[] = [
  ...comPrefixo("hr.pessoa.tabs", ABAS_FICHA),
  ...comPrefixo("rhNova.tabs", ABAS_NOVA),
  ...comPrefixo("rhForm.lista.filtro", FILTROS),
  ...comPrefixo("hr.estadoAcesso", ["ativo", "semConta"]),
  ...comPrefixo("hr.estadoContrato", ["em_curso", "sem_contrato", "terminado"]),
  ...comPrefixo("hr.genero", GENEROS),
  ...comPrefixo("hr.estadoCivil", ESTADOS_CIVIS),
  ...comPrefixo("hr.tipoDocumento", TIPOS_DOCUMENTO),
  ...comPrefixo("hr.conjugeSituacaoProfissional", CONJUGE_SITUACOES_PROFISSIONAIS),
  ...comPrefixo("hr.habilitacaoAcademica", HABILITACOES_ACADEMICAS),
  ...comPrefixo("hr.formatoConta", FORMATOS_CONTA),
  ...comPrefixo("hr.tipoContrato", TIPOS_CONTRATO),
  ...comPrefixo("hr.regimeContratual", REGIMES_CONTRATUAIS),
  ...comPrefixo("hr.regime", REGIMES_TRABALHO),
  ...comPrefixo("hr.tipoTrabalho", TIPOS_TRABALHO),
  ...comPrefixo("hr.categoriaFuncao", CATEGORIAS_FUNCAO),
  ...comPrefixo("hr.horasFrequencia", HORAS_FREQUENCIAS),
  ...comPrefixo("hr.politicaFeriados", POLITICAS_FERIADOS),
  ...comPrefixo("rhNova.simNao", ["sim", "nao"]),
  ...comPrefixo("rhNova.modo", ["dinheiro", "cartao"]),
  ...comPrefixo("rhNova.duodecimos", ["0", "50", "100"]),
  ...comPrefixo("hr.form.seccoes", ["saude", "sindicalizacao", "anexos", "bancarios", "emergencia", "vinculo", "retribuicao", "conta"]),
  ...comPrefixo("hr.fimContrato.resposta", ["pretendo_continuar", "nao_pretendo_continuar", "ainda_por_decidir"]),
];

const LITERAIS = [...new Set(Object.values(FONTES).flatMap(chavesDe))].filter((chave) => !ePrefixo(chave));
const TODAS = [...new Set([...LITERAIS, ...DINAMICAS])].sort();

describe("a UI de Pessoas só usa chaves de tradução que existem", () => {
  it("encontrou código-fonte e chaves para verificar (a pesquisa não está vazia)", () => {
    expect(Object.keys(FONTES).length).toBeGreaterThan(30);
    expect(LITERAIS.length).toBeGreaterThan(150);
  });

  it.each(["en", "pt"] as const)("todas as chaves existem em %s, não vazias e diferentes da chave", (lingua) => {
    const texto = TEXTOS[lingua];
    const emFalta = TODAS.filter((chave) => !texto[chave] || texto[chave] === chave);
    expect(emFalta).toEqual([]);
  });

  it("nenhuma chave é do protótipo (rhExemplo.*): era só da maquete", () => {
    expect(TODAS.filter((c) => c.startsWith("rhExemplo."))).toEqual([]);
  });

  it("o título da lista é «Pessoas» (e não «Organização», o nome antigo do ecrã)", () => {
    expect(TEXTOS.pt["hr.pessoas.title"]).toBe("Pessoas");
    expect(TEXTOS.en["hr.pessoas.title"]).toBe("People");
  });
});

describe("a UI de Pessoas já não depende do protótipo nem dos seus dados em memória", () => {
  const PROIBIDO = ["rh-exemplo", "SeloExemplo", "dados/loja", "useFichaRh", "useEstadoRh", "hojeExemplo", "agoraExemplo"];

  it.each(PROIBIDO)("nenhum ficheiro menciona «%s»", (termo) => {
    const culpados = Object.entries(FONTES)
      .filter(([, codigo]) => codigo.includes(termo))
      .map(([ficheiro]) => ficheiro);
    expect(culpados).toEqual([]);
  });
});
