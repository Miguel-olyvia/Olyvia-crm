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
import { eAvisoSubsidio, type AvisoSubsidio } from "@/lib/hr/subsidiosExtra";
import type { HrProcessamentoLancamento } from "@/types/hr";

/** Limites que a RPC impoe (migration 20270109900000). */
export const MAX_LINHAS_POR_PESSOA = 500;
export const MAX_AVISOS_POR_PESSOA = 20;
/** A descricao de cada linha de lancamento gravada: o resultado fica para sempre, por isso nao cresce sem limite. */
export const MAX_DESCRICAO_LANCAMENTO = 200;
/** A leitura devolve no maximo 500 linhas por chamada (keyset por pessoa_id). */
export const TAMANHO_PAGINA_RESULTADOS = 500;
const PADRAO_AVISO = /^[a-z_]{1,60}$/;

const AVISOS_CONHECIDOS: ReadonlySet<string> = new Set<AvisoProcessamento | AvisoSubsidio>([
  "sem_retribuicao",
  "periodicidade_nao_convertivel",
  "duodecimos_por_decidir",
  "sem_regra_salarial",
  "sem_horas_planeadas_no_mes",
  "faltas_provisorias",
  "dias_sem_picagem_descontados",
  // Os avisos dos subsidios de ferias e de Natal (`avisosSubsidios` no resultado, nao em `avisos`).
  "subsidio_sem_duodecimos",
  "subsidio_sem_vinculo",
  "subsidio_cessacao_por_tratar",
  "subsidio_contratos_com_intervalo",
]);

export interface TotaisGravados {
  base_mes: number | null;
  divisor_duodecimos: number | null;
  total_codigos_automaticos: number | null;
  total_regras: number | null;
  desconto_faltas: number | null;
  subsidio_alimentacao: number | null;
  /** Subsidio de ferias e de Natal pagos neste periodo; 0 quando nao se pagam (migration 20270112700000). */
  subsidio_ferias: number | null;
  subsidio_natal: number | null;
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
   * Horas planeadas e realizadas do periodo, em minutos INTEIROS >= 0 (de `totais.planeadoMinutos` / `realizadoMinutos` do calculo).
   * A base recusa o fecho se faltarem ou forem invalidos (`processamento_fechar_resultado_mal_formado`) e o ecra Custos le-os do
   * gravado num mes fechado. Nunca um 0 inventado: sem minutos validos a pessoa nem chega a ser construida.
   */
  planeado_minutos: number;
  realizado_minutos: number;
  /**
   * A assinatura dos desvios da pessoa neste periodo (`rpc_hr_desvios_assinaturas`), lida imediatamente antes de calcular. A base
   * recusa o fecho se houve decisoes nos desvios depois (`processamento_fechar_desvios_desactualizados`). `null` = sem desvios.
   */
  desvios_assinatura: string | null;
  /**
   * A assinatura das horas extra da pessoa neste periodo (`rpc_hr_horas_extra_assinaturas`), lida imediatamente antes de calcular. Com a
   * contagem de horas extra aprovadas ligada, a base recusa o fecho se mudaram depois (`processamento_fechar_horas_extra_desactualizadas`).
   * OPCIONAL: so segue quando a pessoa tem horas extra (sem assinatura nao se envia o campo; a base aceita-o ausente ou `null`).
   */
  horas_extra_assinatura?: string;
  /**
   * A assinatura da configuracao dos subsidios de ferias e de Natal COM QUE O CALCULO FOI FEITO (`rpc_hr_subsidios_assinatura`, lida ao
   * mesmo tempo que os dados do calculo, nunca no momento de fechar). Com o pagamento ligado para a folha a base exige-a em cada
   * resultado e recusa o fecho se a configuracao mudou depois (HRA90). OPCIONAL: com o pagamento desligado a chave NAO segue (a base
   * recusa um valor nao nulo nessa folha).
   */
  subsidios_assinatura?: string;
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
  /**
   * Colunas acrescentadas ao fecho (migration 20270112000000). Opcionais: uma resposta de uma base sem a migration nao as traz, e
   * entao os Custos dizem «Sem valores gravados» em vez de inventar horas.
   */
  planeado_minutos?: number | null;
  realizado_minutos?: number | null;
  pessoa_nome?: string | null;
}

