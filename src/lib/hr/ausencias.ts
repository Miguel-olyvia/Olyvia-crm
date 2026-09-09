/**
 * A logica pura das ausencias: contar dias, ler o estado de um pedido, e
 * travar o ajuste que desce abaixo do minimo legal.
 *
 * PORQUE E QUE A CONTA DE DIAS EXISTE DUAS VEZES
 * ----------------------------------------------
 * Quem conta a serio e a base: `rpc_hr_ausencia_pedir` expande o intervalo e
 * GRAVA `dias_solicitados`. O que se conta aqui e so a PRE-VISUALIZACAO, para
 * a pessoa ver quantos dias vai gastar ANTES de submeter, e para a interface
 * nunca mandar a base um intervalo sem nenhum dia contavel (o erro
 * `ausencia_sem_dias_uteis`, que em SQL nao diz a ninguem o que fazer).
 *
 * Espelha o algoritmo da migration 20261121110000, linhas 523-570, passo a
 * passo: fim de semana e sabado/domingo ISO, feriado sai de `schedule_holidays`
 * com a variante recorrente por MM-DD, o dia excluido nao gera linha, e a
 * fraccao de meio dia aplica-se ao dia de INICIO e ao dia de FIM do pedido --
 * nao ao primeiro e ao ultimo dia CONTAVEL. Se um dia divergir, o numero
 * mostrado diverge do gravado e a divergencia e visivel: e por isso que o
 * ecra mostra sempre `dias_solicitados` depois de submetido, e este calculo
 * so antes.
 *
 * O MINIMO LEGAL E DIFERENTE
 * --------------------------
 * O bloqueio dos 20 dias uteis existe MESMO na base (`ferias_minimo_legal`,
 * migration 20261121120000), e so no ajuste de saldo -- nao no pedido. Por
 * isso aqui ele bloqueia o botao, enquanto o saldo negativo de um pedido so
 * avisa: prometer um bloqueio que a base nao faz e pior do que nao o ter.
 */
import type {
  AusenciaDecisao,
  AusenciaSaldo,
  AusenciaTipo,
  EstadoPedido,
  MotivoAjuste,
  PassoDecisao,
} from "@/types/hrAusencias";

