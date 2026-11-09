/**
 * Fechar um periodo da folha GRAVA o resultado de cada pessoa (`hr_processamento_resultados`, migration
 * 20270109900000), e um periodo fechado le o que ficou gravado, sem recalcular. Aqui vive a parte pura: construir o
 * `p_resultados` que a RPC `rpc_hr_processamento_periodo_fechar(p_periodo_id, p_resultados)` exige, decidir se o botao
 * de fechar pode avancar, e voltar a montar um resultado a partir da linha gravada. Sem React e sem base.
 *
 * O CALCULO CONTINUA NO CLIENTE (risco aceite na migration): a RPC valida a estrutura, os lancamentos pontuais e as
 * versoes (regra salarial e retribuicao em vigor no ultimo dia), nao recalcula os valores. Por isso o botao de fechar
 * so avanca com TUDO lido: direitos, retribuicoes, regras salariais, vinculos e o calculo de cada pessoa obrigatoria.
 */
import { rhExemploProcessamentoRealTranslations } from "@/translations/rhExemploProcessamentoReal";
import type { RetribuicaoVigenteLinha } from "@/hooks/useRetribuicoesVigentesDaOrganizacao";
import type { VinculoLido } from "@/lib/hr/vinculosDoMes";
import type {
  AvisoProcessamento,
  LinhaCodigoAplicado,
  LinhaRegraSalarial,
  ResultadoProcessamentoPessoa,
} from "@/lib/hr/processamentoTotais";
import type { HrProcessamentoLancamento } from "@/types/hr";

/** Limites que a RPC impoe (migration 20270109900000). */
export const MAX_LINHAS_POR_PESSOA = 500;
export const MAX_AVISOS_POR_PESSOA = 20;
/** A descricao de cada linha de lancamento gravada: o resultado fica para sempre, por isso nao cresce sem limite. */
export const MAX_DESCRICAO_LANCAMENTO = 200;
/** A leitura devolve no maximo 500 linhas por chamada (keyset por pessoa_id). */
export const TAMANHO_PAGINA_RESULTADOS = 500;
const PADRAO_AVISO = /^[a-z_]{1,60}$/;

const AVISOS_CONHECIDOS: ReadonlySet<string> = new Set<AvisoProcessamento>([
  "sem_retribuicao",
  "periodicidade_nao_convertivel",
  "duodecimos_por_decidir",
  "sem_regra_salarial",
  "sem_horas_planeadas_no_mes",
  "faltas_provisorias",
  "dias_sem_picagem_descontados",
]);

export interface TotaisGravados {
  base_mes: number | null;
  divisor_duodecimos: number | null;
  total_codigos_automaticos: number | null;
  total_regras: number | null;
  desconto_faltas: number | null;
  subsidio_alimentacao: number | null;
  lancamentos_pontuais: number | null;
}

export type OrigemLinhaGravada = "codigo" | "regra" | "lancamento";

export interface LinhaGravada {
  origem: OrigemLinhaGravada;
  valor: number;
  [campo: string]: unknown;
}

/** Um objecto de `p_resultados`: EXACTAMENTE estes campos (a RPC recusa um a mais ou a menos). */
export interface ResultadoParaGravar {
  pessoa_id: string;
  valor_hora: number | null;
  total_bruto: number | null;
  totais: TotaisGravados;
  linhas: LinhaGravada[];
  avisos: string[];
  retribuicao_id: string | null;
  cargo_periodo_id: string | null;
  regra_salarial_id: string | null;
  /**
   * A assinatura dos desvios da pessoa neste periodo (`rpc_hr_desvios_assinaturas`), lida imediatamente antes de calcular. A base
   * recusa o fecho se houve decisoes nos desvios depois (`processamento_fechar_desvios_desactualizados`). `null` = sem desvios.
   */
  desvios_assinatura: string | null;
}

/** Uma linha de `rpc_hr_processamento_resultados_ler`. */
export interface ResultadoLido {
  pessoa_id: string;
  valor_hora: number | null;
  total_bruto: number | null;
  totais: Partial<TotaisGravados> | null;
  linhas: LinhaGravada[] | null;
  avisos: string[] | null;
  retribuicao_id: string | null;
  cargo_periodo_id: string | null;
  regra_salarial_id: string | null;
  fechado_em: string;
  fechado_por_nome: string | null;
}