export function arredondar(valor: number, casas: number): number {
  const factor = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

function arredondarOuNull(valor: unknown, casas: number): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? arredondar(valor, casas) : null;
}

/** Minutos que a base aceita: inteiro finito >= 0 (o limite fino por periodo e da base). */
export function minutosValidos(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
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
    // Campos livres das linhas de horas extra: de onde vieram os minutos (bruto, aprovadas ou misto) e quantos foram pagos.
    ...(l.fonteHorasExtra && l.fonteHorasExtra !== "bruto" ? { fonte_horas_extra: l.fonteHorasExtra, minutos: l.minutos ?? null } : {}),
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
  /** Minutos planeados e realizados do periodo (do calculo); `construirResultadoPessoa` recusa valores nao finitos ou negativos. */
  planeadoMinutos: number;
  realizadoMinutos: number;
  cargoPeriodoId?: string | null;
  /** A assinatura dos desvios da pessoa (ver `ResultadoParaGravar.desvios_assinatura`); sem ela, `null`. */
  desviosAssinatura?: string | null;
  /** A assinatura das horas extra da pessoa (ver `ResultadoParaGravar.horas_extra_assinatura`); sem ela, o campo nao segue. */
  horasExtraAssinatura?: string | null;
  /** A assinatura dos subsidios com que o calculo foi feito (ver `ResultadoParaGravar.subsidios_assinatura`); sem ela, o campo nao segue. */
  subsidiosAssinatura?: string | null;
}

export function construirResultadoPessoa(entrada: EntradaResultadoPessoa): ResultadoParaGravar {
  const { resultado } = entrada;
  if (!minutosValidos(entrada.planeadoMinutos) || !minutosValidos(entrada.realizadoMinutos)) {
    // Quem chama (construirResultadosDoFecho) ja bloqueia a pessoa antes; chegar aqui e um erro de programacao, nunca um 0 a enviar.
    throw new Error("Minutos planeados e realizados invalidos: o fecho nao envia horas inventadas");
  }
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
      // 0 quando nao se paga (ou o resultado nao os traz): o contrato da base leva sempre as duas chaves.
      subsidio_ferias: arredondarOuNull(resultado.subsidioFerias ?? 0, 2) ?? 0,
      subsidio_natal: arredondarOuNull(resultado.subsidioNatal ?? 0, 2) ?? 0,
      lancamentos_pontuais: somaLancamentosManuais(entrada.lancamentos),
    },
    linhas: linhasParaGravar(resultado, entrada.lancamentos),
    avisos: avisosParaGravar([...resultado.avisos, ...(resultado.avisosSubsidios ?? [])]),
    // Pessoa que saiu a meio do periodo: a versao usada no calculo pode ja nao ser a vigente em `data_fim` (ou nao
    // haver nenhuma). Nesse caso envia-se `null` de proposito: a RPC recusa um fallback para «a mais recente» e uma
    // versao que nao estava em vigor no ultimo dia nao pode ser registada como a que foi usada.
    retribuicao_id: retribuicaoEmVigorNoDia(entrada.versoes, entrada.dataFim)?.id ?? null,
    cargo_periodo_id: entrada.cargoPeriodoId ?? null,
    regra_salarial_id: entrada.regraSalarialId,
    planeado_minutos: Math.round(entrada.planeadoMinutos),
    realizado_minutos: Math.round(entrada.realizadoMinutos),
    desvios_assinatura: entrada.desviosAssinatura ? entrada.desviosAssinatura : null,
    ...(entrada.horasExtraAssinatura ? { horas_extra_assinatura: entrada.horasExtraAssinatura } : {}),
    ...(entrada.subsidiosAssinatura ? { subsidios_assinatura: entrada.subsidiosAssinatura } : {}),
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
  /**
   * Os minutos planeados e realizados de cada pessoa (do calculo). Sem esta funcao, ou sem minutos validos para a pessoa, ela fica em
   * `semCalculo` e o fecho nao se tenta: a base recusaria o fecho e nunca se envia um 0 inventado.
   */
  minutosDe?: (pessoaId: string) => { planeado: number; realizado: number } | undefined;
  /** A assinatura dos desvios de cada pessoa, lida imediatamente antes de calcular; sem ela (sem desvios), `null`. */
  assinaturaDeDesviosDe?: (pessoaId: string) => string | null | undefined;
  /** A assinatura das horas extra de cada pessoa, lida imediatamente antes de calcular; sem ela (sem horas extra), o campo nao segue. */
  assinaturaDeHorasExtraDe?: (pessoaId: string) => string | null | undefined;
  /**
   * A assinatura da configuracao dos subsidios com que o calculo foi feito (a mesma em todas as pessoas: e do periodo). `null`/ausente =
   * pagamento desligado para a folha: nenhum resultado a leva.
   */
  assinaturaDeSubsidios?: string | null;
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
    const minutos = args.minutosDe?.(pessoaId);
    if (!resultado || !minutos || !minutosValidos(minutos.planeado) || !minutosValidos(minutos.realizado)) {
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
        planeadoMinutos: minutos.planeado,
        realizadoMinutos: minutos.realizado,
        desviosAssinatura: args.assinaturaDeDesviosDe?.(pessoaId) ?? null,
        horasExtraAssinatura: args.assinaturaDeHorasExtraDe?.(pessoaId) ?? null,
        subsidiosAssinatura: args.assinaturaDeSubsidios ?? null,
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
  /**
   * A configuracao dos subsidios de ferias e de Natal: so `ok` deixa fechar; recusada, com erro ou a carregar bloqueia (fechar sem ela
   * gravaria para sempre um periodo sem o subsidio). `indisponivel` (a base ainda nao a tem) conta como desligada. Opcional: sem esta
   * leitura (ecras antigos) nao se bloqueia.
   */
  subsidios?: EstadoLeitura;
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
  /**
   * As horas extra da pessoa NAO se leram por erro tecnico ou resposta invalida (uma recusa de permissao NAO conta: a base decide no fecho): sem elas o calculo estaria errado. Opcional: sem esta leitura (ecras
   * antigos) nao se bloqueia.
   */
  horasExtraNaoLidas?: (pessoaId: string) => boolean;
  /** Horas extra pendentes da pessoa em dias de modo aprovadas (0 = nenhuma): cada uma tem de ser confirmada ou rejeitada antes de fechar. */
  horasExtraPendentes?: (pessoaId: string) => number;
}