/** Codigo do Trabalho: 22 dias uteis de direito, 20 de minimo irrenunciavel. */
export const MINIMO_LEGAL_DIAS = 20;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` -> Date ao meio-dia UTC. O meio-dia evita o salto de fuso. */
export function dataDeIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function isoDeData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function hojeIso(agora: Date = new Date()): string {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function somarDias(iso: string, dias: number): string {
  return isoDeData(new Date(dataDeIso(iso).getTime() + dias * MS_POR_DIA));
}

/** Sabado ou domingo, na contagem ISO que a base usa (`isodow IN (6,7)`). */
export function eFimDeSemana(iso: string): boolean {
  const diaDaSemana = dataDeIso(iso).getUTCDay();
  return diaDaSemana === 0 || diaDaSemana === 6;
}

export interface FeriadoOrg {
  holiday_date: string;
  is_recurring: boolean | null;
}

/**
 * Os feriados prontos a consultar: as datas fixas por `YYYY-MM-DD` e as
 * recorrentes por `MM-DD`, tal como o `to_char(..., 'MM-DD')` da base.
 */
export interface IndiceFeriados {
  fixos: ReadonlySet<string>;
  recorrentes: ReadonlySet<string>;
}

export function indexarFeriados(feriados: readonly FeriadoOrg[]): IndiceFeriados {
  const fixos = new Set<string>();
  const recorrentes = new Set<string>();
  for (const feriado of feriados) {
    if (!feriado.holiday_date) continue;
    const iso = feriado.holiday_date.slice(0, 10);
    if (feriado.is_recurring) recorrentes.add(iso.slice(5));
    else fixos.add(iso);
  }
  return { fixos, recorrentes };
}

export const SEM_FERIADOS: IndiceFeriados = { fixos: new Set(), recorrentes: new Set() };

export function eFeriado(iso: string, indice: IndiceFeriados): boolean {
  return indice.fixos.has(iso) || indice.recorrentes.has(iso.slice(5));
}

/** Um periodo de saldo, tal como vem de `pessoas_ausencias_direitos`. */
export interface PeriodoSaldo {
  periodo_inicio: string;
  periodo_fim: string;
}

/**
 * O periodo a que um dia imputa. Sem direito registado que o cubra, a base
 * cai no ANO CIVIL do dia (`date_trunc('year', v_dia)`) -- e nao recusa o
 * pedido, porque ha tipos que nao descontam saldo nenhum.
 */
export function periodoDoDia(iso: string, periodos: readonly PeriodoSaldo[]): string {
  const candidatos = periodos
    .filter((periodo) => iso >= periodo.periodo_inicio && iso <= periodo.periodo_fim)
    .sort((a, b) => b.periodo_inicio.localeCompare(a.periodo_inicio));
  return candidatos[0]?.periodo_inicio ?? `${iso.slice(0, 4)}-01-01`;
}

export interface DiaCalculado {
  data: string;
  fraccao: number;
  periodoInicio: string;
  eFimDeSemana: boolean;
  eFeriado: boolean;
}

export interface CalculoPedido {
  /** Dias civis do intervalo, incluindo os que nao contam. */
  diasCivis: number;
  /** Os dias que geram linha, ja com a fraccao de meio dia aplicada. */
  dias: DiaCalculado[];
  /** A soma das fraccoes -- o que a base vai gravar em `dias_solicitados`. */
  total: number;
  /** A reparticao por periodo de saldo. Mais de uma entrada = pedido a cavalo. */
  porPeriodo: Array<{ periodoInicio: string; dias: number }>;
}

export interface ArgumentosCalculo {
  dataInicio: string;
  dataFim: string;
  tipo: Pick<AusenciaTipo, "inclui_fim_de_semana" | "inclui_feriados">;
  feriados?: IndiceFeriados;
  meioDiaInicio?: boolean;
  meioDiaFim?: boolean;
  periodos?: readonly PeriodoSaldo[];
}

const CALCULO_VAZIO: CalculoPedido = { diasCivis: 0, dias: [], total: 0, porPeriodo: [] };

/** Limite de seguranca: um intervalo maior do que isto e um engano de dedo. */
const MAX_DIAS_CIVIS = 400;

export function calcularPedido(args: ArgumentosCalculo): CalculoPedido {
  const { dataInicio, dataFim, tipo } = args;
  if (!dataInicio || !dataFim || dataFim < dataInicio) return CALCULO_VAZIO;

  const feriados = args.feriados ?? SEM_FERIADOS;
  const periodos = args.periodos ?? [];
  const dias: DiaCalculado[] = [];
  let diasCivis = 0;
  let corrente = dataInicio;

  while (corrente <= dataFim && diasCivis < MAX_DIAS_CIVIS) {
    diasCivis += 1;
    const fimDeSemana = eFimDeSemana(corrente);
    const feriado = eFeriado(corrente, feriados);
    const excluido =
      (fimDeSemana && !tipo.inclui_fim_de_semana) || (feriado && !tipo.inclui_feriados);

    if (!excluido) {
      // A fraccao segue o dia de INICIO e o dia de FIM do pedido, como na base.
      let fraccao = 1;
      if (corrente === dataInicio && args.meioDiaInicio) fraccao = 0.5;
      if (corrente === dataFim && args.meioDiaFim) fraccao = 0.5;
      dias.push({
        data: corrente,
        fraccao,
        periodoInicio: periodoDoDia(corrente, periodos),
        eFimDeSemana: fimDeSemana,
        eFeriado: feriado,
      });
    }
    corrente = somarDias(corrente, 1);
  }

  const porPeriodoMapa = new Map<string, number>();
  for (const dia of dias) {
    porPeriodoMapa.set(dia.periodoInicio, (porPeriodoMapa.get(dia.periodoInicio) ?? 0) + dia.fraccao);
  }

  return {
    diasCivis,
    dias,
    total: arredondarDias(dias.reduce((soma, dia) => soma + dia.fraccao, 0)),
    porPeriodo: [...porPeriodoMapa.entries()]
      .map(([periodoInicio, valor]) => ({ periodoInicio, dias: arredondarDias(valor) }))
      .sort((a, b) => a.periodoInicio.localeCompare(b.periodoInicio)),
  };
}

/** `numeric(6,2)` na base: duas casas, e nunca `-0`. */
export function arredondarDias(valor: number): number {
  const arredondado = Math.round(valor * 100) / 100;
  return arredondado === 0 ? 0 : arredondado;
}

/**
 * A data mais proxima que o tipo aceita.
 *
 * Devolve-a para o selector desactivar tudo o que esta antes, em vez de deixar
 * a pessoa escolher e apanhar `ausencia_sem_antecedencia` depois de submeter.
 */
export function dataMinimaDoTipo(
  tipo: Pick<AusenciaTipo, "antecedencia_minima_dias">,
  hoje: string,
): string {
  const antecedencia = Number(tipo.antecedencia_minima_dias ?? 0);
  if (!Number.isFinite(antecedencia) || antecedencia <= 0) return hoje;
  return somarDias(hoje, antecedencia);
}

export interface ProblemaPedido {
  campo: "tipo" | "dataInicio" | "dataFim" | "motivo";
  mensagemKey: string;
}

/**
 * O que se valida ANTES de chamar a RPC.
 *
 * Nao se manda a base o que ela vai recusar: a mensagem de um CHECK nao diz a
 * ninguem qual o campo nem qual o limite -- e a mesma razao escrita em
 * `PessoaContratoTab`.
 */
export function problemasDoPedido(args: {
  tipo: AusenciaTipo | null;
  dataInicio: string;
  dataFim: string;
  meioDiaInicio: boolean;
  meioDiaFim: boolean;
  motivo: string;
  calculo: CalculoPedido;
  hoje: string;
}): ProblemaPedido[] {
  const problemas: ProblemaPedido[] = [];
  const { tipo } = args;

  if (!tipo) {
    problemas.push({ campo: "tipo", mensagemKey: "hr.ausencias.erro.semTipo" });
    return problemas;
  }
  if (!args.dataInicio) {
    problemas.push({ campo: "dataInicio", mensagemKey: "hr.ausencias.erro.semDataInicio" });
  }
  if (!args.dataFim) {
    problemas.push({ campo: "dataFim", mensagemKey: "hr.ausencias.erro.semDataFim" });
  }
  if (args.dataInicio && args.dataFim && args.dataFim < args.dataInicio) {
    problemas.push({ campo: "dataFim", mensagemKey: "hr.ausencias.erro.fimAntesDoInicio" });
  }
  if ((args.meioDiaInicio || args.meioDiaFim) && !tipo.permite_meio_dia) {
    problemas.push({ campo: "tipo", mensagemKey: "hr.ausencias.erro.meioDiaNaoPermitido" });
  }
  if (args.dataInicio && args.dataInicio < dataMinimaDoTipo(tipo, args.hoje)) {
    problemas.push({ campo: "dataInicio", mensagemKey: "hr.ausencias.erro.semAntecedencia" });
  }
  if (args.dataInicio && args.dataFim && args.dataFim >= args.dataInicio && args.calculo.total <= 0) {
    problemas.push({ campo: "dataFim", mensagemKey: "hr.ausencias.erro.semDiasContaveis" });
  }
  // Um tipo `justificacao_sensivel` (o CHECK da migration 20261121020000 so
  // deixa isto ser true quando `exige_justificacao` tambem e) exige um
  // DOCUMENTO em `pessoas_ausencias_justificacoes`, nao texto livre aqui. O
  // motivo escrito neste campo viaja para quem aprova (chefia incluida) --
  // obriga-lo a preencher com um dado clinico seria pior do que nao o exigir.
  if (tipo.exige_justificacao && !tipo.justificacao_sensivel && args.motivo.trim() === "") {
    problemas.push({ campo: "motivo", mensagemKey: "hr.ausencias.erro.semMotivo" });
  }
  return problemas;
}

/**
 * O que sobra do saldo se este pedido for aprovado.
 *
 * A base NAO recusa por saldo -- confirmado por leitura de
 * `rpc_hr_ausencia_pedir`, que valida permissao, tipo, meio dia, antecedencia,
 * dias uteis e sobreposicao, e mais nada. Por isso isto e um AVISO que viaja
 * com o pedido ate quem decide, e nao um bloqueio inventado no cliente.
 */
export function efeitoNoSaldo(
  saldo: AusenciaSaldo | null,
  diasDoPedido: number,
): { disponiveisAntes: number; pedido: number; disponiveisDepois: number; ultrapassa: boolean } {
  const antes = saldo ? Number(saldo.disponiveis) : 0;
  const depois = arredondarDias(antes - diasDoPedido);
  return {
    disponiveisAntes: arredondarDias(antes),
    pedido: arredondarDias(diasDoPedido),
    disponiveisDepois: depois,
    ultrapassa: depois < 0,
  };
}

/** `troca_por_dinheiro` tem um CHECK que exige valor negativo. */
export function sentidoObrigatorio(motivoCodigo: MotivoAjuste): "retirar" | null {
  return motivoCodigo === "troca_por_dinheiro" ? "retirar" : null;
}

export interface AvaliacaoAjuste {
  /** O valor com sinal que vai para a RPC. */
  dias: number;
  gozavelDepois: number;
  /** Verdadeiro quando a base vai responder `ferias_minimo_legal`. */
  violaMinimoLegal: boolean;
  /** Verdadeiro quando a base vai responder `ausencia_ajuste_zero`. */
  eZero: boolean;
}

/**
 * O gozavel depois do ajuste, e se ele cai abaixo do minimo legal.
 *
 * A base calcula o gozavel como direito + ajustes positivos - vendidos, e
 * recusa abaixo de 20,00 quando o tipo tem `conta_minimo_legal`. Aqui a conta
 * e a mesma, sobre os numeros que a vista de saldos ja deu: `adquiridos` ja e
 * direito + positivos, e o que falta subtrair sao os dias vendidos, que sao a
 * parte negativa dos ajustes.
 */
export function avaliarAjuste(args: {
  sentido: "acrescentar" | "retirar";
  diasAbsolutos: number;
  saldo: AusenciaSaldo | null;
  contaMinimoLegal: boolean;
}): AvaliacaoAjuste {
  const absoluto = Number.isFinite(args.diasAbsolutos) ? Math.abs(args.diasAbsolutos) : 0;
  const dias = arredondarDias(args.sentido === "retirar" ? -absoluto : absoluto);

  const adquiridos = args.saldo ? Number(args.saldo.adquiridos) : 0;
  const ajustes = args.saldo ? Number(args.saldo.ajustes) : 0;
  const vendidos = Math.max(-ajustes, 0);
  // `adquiridos` = direito + ajustes positivos. O gozavel tira ainda os vendidos.
  const gozavelDepois = arredondarDias(adquiridos - vendidos + dias);

  return {
    dias,
    gozavelDepois,
    violaMinimoLegal: args.contaMinimoLegal && gozavelDepois < MINIMO_LEGAL_DIAS,
    eZero: dias === 0,
  };
}

export interface PassoLido {
  passo: PassoDecisao;
  /** `aberto` = a espera; `dispensado` = nao se aplica; o resto ja decidido. */
  situacao: "aberto" | "dispensado" | "aprovado" | "recusado" | "ajustado" | "devolvido" | "porChegar";
  /** A ultima decisao daquele passo, quando existe. */
  decisao: AusenciaDecisao | null;
}

export interface LeituraDoPedido {
  chefia: PassoLido;
  rh: PassoLido;
  /** Em que passo esta agora. `null` quando o pedido ja fechou. */
  passoActual: PassoDecisao | null;
  terminal: boolean;
}

function ultimaDecisao(
  decisoes: readonly AusenciaDecisao[],
  passo: PassoDecisao,
): AusenciaDecisao | null {
  const doPasso = decisoes
    .filter((decisao) => decisao.passo === passo)
    .sort((a, b) => a.ordem - b.ordem || a.decidido_em.localeCompare(b.decidido_em));
  return doPasso.length > 0 ? doPasso[doPasso.length - 1] : null;
}

/**
 * Os dois passos, legiveis: em qual esta, quem decidiu o que ja foi decidido.
 *
 * `dispensado` NAO se esconde. Um passo escondido faz parecer que o pedido
 * saltou uma etapa; escrito, diz que aquela etapa nao se aplica a este tipo.
 */
export function lerPedido(
  estado: EstadoPedido,
  decisoes: readonly AusenciaDecisao[],
): LeituraDoPedido {
  const terminal = estado === "aprovado" || estado === "recusado" || estado === "cancelado";
  const passoActual: PassoDecisao | null =
    estado === "pendente_chefia" ? "chefia" : estado === "pendente_rh" ? "rh" : null;

  const lerPasso = (passo: PassoDecisao): PassoLido => {
    const decisao = ultimaDecisao(decisoes, passo);
    if (passoActual === passo) return { passo, situacao: "aberto", decisao };
    if (!decisao) {
      // Sem decisao e sem ser o passo actual: ou ainda nao chegou (RH com o
      // pedido na chefia), ou o pedido morreu antes de la chegar.
      return { passo, situacao: "porChegar", decisao: null };
    }
    return { passo, situacao: decisao.resultado, decisao };
  };

  return { chefia: lerPasso("chefia"), rh: lerPasso("rh"), passoActual, terminal };
}

/** As accoes que a base aceita para este pedido, dado quem esta a olhar. */
export interface AccoesPossiveis {
  aprovarChefia: boolean;
  recusarChefia: boolean;
  ajustarChefia: boolean;
  aprovarRh: boolean;
  recusarRh: boolean;
  devolverAChefia: boolean;
  cancelar: boolean;
  corrigirAprovado: boolean;
}

export function accoesDoPedido(args: {
  estado: EstadoPedido;
  souOAutor: boolean;
  podeAprovarChefia: boolean;
  podeAprovarRh: boolean;
  podeEditarHistorico: boolean;
  /** So ha para onde devolver se o tipo exige chefia E ela e resoluvel. */
  temChefiaResoluvel: boolean;
}): AccoesPossiveis {
  const naChefia = args.estado === "pendente_chefia";
  const noRh = args.estado === "pendente_rh";
  const aprovado = args.estado === "aprovado";

  return {
    aprovarChefia: naChefia && args.podeAprovarChefia,
    recusarChefia: naChefia && args.podeAprovarChefia,
    ajustarChefia: naChefia && args.podeAprovarChefia,
    aprovarRh: noRh && args.podeAprovarRh,
    recusarRh: noRh && args.podeAprovarRh,
    devolverAChefia: noRh && args.podeAprovarRh && args.temChefiaResoluvel,
    // Cancelar um PENDENTE e direito de quem o fez; cancelar um APROVADO
    // exige `hr.ausencias.historico.editar`.
    cancelar:
      ((naChefia || noRh) && (args.souOAutor || args.podeEditarHistorico)) ||
      (aprovado && args.podeEditarHistorico),
    corrigirAprovado: aprovado && args.podeEditarHistorico,
  };
}

/**
 * Os prefixos estaveis das RPCs traduzidos em chave de mensagem.
 *
 * Devolve `null` quando nao reconhece o erro -- e ai quem chama usa a mensagem
 * amigavel generica E reporta, para se saber que faltou uma chave.
 */
const PREFIXOS: ReadonlyArray<[string, string]> = [
  ["ausencia_sem_sessao", "hr.ausencias.erroRpc.semSessao"],
  ["ausencia_sem_permissao", "hr.ausencias.erroRpc.semPermissao"],
  ["ausencia_pessoa_invalida", "hr.ausencias.erroRpc.pessoaInvalida"],
  ["ausencia_tipo_invalido", "hr.ausencias.erroRpc.tipoInvalido"],
  ["ausencia_datas_invalidas", "hr.ausencias.erroRpc.datasInvalidas"],
  ["ausencia_meio_dia_nao_permitido", "hr.ausencias.erroRpc.meioDiaNaoPermitido"],
  ["ausencia_sem_antecedencia", "hr.ausencias.erroRpc.semAntecedencia"],
  ["ausencia_sem_dias_uteis", "hr.ausencias.erroRpc.semDiasUteis"],
  ["ausencia_sobreposta", "hr.ausencias.erroRpc.sobreposta"],
  ["ausencia_ajuste_zero", "hr.ausencias.erroRpc.ajusteZero"],
  ["ferias_minimo_legal", "hr.ausencias.erroRpc.minimoLegal"],
  ["ausencia_cancelamento_sem_motivo", "hr.ausencias.erroRpc.cancelamentoSemMotivo"],
  ["ausencia_nao_aprovada", "hr.ausencias.erroRpc.naoAprovada"],
  ["ausencia_exige_pedido", "hr.ausencias.erroRpc.exigePedido"],
  ["ausencia_item_projectado", "hr.ausencias.erroRpc.itemProjectado"],
  ["ausencia_motivo_obrigatorio", "hr.ausencias.erroRpc.motivoObrigatorio"],
  ["ausencia_estado_invalido", "hr.ausencias.erroRpc.estadoInvalido"],
];

export function chaveDoErroDeAusencia(erro: unknown): string | null {
  const mensagem =
    typeof erro === "string"
      ? erro
      : typeof (erro as { message?: unknown } | null)?.message === "string"
        ? ((erro as { message: string }).message)
        : "";
  if (!mensagem) return null;
  // Tambem se procura no meio da mensagem: a sobreposicao vem do trigger e
  // chega embrulhada no texto do Postgres.
  const encontrado = PREFIXOS.find(([prefixo]) => mensagem.includes(prefixo));
  return encontrado ? encontrado[1] : null;
}

/** "12,5" em pt e "12.5" em en -- deixa-se ao Intl, com duas casas no maximo. */
export function formatarDias(valor: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    arredondarDias(valor),
  );
}