export function arredondar(valor: number, casas: number): number {
  const factor = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

function arredondarOuNull(valor: unknown, casas: number): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? arredondar(valor, casas) : null;
}

/** Os avisos que a base aceita: so codigos `^[a-z_]{1,60}$`, sem repetidos, no maximo 20. */
export function avisosParaGravar(avisos: readonly string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const aviso of avisos) {
    if (typeof aviso !== "string" || !PADRAO_AVISO.test(aviso) || vistos.has(aviso)) continue;
    vistos.add(aviso);
    saida.push(aviso);
    if (saida.length >= MAX_AVISOS_POR_PESSOA) break;
  }
  return saida;
}

/** So os lancamentos MANUAIS nao anulados (km e ajudas tem linha propria, na regra) -- a mesma conta que a RPC confere. */
export function somaLancamentosManuais(lancamentos: readonly HrProcessamentoLancamento[]): number {
  const soma = lancamentos.reduce(
    (acumulado, l) => (l.anulado_em === null && (l.tipo ?? "manual") === "manual" ? acumulado + l.valor : acumulado),
    0,
  );
  return arredondar(soma, 2);
}

/** A versao de retribuicao em vigor no dia (`valido_de <= dia < valido_ate`); sem fallback para «a mais recente». */
export function retribuicaoEmVigorNoDia(versoes: readonly RetribuicaoVigenteLinha[], dia: string): RetribuicaoVigenteLinha | null {
  return versoes.find((v) => v.valido_de <= dia && (v.valido_ate === null || v.valido_ate > dia)) ?? null;
}

function linhasParaGravar(
  resultado: ResultadoProcessamentoPessoa,
  lancamentos: readonly HrProcessamentoLancamento[],
): LinhaGravada[] {
  const codigos: LinhaGravada[] = resultado.linhasAutomaticas.map((l) => ({
    origem: "codigo",
    valor: arredondar(l.valor, 2),
    codigo_id: l.codigoId,
    codigo: l.codigo,
    nome: l.nome,
    origem_automatica: l.origem,
    horas: l.horas,
  }));
  const regras: LinhaGravada[] = resultado.linhasRegra.map((l) => ({
    origem: "regra",
    valor: arredondar(l.valor, 2),
    tipo: l.tipo,
    faixa: l.faixa,
    quantidade: l.quantidade,
  }));
  // Os lancamentos manuais entram por ultimo: se a conta passar do limite, cortam-se estes (o total ja vai em
  // `totais.lancamentos_pontuais`), nunca os codigos nem a regra.
  const pontuais: LinhaGravada[] = lancamentos
    .filter((l) => l.anulado_em === null && (l.tipo ?? "manual") === "manual")
    .map((l) => ({
      origem: "lancamento",
      valor: arredondar(l.valor, 2),
      lancamento_id: l.id,
      // So o texto se corta; o valor e o total (em `totais.lancamentos_pontuais`) nunca.
      descricao: typeof l.descricao === "string" ? l.descricao.slice(0, MAX_DESCRICAO_LANCAMENTO) : l.descricao,
    }));
  return [...codigos, ...regras, ...pontuais].slice(0, MAX_LINHAS_POR_PESSOA);
}

export interface EntradaResultadoPessoa {
  pessoaId: string;
  resultado: ResultadoProcessamentoPessoa;
  /** Todas as versoes de retribuicao que tocam o periodo. */
  versoes: readonly RetribuicaoVigenteLinha[];
  lancamentos: readonly HrProcessamentoLancamento[];
  /** O ultimo dia do periodo (`data_fim`). */
  dataFim: string;
  /** A regra salarial em vigor em `dataFim`, ou `null` se nao ha. */
  regraSalarialId: string | null;
  cargoPeriodoId?: string | null;
  /** A assinatura dos desvios da pessoa (ver `ResultadoParaGravar.desvios_assinatura`); sem ela, `null`. */
  desviosAssinatura?: string | null;
}