export type MotivoBloqueioDoFecho =
  | { codigo: "direitos" | "retribuicoes" | "codigos" | "regras" | "subsidios" | "vinculos" }
  | { codigo: "assiduidade" | "desvios" | "horas_extra" | "calculo"; n: number };

/** Porque o botao «Fechar periodo» nao pode avancar; `null` = pode. A chave de traducao e `rhProcReal.fecho.bloqueio.<codigo>`. */
export function motivoDeBloqueioDoFecho(args: ArgsBloqueioDoFecho): MotivoBloqueioDoFecho | null {
  if (!args.direitosLidos) return { codigo: "direitos" };
  // O fecho grava para sempre: nada de fechar com leituras falhadas, incompletas ou ainda a carregar.
  if (args.retribuicoes !== "ok") return { codigo: "retribuicoes" };
  if (args.codigos !== "ok") return { codigo: "codigos" };
  if (args.regras === "recusado" || args.regras === "erro" || args.regras === "a_carregar") return { codigo: "regras" };
  if (args.subsidios === "recusado" || args.subsidios === "erro" || args.subsidios === "a_carregar") return { codigo: "subsidios" };
  if (args.vinculos !== "ok") return { codigo: "vinculos" };
  const incompletas = args.pessoasObrigatorias.filter((id) => args.assiduidadeIncompleta(id)).length;
  if (incompletas > 0) return { codigo: "assiduidade", n: incompletas };
  const semDesvios = args.desviosNaoLidos ? args.pessoasObrigatorias.filter((id) => args.desviosNaoLidos?.(id)).length : 0;
  if (semDesvios > 0) return { codigo: "desvios", n: semDesvios };
  // Horas extra: por ler (erro ou recusa) ou ainda por decidir (pendentes): a mesma porta, uma frase com o numero de pessoas.
  const comHorasExtraPorResolver = args.pessoasObrigatorias.filter(
    (id) => args.horasExtraNaoLidas?.(id) === true || (args.horasExtraPendentes?.(id) ?? 0) > 0,
  ).length;
  if (comHorasExtraPorResolver > 0) return { codigo: "horas_extra", n: comHorasExtraPorResolver };
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
  // Horas extra aprovadas (contagem ligada): ha horas extra pendentes no periodo, ou mudaram depois do calculo.
  "processamento_fechar_horas_extra_por_decidir",
  "processamento_fechar_horas_extra_desactualizadas",
  // Subsidios de ferias e de Natal: a configuracao mudou depois do calculo (HRA90).
  "processamento_fechar_subsidios_desactualizados",
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

function mensagemDoErro(erro: unknown): string {
  const mensagem = typeof erro === "string" ? erro : erro && typeof erro === "object" ? (erro as { message?: unknown }).message : null;
  return typeof mensagem === "string" ? mensagem : "";
}

/** O erro em portugues claro (ou na lingua activa); `null` se nao for um erro do fecho. O periodo fica aberto. */
export function mensagemDeErroDoFecho(erro: unknown): string | null {
  const codigo = codigoDoErroDoFecho(erro);
  if (!codigo) return null;
  // Os totais dos subsidios fora do mes (22023) partilham o codigo do resultado mal formado: distinguem-se pelo texto da base.
  if (codigo === "processamento_fechar_resultado_mal_formado" && /subsidio_(?:ferias|natal)/.test(mensagemDoErro(erro))) {
    return textoDoErro("rhProcReal.erro.processamento_fechar_subsidios_inconsistentes");
  }
  return textoDoErro(`rhProcReal.erro.${codigo}`);
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

/** As horas gravadas no fecho (minutos inteiros >= 0), ou `null` se a linha as nao tem ou sao invalidas (nunca 0 por omissao). */
export function minutosDeLinhaGravada(linha: ResultadoLido): { planeadoMinutos: number; realizadoMinutos: number } | null {
  const planeado = numeroOuNull(linha.planeado_minutos);
  const realizado = numeroOuNull(linha.realizado_minutos);
  if (planeado === null || realizado === null) return null;
  if (!Number.isInteger(planeado) || !Number.isInteger(realizado) || planeado < 0 || realizado < 0) return null;
  return { planeadoMinutos: planeado, realizadoMinutos: realizado };
}

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
      ...(l.fonte_horas_extra === "bruto" || l.fonte_horas_extra === "aprovadas" || l.fonte_horas_extra === "misto"
        ? { fonteHorasExtra: l.fonte_horas_extra, minutos: numeroOuNull(l.minutos) ?? 0 }
        : {}),
    }));
  const linhasRegra: LinhaRegraSalarial[] = linhas
    .filter((l) => l.origem === "regra" && TIPOS_REGRA.has(texto(l.tipo)))
    .map((l) => ({
      tipo: texto(l.tipo) as LinhaRegraSalarial["tipo"],
      faixa: numeroOuNull(l.faixa),
      quantidade: numeroOuNull(l.quantidade),
      valor: numeroOuNull(l.valor) ?? 0,
    }));
  const avisosGravados: readonly string[] = Array.isArray(linha.avisos) ? linha.avisos : [];
  const avisosDosSubsidios: AvisoSubsidio[] = avisosGravados.filter(eAvisoSubsidio);
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
    // Um gravado antigo nao traz estas chaves: 0.
    subsidioFerias: numeroOuNull(totais.subsidio_ferias) ?? 0,
    subsidioNatal: numeroOuNull(totais.subsidio_natal) ?? 0,
    lancamentosPontuais: numeroOuNull(totais.lancamentos_pontuais) ?? 0,
    totalBrutoEstimado: numeroOuNull(linha.total_bruto),
    avisos: avisosGravados.filter((a): a is AvisoProcessamento => AVISOS_CONHECIDOS.has(a) && !eAvisoSubsidio(a)),
    ...(avisosDosSubsidios.length > 0 ? { avisosSubsidios: avisosDosSubsidios } : {}),
  };
}
