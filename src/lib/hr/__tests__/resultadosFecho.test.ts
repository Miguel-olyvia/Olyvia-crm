/**
 * O que o fecho do periodo envia (`p_resultados`) e como se le o que ficou gravado: campos exactos, arredondamentos,
 * lancamentos pontuais so manuais, avisos filtrados ao padrao, quando o botao de fechar e bloqueado, os erros da
 * RPC em portugues e a reconstrucao do resultado a partir da linha gravada. Tudo puro: sem base nem React.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_AVISOS_POR_PESSOA,
  MAX_LINHAS_POR_PESSOA,
  MAX_DESCRICAO_LANCAMENTO,
  avisosParaGravar,
  codigoDoErroDoFecho,
  construirResultadoPessoa,
  construirResultadosDoFecho,
  mensagemDeErroDoFecho,
  motivoDeBloqueioDoFecho,
  pessoasObrigatoriasDoFecho,
  resultadoDeLinhaGravada,
  retribuicaoEmVigorNoDia,
  somaLancamentosManuais,
  vinculoSobrepoePeriodo,
  type ResultadoLido,
} from "@/lib/hr/resultadosFecho";
import type { ResultadoProcessamentoPessoa } from "@/lib/hr/processamentoTotais";
import type { RetribuicaoVigenteLinha } from "@/hooks/useRetribuicoesVigentesDaOrganizacao";
import type { HrProcessamentoLancamento } from "@/types/hr";

const PESSOA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const REGRA = "33333333-3333-4333-8333-333333333333";
const RETRIB_VELHA = "44444444-4444-4444-8444-444444444444";
const RETRIB_ACTUAL = "55555555-5555-4555-8555-555555555555";

const resultado = (extra: Partial<ResultadoProcessamentoPessoa> = {}): ResultadoProcessamentoPessoa => ({
  valorHoraReal: 7.123456,
  baseMes: 1166.6666667,
  divisorDuodecimos: 12.5,
  linhasAutomaticas: [
    { codigoId: "c1", codigo: "100", nome: "Hora extra", origem: "horas_extra", horas: 3.5, valor: 31.1789 },
  ],
  totalCodigosAutomaticos: 31.18,
  linhasRegra: [{ tipo: "km", faixa: null, quantidade: 120, valor: 48 }],
  totalRegras: 48,
  descontoFaltas: 14.2469,
  subsidioAlimentacao: 110.005,
  lancamentosPontuais: 30.1,
  totalBrutoEstimado: 1371.7149,
  avisos: ["duodecimos_por_decidir"],
  ...extra,
});

const lanc = (extra: Partial<HrProcessamentoLancamento> = {}): HrProcessamentoLancamento => ({
  id: "l1", periodo_id: "per", pessoa_id: PESSOA, organization_id: "org", descricao: "Premio", valor: 10, tipo: "manual",
  quantidade: null, codigo_processamento_id: null, anulado_em: null, anulado_por: null, anulado_motivo: null,
  created_at: "", created_by: null, updated_at: "", updated_by: null, ...extra,
});

const versao = (extra: Partial<RetribuicaoVigenteLinha> = {}): RetribuicaoVigenteLinha => ({
  id: RETRIB_ACTUAL, pessoa_id: PESSOA, valor_base: 1000, periodicidade: "mensal", duodecimos_pct: 50,
  valido_de: "2026-01-01", valido_ate: null, ...extra,
});

describe("construirResultadoPessoa", () => {
  const entrada = {
    pessoaId: PESSOA,
    resultado: resultado(),
    versoes: [versao({ id: RETRIB_VELHA, valido_de: "2025-01-01", valido_ate: "2026-01-01" }), versao()],
    lancamentos: [lanc({ valor: 10.1 }), lanc({ id: "l2", valor: 20 })],
    dataFim: "2026-10-31",
    regraSalarialId: REGRA,
  };

  it("leva EXACTAMENTE os campos do contrato, e os totais com EXACTAMENTE os sete campos", () => {
    const r = construirResultadoPessoa(entrada);
    expect(Object.keys(r).sort()).toEqual(
      ["avisos", "cargo_periodo_id", "linhas", "pessoa_id", "regra_salarial_id", "retribuicao_id", "total_bruto", "totais", "valor_hora"].sort(),
    );
    expect(Object.keys(r.totais).sort()).toEqual(
      ["base_mes", "desconto_faltas", "divisor_duodecimos", "lancamentos_pontuais", "subsidio_alimentacao", "total_codigos_automaticos", "total_regras"],
    );
  });

  it("arredonda: valor da hora a 4 casas, dinheiro ao centimo, divisor a 4 casas", () => {
    const r = construirResultadoPessoa(entrada);
    expect(r.valor_hora).toBe(7.1235);
    expect(r.total_bruto).toBe(1371.71);
    expect(r.totais.base_mes).toBe(1166.67);
    expect(r.totais.desconto_faltas).toBe(14.25);
    expect(r.totais.subsidio_alimentacao).toBe(110.01);
    expect(r.totais.divisor_duodecimos).toBe(12.5);
    expect(r.linhas[0]).toMatchObject({ origem: "codigo", valor: 31.18, horas: 3.5 });
  });

  it("valores por calcular seguem como null, nunca como 0 inventado nem NaN", () => {
    const r = construirResultadoPessoa({
      ...entrada,
      resultado: resultado({ valorHoraReal: null, baseMes: null, divisorDuodecimos: null, totalBrutoEstimado: null, totalRegras: Number.NaN }),
    });
    expect(r.valor_hora).toBeNull();
    expect(r.total_bruto).toBeNull();
    expect(r.totais.base_mes).toBeNull();
    expect(r.totais.divisor_duodecimos).toBeNull();
    expect(r.totais.total_regras).toBeNull();
  });

  it("os lancamentos pontuais sao SO os manuais nao anulados, somados ao centimo", () => {
    const r = construirResultadoPessoa({
      ...entrada,
      lancamentos: [
        lanc({ valor: 0.1 }), lanc({ id: "l2", valor: 0.2 }),
        lanc({ id: "l3", valor: 99, anulado_em: "2026-10-02T00:00:00Z" }),
        lanc({ id: "l4", valor: 48, tipo: "km", quantidade: 120 }),
        lanc({ id: "l5", valor: 65.89, tipo: "ajudas", quantidade: 1 }),
        lanc({ id: "l6", valor: 5, tipo: undefined }),
      ],
    });
    expect(r.totais.lancamentos_pontuais).toBe(5.3);
    expect(r.linhas.filter((l) => l.origem === "lancamento")).toHaveLength(3);
    expect(somaLancamentosManuais([lanc({ valor: 0.1 }), lanc({ valor: 0.2 })])).toBe(0.3);
  });

  it("sem lancamentos a soma e 0 (nao null)", () => {
    expect(construirResultadoPessoa({ ...entrada, lancamentos: [] }).totais.lancamentos_pontuais).toBe(0);
  });

  it("so envia os avisos no padrao ^[a-z_]{1,60}$, sem repetidos", () => {
    const r = construirResultadoPessoa({
      ...entrada,
      resultado: resultado({ avisos: ["sem_retribuicao", "sem_retribuicao", "Maiusculas", "com espaco", "x".repeat(61), ""] as never }),
    });
    expect(r.avisos).toEqual(["sem_retribuicao"]);
    expect(avisosParaGravar(Array.from({ length: 30 }, (_, i) => `aviso_${"a".repeat(i + 1)}`))).toHaveLength(MAX_AVISOS_POR_PESSOA);
  });

  it("as linhas: codigo, regra e lancamento, no maximo 500 (cortam-se os lancamentos, nunca os codigos)", () => {
    const muitos = Array.from({ length: 600 }, (_, i) => lanc({ id: `l${i}`, valor: 1 }));
    const r = construirResultadoPessoa({ ...entrada, lancamentos: muitos });
    expect(r.linhas).toHaveLength(MAX_LINHAS_POR_PESSOA);
    expect(r.linhas.slice(0, 2).map((l) => l.origem)).toEqual(["codigo", "regra"]);
    expect(r.linhas.every((l) => ["codigo", "regra", "lancamento"].includes(l.origem) && typeof l.valor === "number")).toBe(true);
    // O total NAO se corta: vai nos totais, e e esse que a base confere.
    expect(r.totais.lancamentos_pontuais).toBe(600);
  });

  it("a versao de retribuicao e a EM VIGOR no ultimo dia (nunca a mais recente por omissao); o cargo vai null; a regra e a recebida", () => {
    const r = construirResultadoPessoa(entrada);
    expect(r.retribuicao_id).toBe(RETRIB_ACTUAL);
    expect(r.cargo_periodo_id).toBeNull();
    expect(r.regra_salarial_id).toBe(REGRA);
    // O dia de fim cai na versao velha (valido_ate exclusivo: 2026-01-01 ja e da nova).
    expect(construirResultadoPessoa({ ...entrada, dataFim: "2025-12-31" }).retribuicao_id).toBe(RETRIB_VELHA);
    expect(construirResultadoPessoa({ ...entrada, dataFim: "2026-01-01" }).retribuicao_id).toBe(RETRIB_ACTUAL);
  });

  it("sem versao em vigor no ultimo dia, retribuicao_id e null (a RPC recusa um fallback)", () => {
    const so = [versao({ valido_de: "2026-11-01" })];
    expect(retribuicaoEmVigorNoDia(so, "2026-10-31")).toBeNull();
    expect(construirResultadoPessoa({ ...entrada, versoes: so }).retribuicao_id).toBeNull();
    expect(construirResultadoPessoa({ ...entrada, versoes: [versao({ id: undefined })] }).retribuicao_id).toBeNull();
  });

  it("a descricao de cada lancamento gravado e truncada a 200 caracteres (o total vai em totais)", () => {
    const longa = "x".repeat(450);
    const r = construirResultadoPessoa({ ...entrada, lancamentos: [lanc({ descricao: longa, valor: 10 })] });
    const linha = r.linhas.find((l) => l.origem === "lancamento");
    expect((linha?.descricao as string).length).toBe(MAX_DESCRICAO_LANCAMENTO);
    expect(MAX_DESCRICAO_LANCAMENTO).toBe(200);
    expect(r.totais.lancamentos_pontuais).toBe(10);
  });

  it("sem regra salarial em vigor, regra_salarial_id e null", () => {
    expect(construirResultadoPessoa({ ...entrada, regraSalarialId: null }).regra_salarial_id).toBeNull();
  });
});

describe("construirResultadosDoFecho", () => {
  const args = (resultados: Record<string, ResultadoProcessamentoPessoa | undefined>) => ({
    pessoasObrigatorias: [PESSOA, OUTRA],
    resultadoDe: (id: string) => resultados[id],
    versoesDe: () => [versao()],
    lancamentosDe: () => [],
    dataFim: "2026-10-31",
    regraSalarialId: REGRA,
  });

  it("um resultado por pessoa obrigatoria, pela ordem recebida", () => {
    const { resultados, semCalculo } = construirResultadosDoFecho(args({ [PESSOA]: resultado(), [OUTRA]: resultado() }));
    expect(resultados.map((r) => r.pessoa_id)).toEqual([PESSOA, OUTRA]);
    expect(semCalculo).toEqual([]);
  });

  it("uma pessoa obrigatoria sem calculo e dita, e nao entra", () => {
    const { resultados, semCalculo } = construirResultadosDoFecho(args({ [PESSOA]: resultado() }));
    expect(resultados.map((r) => r.pessoa_id)).toEqual([PESSOA]);
    expect(semCalculo).toEqual([OUTRA]);
  });
});

describe("as pessoas obrigatorias do fecho", () => {
  const v = (dataInicio: string, dataFim: string | null) =>
    ({ tipoContrato: "sem_termo", estado: "activo", dataInicio, dataFim, horasSemanais: 40 }) as never;

  it("vinculo sobreposto: comeca ate ao ultimo dia e nao acabou antes do primeiro (fim inclusivo)", () => {
    expect(vinculoSobrepoePeriodo([v("2026-01-01", null)], "2026-10-01", "2026-10-31")).toBe(true);
    expect(vinculoSobrepoePeriodo([v("2026-10-31", null)], "2026-10-01", "2026-10-31")).toBe(true);
    expect(vinculoSobrepoePeriodo([v("2026-11-01", null)], "2026-10-01", "2026-10-31")).toBe(false);
    expect(vinculoSobrepoePeriodo([v("2026-01-01", "2026-10-01")], "2026-10-01", "2026-10-31")).toBe(true);
    expect(vinculoSobrepoePeriodo([v("2026-01-01", "2026-09-30")], "2026-10-01", "2026-10-31")).toBe(false);
    expect(vinculoSobrepoePeriodo(undefined, "2026-10-01", "2026-10-31")).toBe(false);
  });

  it("so as activas com vinculo sobreposto entram", () => {
    const vinculos = new Map([[PESSOA, [v("2026-01-01", null)]], [OUTRA, [v("2026-01-01", "2026-03-01")]]]);
    expect(pessoasObrigatoriasDoFecho([PESSOA, OUTRA, "sem-vinculo"], vinculos, "2026-10-01", "2026-10-31")).toEqual([PESSOA]);
  });
});

describe("motivoDeBloqueioDoFecho", () => {
  const ok = {
    direitosLidos: true, retribuicoes: "ok" as const, codigos: "ok" as const, regras: "ok" as const, vinculos: "ok" as const,
    pessoasObrigatorias: [PESSOA, OUTRA], comCalculo: () => true, assiduidadeIncompleta: () => false,
  };

  it("sem nenhum problema nao bloqueia", () => {
    expect(motivoDeBloqueioDoFecho(ok)).toBeNull();
    expect(motivoDeBloqueioDoFecho({ ...ok, regras: "indisponivel" })).toBeNull();
  });

  it("os direitos salariais por ler bloqueiam", () => {
    expect(motivoDeBloqueioDoFecho({ ...ok, direitosLidos: false })).toEqual({ codigo: "direitos" });
  });

  it.each(["recusado", "erro", "a_carregar", "indisponivel"] as const)("retribuicoes %s bloqueiam", (retribuicoes) => {
    expect(motivoDeBloqueioDoFecho({ ...ok, retribuicoes })).toEqual({ codigo: "retribuicoes" });
  });

  it.each(["recusado", "erro", "a_carregar", "indisponivel"] as const)("codigos de processamento %s bloqueiam", (codigos) => {
    expect(motivoDeBloqueioDoFecho({ ...ok, codigos })).toEqual({ codigo: "codigos" });
  });

  it("a assiduidade lida so em parte (recusada, com erro ou truncada) bloqueia e diz quantas pessoas", () => {
    expect(motivoDeBloqueioDoFecho({ ...ok, assiduidadeIncompleta: (id) => id === OUTRA })).toEqual({ codigo: "assiduidade", n: 1 });
    expect(motivoDeBloqueioDoFecho({ ...ok, assiduidadeIncompleta: () => true })).toEqual({ codigo: "assiduidade", n: 2 });
  });

  it("a assiduidade incompleta de quem nao e obrigatorio nao bloqueia", () => {
    expect(motivoDeBloqueioDoFecho({ ...ok, pessoasObrigatorias: [PESSOA], assiduidadeIncompleta: (id) => id === OUTRA })).toBeNull();
  });

  it.each(["recusado", "erro", "a_carregar"] as const)("regras salariais %s bloqueiam", (regras) => {
    expect(motivoDeBloqueioDoFecho({ ...ok, regras })).toEqual({ codigo: "regras" });
  });

  it.each(["recusado", "erro", "a_carregar"] as const)("vinculos %s bloqueiam (nao se sabe quem e obrigatorio)", (vinculos) => {
    expect(motivoDeBloqueioDoFecho({ ...ok, vinculos })).toEqual({ codigo: "vinculos" });
  });

  it("uma pessoa obrigatoria sem calculo bloqueia e diz quantas faltam", () => {
    expect(motivoDeBloqueioDoFecho({ ...ok, comCalculo: (id) => id === PESSOA })).toEqual({ codigo: "calculo", n: 1 });
    expect(motivoDeBloqueioDoFecho({ ...ok, comCalculo: () => false })).toEqual({ codigo: "calculo", n: 2 });
  });
});

describe("os erros da RPC de fechar, em portugues claro", () => {
  beforeEach(() => window.localStorage.setItem("language", "pt"));
  afterEach(() => window.localStorage.removeItem("language"));

  const codigos = [
    "processamento_fechar_resultado_em_falta",
    "processamento_fechar_pessoa_fora_do_periodo",
    "processamento_fechar_pessoa_repetida",
    "processamento_fechar_versao_invalida",
    "processamento_fechar_regra_desactualizada",
    "processamento_fechar_lancamentos_desactualizados",
    "processamento_fechar_resultado_mal_formado",
    "processamento_resultados_periodo_aberto",
  ];

  it.each(codigos)("%s tem mensagem propria, sem o codigo tecnico", (codigo) => {
    const texto = mensagemDeErroDoFecho({ code: "23514", message: `${codigo}: detalhe tecnico (uuid)` });
    expect(texto).toBeTruthy();
    expect(texto).not.toContain("processamento_");
    expect(texto).not.toMatch(/rhProcReal/);
  });

  it("os erros de fechar dizem que o periodo continua aberto", () => {
    expect(mensagemDeErroDoFecho({ message: "processamento_fechar_resultado_em_falta: ..." })).toMatch(/continua aberto/);
  });

  it("na lingua inglesa ha texto proprio", () => {
    window.localStorage.setItem("language", "en");
    expect(mensagemDeErroDoFecho({ message: "processamento_fechar_regra_desactualizada" })).toMatch(/still open/);
  });

  it("erros desconhecidos ou de outra origem nao se traduzem aqui", () => {
    expect(mensagemDeErroDoFecho({ message: "outra coisa" })).toBeNull();
    expect(mensagemDeErroDoFecho({ message: "processamento_fechar_inventado" })).toBeNull();
    expect(mensagemDeErroDoFecho(null)).toBeNull();
    expect(codigoDoErroDoFecho("processamento_fechar_pessoa_repetida: x")).toBe("processamento_fechar_pessoa_repetida");
  });
});

describe("resultadoDeLinhaGravada", () => {
  const linha = (extra: Partial<ResultadoLido> = {}): ResultadoLido => ({
    pessoa_id: PESSOA, valor_hora: 7.1235, total_bruto: 1371.71,
    totais: {
      base_mes: 1166.67, divisor_duodecimos: 12.5, total_codigos_automaticos: 31.18, total_regras: 48,
      desconto_faltas: 14.25, subsidio_alimentacao: 110.01, lancamentos_pontuais: 30.1,
    },
    linhas: [
      { origem: "codigo", valor: 31.18, codigo_id: "c1", codigo: "100", nome: "Hora extra", origem_automatica: "horas_extra", horas: 3.5 },
      { origem: "regra", valor: 48, tipo: "km", faixa: null, quantidade: 120 },
      { origem: "regra", valor: 9, tipo: "desconhecido", faixa: null, quantidade: null },
      { origem: "lancamento", valor: 30.1, descricao: "Premio" },
    ],
    avisos: ["sem_regra_salarial", "aviso_que_nao_conhecemos"],
    retribuicao_id: RETRIB_ACTUAL, cargo_periodo_id: null, regra_salarial_id: REGRA,
    fechado_em: "2026-11-01T10:00:00Z", fechado_por_nome: "Rita",
    ...extra,
  });

  it("devolve o resultado tal como ficou gravado (nada se recalcula)", () => {
    const r = resultadoDeLinhaGravada(linha());
    expect(r).toMatchObject({
      valorHoraReal: 7.1235, baseMes: 1166.67, divisorDuodecimos: 12.5, totalCodigosAutomaticos: 31.18,
      totalRegras: 48, descontoFaltas: 14.25, subsidioAlimentacao: 110.01, lancamentosPontuais: 30.1, totalBrutoEstimado: 1371.71,
    });
    expect(r.linhasAutomaticas).toEqual([{ codigoId: "c1", codigo: "100", nome: "Hora extra", origem: "horas_extra", horas: 3.5, valor: 31.18 }]);
    expect(r.linhasRegra).toEqual([{ tipo: "km", faixa: null, quantidade: 120, valor: 48 }]);
    expect(r.avisos).toEqual(["sem_regra_salarial"]);
  });

  it("totais por calcular continuam null e os que sao somas passam a 0 quando faltam", () => {
    const r = resultadoDeLinhaGravada(linha({ valor_hora: null, total_bruto: null, totais: { base_mes: null }, linhas: null, avisos: null }));
    expect(r.valorHoraReal).toBeNull();
    expect(r.totalBrutoEstimado).toBeNull();
    expect(r.baseMes).toBeNull();
    expect(r.totalRegras).toBe(0);
    expect(r.linhasAutomaticas).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("numeric que chega como texto da base volta a numero", () => {
    const r = resultadoDeLinhaGravada(linha({ total_bruto: "1371.71" as never, valor_hora: "7.1235" as never }));
    expect(r.totalBrutoEstimado).toBe(1371.71);
    expect(r.valorHoraReal).toBe(7.1235);
  });
});