export function construirResultadoPessoa(entrada: EntradaResultadoPessoa): ResultadoParaGravar {
  const { resultado } = entrada;
  return {
    pessoa_id: entrada.pessoaId,
    valor_hora: arredondarOuNull(resultado.valorHoraReal, 4),
    total_bruto: arredondarOuNull(resultado.totalBrutoEstimado, 2),
    totais: {
      base_mes: arredondarOuNull(resultado.baseMes, 2),
      divisor_duodecimos: arredondarOuNull(resultado.divisorDuodecimos, 4),
      total_codigos_automaticos: arredondarOuNull(resultado.totalCodigosAutomaticos, 2),
      total_regras: arredondarOuNull(resultado.totalRegras, 2),
      desconto_faltas: arredondarOuNull(resultado.descontoFaltas, 2),
      subsidio_alimentacao: arredondarOuNull(resultado.subsidioAlimentacao, 2),
      lancamentos_pontuais: somaLancamentosManuais(entrada.lancamentos),
    },
    linhas: linhasParaGravar(resultado, entrada.lancamentos),
    avisos: avisosParaGravar(resultado.avisos),
    // Pessoa que saiu a meio do periodo: a versao usada no calculo pode ja nao ser a vigente em `data_fim` (ou nao
    // haver nenhuma). Nesse caso envia-se `null` de proposito: a RPC recusa um fallback para «a mais recente» e uma
    // versao que nao estava em vigor no ultimo dia nao pode ser registada como a que foi usada.
    retribuicao_id: retribuicaoEmVigorNoDia(entrada.versoes, entrada.dataFim)?.id ?? null,
    cargo_periodo_id: entrada.cargoPeriodoId ?? null,
    regra_salarial_id: entrada.regraSalarialId,
    desvios_assinatura: entrada.desviosAssinatura ? entrada.desviosAssinatura : null,
  };
}

export interface ArgsResultadosDoFecho {
  /** As pessoas obrigatorias (activas com vinculo sobreposto ao periodo). */
  pessoasObrigatorias: readonly string[];
  resultadoDe: (pessoaId: string) => ResultadoProcessamentoPessoa | undefined;
  versoesDe: (pessoaId: string) => readonly RetribuicaoVigenteLinha[];
  lancamentosDe: (pessoaId: string) => readonly HrProcessamentoLancamento[];
  dataFim: string;
  regraSalarialId: string | null;
  /** A assinatura dos desvios de cada pessoa, lida imediatamente antes de calcular; sem ela (sem desvios), `null`. */
  assinaturaDeDesviosDe?: (pessoaId: string) => string | null | undefined;
}

/** O `p_resultados` completo, ou as pessoas que ainda nao tem calculo (e entao nao se fecha). */
export function construirResultadosDoFecho(args: ArgsResultadosDoFecho): {
  resultados: ResultadoParaGravar[];
  semCalculo: string[];
} {
  const resultados: ResultadoParaGravar[] = [];
  const semCalculo: string[] = [];
  for (const pessoaId of args.pessoasObrigatorias) {
    const resultado = args.resultadoDe(pessoaId);
    if (!resultado) {
      semCalculo.push(pessoaId);
      continue;
    }
    resultados.push(
      construirResultadoPessoa({
        pessoaId,
        resultado,
        versoes: args.versoesDe(pessoaId),
        lancamentos: args.lancamentosDe(pessoaId),
        dataFim: args.dataFim,
        regraSalarialId: args.regraSalarialId,
        desviosAssinatura: args.assinaturaDeDesviosDe?.(pessoaId) ?? null,
      }),
    );
  }
  return { resultados, semCalculo };
}

/** Um vinculo sobrepoe o periodo: comeca ate ao ultimo dia e nao acabou antes do primeiro (`data_fim` e inclusivo). */
export function vinculoSobrepoePeriodo(vinculos: readonly VinculoLido[] | undefined, de: string, ate: string): boolean {
  return (vinculos ?? []).some((v) => v.dataInicio <= ate && (v.dataFim === null || v.dataFim >= de));
}

/** As pessoas obrigatorias do fecho: activas, com vinculo sobreposto ao periodo (as outras a RPC recusa). */
export function pessoasObrigatoriasDoFecho(
  pessoasActivas: readonly string[],
  vinculos: ReadonlyMap<string, readonly VinculoLido[]>,
  de: string,
  ate: string,
): string[] {
  return pessoasActivas.filter((id) => vinculoSobrepoePeriodo(vinculos.get(id), de, ate));
}

export type EstadoLeitura = "ok" | "a_carregar" | "recusado" | "erro" | "indisponivel";

export interface ArgsBloqueioDoFecho {
  direitosLidos: boolean;
  /** As retribuicoes de toda a organizacao: so `ok` (lidas por inteiro, sem erro nem a carregar) deixa fechar. */
  retribuicoes: EstadoLeitura;
  /** O catalogo de codigos de processamento: so `ok` deixa fechar (sem ele faltam linhas e totais). */
  codigos: EstadoLeitura;
  /** Estado da leitura das regras salariais; `indisponivel` = a base ainda nao as tem (sem regra, sem versao a conferir). */
  regras: EstadoLeitura;
  vinculos: EstadoLeitura;
  pessoasObrigatorias: readonly string[];
  /** A pessoa tem calculo. */
  comCalculo: (pessoaId: string) => boolean;
  /** A assiduidade da pessoa foi lida so em parte (recusada, com erro ou truncada): o calculo dela estaria errado. */
  assiduidadeIncompleta: (pessoaId: string) => boolean;
  /**
   * A margem de tempo ou os desvios da pessoa NAO se leram (erro ou recusa): sem eles o calculo estaria errado e o fecho nunca
   * calcula em silencio. Opcional: sem esta leitura (ecras antigos) nao se bloqueia.
   */
  desviosNaoLidos?: (pessoaId: string) => boolean;
}

export type MotivoBloqueioDoFecho =
  | { codigo: "direitos" | "retribuicoes" | "codigos" | "regras" | "vinculos" }
  | { codigo: "assiduidade" | "desvios" | "calculo"; n: number };

/** Porque o botao «Fechar periodo» nao pode avancar; `null` = pode. A chave de traducao e `rhProcReal.fecho.bloqueio.<codigo>`. */
export function motivoDeBloqueioDoFecho(args: ArgsBloqueioDoFecho): MotivoBloqueioDoFecho | null {
  if (!args.direitosLidos) return { codigo: "direitos" };
  // O fecho grava para sempre: nada de fechar com leituras falhadas, incompletas ou ainda a carregar.
  if (args.retribuicoes !== "ok") return { codigo: "retribuicoes" };
  if (args.codigos !== "ok") return { codigo: "codigos" };
  if (args.regras === "recusado" || args.regras === "erro" || args.regras === "a_carregar") return { codigo: "regras" };
  if (args.vinculos !== "ok") return { codigo: "vinculos" };
  const incompletas = args.pessoasObrigatorias.filter((id) => args.assiduidadeIncompleta(id)).length;
  if (incompletas > 0) return { codigo: "assiduidade", n: incompletas };
  const semDesvios = args.desviosNaoLidos ? args.pessoasObrigatorias.filter((id) => args.desviosNaoLidos?.(id)).length : 0;
  if (semDesvios > 0) return { codigo: "desvios", n: semDesvios };
  const n = args.pessoasObrigatorias.filter((id) => !args.comCalculo(id)).length;
  if (n > 0) return { codigo: "calculo", n };
  return null;
}

const ERROS_DO_FECHO: ReadonlySet<string> = new Set([
  "processamento_fechar_resultado_em_falta",
  "processamento_fechar_pessoa_fora_do_periodo",
  "processamento_fechar_pessoa_repetida",
  "processamento_fechar_versao_invalida",
  "processamento_fechar_regra_desactualizada",
  "processamento_fechar_lancamentos_desactualizados",
  "processamento_fechar_resultado_mal_formado",
  "processamento_resultados_periodo_aberto",
  // Desvios de tempo (margem): ha dias por validar no periodo, ou houve decisoes depois do calculo.
  "processamento_fechar_desvios_por_validar",
  "processamento_fechar_desvios_desactualizados",
]);

/** O codigo do erro da RPC (prefixo da mensagem), se for um dos que o fecho conhece. */
export function codigoDoErroDoFecho(erro: unknown): string | null {
  const mensagem =
    typeof erro === "string" ? erro : erro && typeof erro === "object" ? (erro as { message?: unknown }).message : null;
  if (typeof mensagem !== "string") return null;
  const encontrado = /processamento_(?:fechar|resultados)_[a-z_]+/.exec(mensagem)?.[0];
  return encontrado && ERROS_DO_FECHO.has(encontrado) ? encontrado : null;
}

/** A lingua escolhida, lida fora do React como em `friendlyError` (mesma chave); sem escolha, portugues. */
function textoDoErro(chave: string): string {
  let lingua = "pt";
  try {
    if (typeof localStorage !== "undefined") lingua = localStorage.getItem("language") ?? "pt";
  } catch {
    // sem storage: portugues
  }
  const { pt, en } = rhExemploProcessamentoRealTranslations;
  return (lingua === "pt" ? pt[chave] : en[chave] ?? pt[chave]) ?? chave;
}

/** O erro em portugues claro (ou na lingua activa); `null` se nao for um erro do fecho. O periodo fica aberto. */
export function mensagemDeErroDoFecho(erro: unknown): string | null {
  const codigo = codigoDoErroDoFecho(erro);
  return codigo ? textoDoErro(`rhProcReal.erro.${codigo}`) : null;
}

/** A operacao (abrir/fechar) JA correu na base, mas o periodo nao se conseguiu reler: nao e um sucesso nem uma falha da operacao. */
export function mensagemDeOperacaoSemRelida(): string {
  return textoDoErro("rhProcReal.erro.operacaoSemRelida");
}

const numeroOuNull =(v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const TIPOS_REGRA: ReadonlySet<string> = new Set(["noturnas", "iht", "km", "ajudas"]);

/** Volta a montar o resultado de uma pessoa a partir da linha gravada (nada se recalcula). */
export function resultadoDeLinhaGravada(linha: ResultadoLido): ResultadoProcessamentoPessoa {
  const totais = linha.totais ?? {};
  const linhas = Array.isArray(linha.linhas) ? linha.linhas : [];
  const linhasAutomaticas: LinhaCodigoAplicado[] = linhas
    .filter((l) => l.origem === "codigo")
    .map((l) => ({
      codigoId: texto(l.codigo_id),
      codigo: texto(l.codigo),
      nome: texto(l.nome),
      origem: (typeof l.origem_automatica === "string" ? l.origem_automatica : null) as LinhaCodigoAplicado["origem"],
      horas: numeroOuNull(l.horas),
      valor: numeroOuNull(l.valor) ?? 0,
    }));
  const linhasRegra: LinhaRegraSalarial[] = linhas
    .filter((l) => l.origem === "regra" && TIPOS_REGRA.has(texto(l.tipo)))
    .map((l) => ({
      tipo: texto(l.tipo) as LinhaRegraSalarial["tipo"],
      faixa: numeroOuNull(l.faixa),
      quantidade: numeroOuNull(l.quantidade),
      valor: numeroOuNull(l.valor) ?? 0,
    }));
  return {
    valorHoraReal: numeroOuNull(linha.valor_hora),
    baseMes: numeroOuNull(totais.base_mes),
    divisorDuodecimos: numeroOuNull(totais.divisor_duodecimos),
    linhasAutomaticas,
    totalCodigosAutomaticos: numeroOuNull(totais.total_codigos_automaticos) ?? 0,
    linhasRegra,
    totalRegras: numeroOuNull(totais.total_regras) ?? 0,
    descontoFaltas: numeroOuNull(totais.desconto_faltas) ?? 0,
    subsidioAlimentacao: numeroOuNull(totais.subsidio_alimentacao) ?? 0,
    lancamentosPontuais: numeroOuNull(totais.lancamentos_pontuais) ?? 0,
    totalBrutoEstimado: numeroOuNull(linha.total_bruto),
    avisos: (Array.isArray(linha.avisos) ? linha.avisos : []).filter((a): a is AvisoProcessamento => AVISOS_CONHECIDOS.has(a)),
  };
}
