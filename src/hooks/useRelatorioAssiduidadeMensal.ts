/**
 * O relatorio mensal de UMA pessoa: a grelha diaria (planeado, realizado,
 * obra, estado) e a seccao de obras do mes, no mesmo hook.
 *
 * PORQUE NAO E UMA CONVERSAO DO EXCEL DO KAIROS
 * ----------------------------------------------
 * O Excel de referencia funde "horario" e "marcacoes reais" em colunas soltas
 * e deixa "obra" fora do circuito digital. Aqui as tres fontes -- horario
 * planeado, horas realizadas (picagem) e horas de obra (`hr_obras_horas`,
 * 20261201100000) -- ficam SEMPRE como tres numeros distintos por dia. Nunca
 * se somam numa "hora trabalhada" unica: e exactamente essa fusao que o
 * utilizador pediu para evitar.
 *
 * O ESTADO DO DIA REAPROVEITA O QUE JA EXISTE
 * --------------------------------------------
 * Nao ha logica nova de classificacao. Um dia sem trabalho planeado
 * (`leituraDoPlaneado(...).naoTrabalha`) e "descanso"; se cair num feriado do
 * calendario da organizacao (`indexarFeriados`/`eFeriado`, de
 * `lib/hr/ausencias.ts`, o mesmo que o modulo de ausencias ja usa) passa a
 * "feriado"; se houver uma ausencia APROVADA a cobrir o dia inteiro
 * (`pessoas_ausencias_dias`), o estado e a categoria dessa ausencia (tipicamente
 * "ferias"). Uma falta (`pessoas_faltas`) NAO substitui o dia -- continua a
 * mostrar planeado/realizado, com `temFalta` a assinalar o periodo em falta,
 * porque uma falta e um desvio num dia normal, nao um dia sem trabalho.
 *
 * SEGUE O PADRAO DE `useAssiduidadeDaPessoa` / `useAusenciasDaPessoa`
 * ---------------------------------------------------------------------
 * Cada satelite tem a sua permissao; uma recusa esvazia esse satelite e NAO
 * vai ao Sentry (`isPermissionError`). Toda escrita de obra e por RPC
 * (`rpc_hr_obra_horas_registar` / `rpc_hr_obra_horas_anular`): a tabela nao
 * da INSERT/UPDATE/DELETE directo a authenticated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import {
  LEITOR_FALTAS,
  LEITOR_REALIZADO,
  emVigor,
  minutosNoturnosDoPeriodo,
  minutosNoturnosPorFaixa,
  subtrairIntervalos,
} from "@/lib/hr/assiduidade";
import { leituraDoPlaneado } from "@/lib/hr/planeadoDoDia";
import { minutosDe } from "@/lib/hr/horario";
import { diasDoPeriodo, periodoDaFolha, type IntervaloDaFolha } from "@/lib/hr/periodoFolha";
import { indexarFeriados, eFeriado, type FeriadoOrg, type IndiceFeriados } from "@/lib/hr/ausencias";
import type { HorarioPlaneado } from "@/types/hr";
import type { Falta } from "@/types/hrAssiduidade";
import type { FaltaDoPeriodo } from "@/lib/hr/descontoFalta";
import { chaveDeAssiduidade } from "@/lib/hr/faltasFecho";
import type { AusenciaDia, AusenciaTipo, CategoriaAusencia } from "@/types/hrAusencias";
import type { RealizadoComCorreccao } from "@/hooks/useAssiduidadeDaPessoa";
import { chaveDeDesvios, contarDia, linhaDaChaveDeDesvios, margemDoDia, type DesvioDoDia, type DesvioLido, type VersaoMargem } from "@/lib/hr/desviosRelatorio";
import { desvioLidoDaLinha, rpcDeDesviosIndisponivel } from "@/lib/hr/desviosBase";
import { lerMargemPartilhada, listarDesvios } from "@/lib/hr/desviosRpc";

const COLUNAS_REALIZADO =
  "id, pessoa_id, organization_id, vinculo_id, local_id, planeado_id, data, hora_inicio, " +
  "hora_fim, minutos, origem, estado, validado_por, validado_em, motivo_rejeicao, notas, " +
  "corrige_realizado_id, correccao_motivo, corrigido_por_pessoa_id, deleted_at";

const COLUNAS_FALTA =
  "id, pessoa_id, organization_id, data, planeado_id, vinculo_id, local_id, hora_inicio, " +
  "hora_fim, minutos, motivo_codigo, justificacao_estado, justificada, remunerada, " +
  "desconta_saldo, justificacao_decidida_por, justificacao_decidida_em, justificacao_motivo, " +
  "ausencia_dia_id, corrige_falta_id, correccao_motivo, estado, anulado_em, anulacao_motivo, " +
  "created_at";

const COLUNAS_PLANEADO =
  "id, pessoa_id, organization_id, vinculo_id, local_id, dia_semana, data, hora_inicio, " +
  "hora_fim, nao_trabalha, ordem, valido_de, valido_ate, notas, " +
  "corrige_horario_id, correccao_motivo, corrigido_por_anew_user_id, corrigido_por_pessoa_id";

const COLUNAS_AUSENCIA_DIA =
  "id, pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia, conta_saldo, " +
  "e_feriado, e_fim_semana, periodo_inicio, estado";

const COLUNAS_AUSENCIA_TIPO = "id, organization_id, codigo, nome, categoria, remunerada";

/** So o timezone -- e o mesmo `schedule_settings` que `useScheduleSettings` usa. */
const COLUNAS_SCHEDULE_SETTINGS = "timezone";

interface ScheduleSettingsTimezone {
  timezone: string | null;
}

/** `hr_obras_horas` (20261201100000). Nunca se apaga -- uma anulada fica marcada. */
export interface ObraHoras {
  id: string;
  pessoa_id: string;
  organization_id: string;
  data: string;
  horas: number;
  descricao: string;
  registado_por: string | null;
  anulado_em: string | null;
  anulado_por: string | null;
  anulado_motivo: string | null;
  created_at: string;
}

const COLUNAS_OBRA =
  "id, pessoa_id, organization_id, data, horas, descricao, registado_por, " +
  "anulado_em, anulado_por, anulado_motivo, created_at";

export type EstadoDiaRelatorio = "normal" | "descanso" | "feriado" | "ausencia" | "sem_registo";

/** Um intervalo `HH:MM-HH:MM`, planeado ou realizado, pronto a mostrar. */
export interface IntervaloRelatorio {
  hora_inicio: string;
  hora_fim: string;
}

export interface DiaRelatorioMensal {
  iso: string;
  /** 0 = domingo .. 6 = sabado, para quem quiser desenhar a abreviatura do dia. */
  diaSemana: number;
  estado: EstadoDiaRelatorio;
  /** So quando `estado === "ausencia"`: a categoria do tipo aprovado (ferias, doenca, ...). */
  categoriaAusencia: CategoriaAusencia | null;
  /**
   * So quando `estado === "ausencia"`: se o tipo aprovado e remunerado
   * (`hr_ausencias_tipos.remunerada`). Opcional, mesmo precedente de
   * `diasPlaneados` -- ausente (fixtures antigos sem a coluna, ou tipo sem
   * linha carregada) equivale a `true`: so um `false` explicito desliga. Na
   * base a coluna e NOT NULL e a query de tipos filtra so por
   * `organization_id`, por isso este lado nunca se atinge em produção; e o
   * inofensivo em fixtures de teste, que nao tem outros tipos a apanhar.
   * So entra no desconto de faltas (`minutosAusenciaRemunerada`), nunca em
   * `planeadoMinutos`/`realizadoMinutos`.
   */
  ausenciaRemunerada?: boolean;
  planeadoMinutos: number;
  realizadoMinutos: number;
  /** Os intervalos planeados do dia, na ordem em que se sucedem (o almoco parte em dois). */
  planeadoIntervalos: IntervaloRelatorio[];
  /** Os intervalos REALMENTE picados -- podem diferir do planeado no horario do almoco. */
  realizadoIntervalos: IntervaloRelatorio[];
  obraHoras: number;
  temFalta: boolean;
  minutosEmFalta: number;
  /**
   * O excedente de `realizadoMinutos` sobre `planeadoMinutos`, nunca negativo:
   * entrar mais cedo, sair mais tarde, ou trabalhar um dia sem nenhum horario
   * planeado (feriado, descanso). Sem taxa nem classificacao legal -- e so o
   * numero de minutos a mais, fora de ambito decidir se e a 50% ou nocturno.
   */
  horasExtraMinutos: number;
  /**
   * MARGEM DE TEMPO (desvios). Quantos minutos CONTAM neste dia para o desconto de faltas e para o subsidio. Ausente (fixtures
   * antigos) ou sem margem configurada = `realizadoMinutos`. Com margem: o planeado dentro da margem ou enquanto o desvio esta
   * por validar; o realizado quando o desvio foi validado como hora extra ou aceite. `realizadoMinutos` nunca muda: e o que se picou.
   */
  contadoMinutos?: number;
  /**
   * Hora extra VALIDADA do dia (e o que `horasExtraMinutos` passa a ser com margem). Sem margem e o excesso em bruto, como antes.
   * PONTO DE LIGACAO das horas extra aprovadas (`pessoas_horas_extra`): ver `desviosRelatorio.ts`.
   */
  extraValidadoMinutos?: number;
  /** O desvio do dia (estado e decisao); `null`/ausente = sem desvio. `a_validar` conta provisoriamente o planeado. */
  desvio?: DesvioDoDia | null;
  /**
   * Quanto do EXCEDENTE caiu no periodo nocturno (22:00-07:00, Codigo do
   * Trabalho art. 223) -- e nao quanto do realizado do dia caiu de noite.
   *
   * O excedente e calculado como INTERVALOS DE TEMPO reais: `subtrairIntervalos`
   * tira aos intervalos realmente picados a parte coberta por algum intervalo
   * planeado desse dia, e so essa sobra (entrar mais cedo, sair mais tarde,
   * trabalhar um dia sem horario planeado) e medida contra a janela nocturna.
   * Sem isto, um turno planeado 22:00-06:00 (~450 min, todo nocturno) com 2h
   * extra a meio do dia dava `Math.min(120, 450) = 120` -- o relatorio dizia
   * "120 min de horas extra nocturnas" quando NENHUMA das horas extra era
   * nocturna, so o turno normal (ja nocturno por si so) e que era. O
   * `Math.min` com `horasExtraMinutos` fica como rede de seguranca: o
   * excedente calculado aqui nunca deveria exceder o total de horas extra, mas
   * nao custa nada garantir.
   */
  horasExtraNoturnasMinutos: number;
  /**
   * Os minutos REALIZADOS (todo o trabalho do dia, nao so o excedente) dentro de cada faixa noturna da regra
   * salarial, pela ordem das faixas recebidas. So existe quando o hook recebeu faixas. E o que o Processamento
   * Salarial paga; `horasExtraNoturnasMinutos` (janela fixa 22:00-07:00 sobre o excedente) fica para os relatorios.
   */
  minutosNoturnosPorFaixa?: number[];
  /**
   * As faltas deste dia que podem descontar (desconto de faltas por falta, ver `descontoFalta.ts`): as faltas marcadas em
   * vigor e, num dia `sem_registo`, uma falta NAO justificada (`semRegisto`) com o defice do dia. Opcional (fixtures antigos).
   */
  faltasParaDesconto?: (FaltaDoPeriodo & { semRegisto?: boolean })[];
  /** Maximo de minutos de falta do dia depois de uma ausencia remunerada (total = 0; parcial = o resto). Ausente = sem limite. */
  limiteFaltaMinutos?: number;
}

export interface TotaisRelatorioMensal {
  diasTrabalhados: number;
  /**
   * Dias com horario planeado (`planeadoMinutos > 0`), a mesma exclusao de
   * `contaParaTotais` que os outros totais usam (uma ausencia aprovada de dia
   * inteiro nao conta -- esse dia fica escondido em todos os totais, nao so
   * neste). Opcional para nao obrigar os fixtures de outros ecras (relatorio
   * de assiduidade, PDF) que ja tinham `TotaisRelatorioMensal` construido a
   * mao a acrescentar este campo -- so o Processamento Salarial o usa por
   * agora.
   */
  diasPlaneados?: number;
  planeadoMinutos: number;
  realizadoMinutos: number;
  obraHoras: number;
  /** Dias de feriado em que a pessoa trabalhou mesmo assim (realizado > 0). */
  diasFeriadoTrabalhados: number;
  /**
   * Falta completa: TODOS os dias que sao falta completa -- zero picagem num
   * dia planeado, registada pelo RH (`pessoas_faltas`) ou nao. "Sem registo"
   * nao e uma terceira categoria: e a mesma falta, so que ainda por tratar.
   * `diasComFaltaCompletaRegistada` diz quantos, DENTRO deste total, ja tem
   * essa linha -- e so um atributo da falta, nunca decide se ela existe.
   */
  diasComFaltaCompleta: number;
  diasComFaltaCompletaRegistada: number;
  /** Idem, para a falta incompleta (picagem parcial, nao cobre o planeado todo). */
  diasComFaltaIncompleta: number;
  diasComFaltaIncompletaRegistada: number;
  horasExtraMinutos: number;
  horasExtraNoturnasMinutos: number;
  /** Soma de `contadoMinutos` dos dias (margem de tempo). Ausente = `realizadoMinutos`. */
  contadoMinutos?: number;
  /** Dias com desvio ainda por validar (a_validar ou por detetar): contam provisoriamente o planeado. */
  diasPorValidar?: number;
  /** A margem de tempo da organizacao estava ligada em algum dia do periodo. */
  margemConfigurada?: boolean;
  /**
   * A margem ou os desvios NAO se leram (erro ou recusa): o calculo estaria sem desvios. O processamento e o fecho bloqueiam
   * com motivo escrito, nunca calculam em silencio.
   */
  desviosNaoLidos?: boolean;
  /** Sem permissao para ler a margem: nao se sabe se a organizacao a tem. Nao bloqueia o fecho (a base decide). */
  margemRecusada?: boolean;
  /**
   * A chave dos desvios (versoes em vigor, com decisao) usados neste calculo. No fecho compara-se com a da base: se diferir, o calculo
   * e mais antigo do que os desvios e recalcula-se antes de gravar.
   */
  desviosChave?: string;
  /** Minutos de excedente (realizado, ja que o planeado e zero) em dias de feriado. */
  minutosFeriadoTrabalhado: number;
  /** Idem, em dias de descanso (folga propria da pessoa). */
  minutosDescansoTrabalhado: number;
  /**
   * Os minutos de excedente que sobram depois de tirar feriado e descanso --
   * o excedente em dias NORMAIS. `horasExtraNoturnasMinutos` continua
   * TRANSVERSAL (conta sempre, inclui minutos que tambem cairam dentro de
   * `minutosFeriadoTrabalhado`/`minutosDescansoTrabalhado`) -- nao se
   * subtrai daqui, por decisao de produto (as horas nocturnas empilham com
   * feriado/descanso, nao sao mutuamente exclusivas).
   * `minutosExtraNormal + minutosFeriadoTrabalhado + minutosDescansoTrabalhado === horasExtraMinutos`
   */
  minutosExtraNormal: number;
  /**
   * Minutos PLANEADOS cobertos por uma ausencia aprovada de dia inteiro E
   * remunerada (tipicamente ferias). Continuam a contar em `planeadoMinutos`
   * (a base paga a hora nao pode ficar sem elas) e NAO em `realizadoMinutos`
   * (nao houve picagem) -- este numero serve so para o desconto de faltas os
   * poder neutralizar, nunca para inflacionar dias trabalhados/realizado.
   * Opcional, mesmo precedente de `diasPlaneados`.
   */
  minutosAusenciaRemunerada?: number;
  /** As faltas do periodo que podem descontar, uma por falta (ver `DiaRelatorioMensal.faltasParaDesconto`). */
  faltasParaDesconto?: (FaltaDoPeriodo & { semRegisto?: boolean })[];
  /** Por dia (ISO), o maximo de minutos de falta depois de uma ausencia remunerada. So os dias com esse caso. */
  limiteFaltaPorDia?: Record<string, number>;
  /**
   * Assinatura do que o calculo do desconto usou: faltas (em vigor e anuladas), picagens em vigor e ausencias aprovadas. O fecho
   * recusa gravar um calculo mais antigo que estes dados.
   */
  faltasChave?: string;
  /** A soma, por faixa noturna da regra, dos minutos realizados nos dias que contam. So existe com faixas. */
  minutosNoturnosPorFaixa?: number[];
}

/** Uma faixa noturna da regra salarial: "HH:MM", podendo atravessar a meia-noite. */
export interface FaixaNoturnaDoRelatorio {
  hora_inicio: string;
  hora_fim: string;
}

const SEM_FAIXAS: readonly FaixaNoturnaDoRelatorio[] = [];

interface Satelite<T> {
  linhas: T[];
  recusado: boolean;
  /** A leitura falhou (nao por permissao): as linhas estao vazias por erro, nao porque nao existam. */
  erro?: boolean;
}

const vazio = <T,>(): Satelite<T> => ({ linhas: [], recusado: false });

/** A margem de tempo e os desvios em vigor (nao substituidos) do periodo de UMA pessoa. */
interface DesviosDoPeriodo {
  versoes: VersaoMargem[];
  /** Por dia. */
  porDia: Map<string, DesvioLido>;
  /** A chave dos desvios usados neste calculo (`chaveDeDesvios`): o fecho compara-a com a da base antes de gravar. */
  chave: string;
  /** Nao se leu a margem (erro) ou os desvios (erro ou recusa) com margem ligada: nunca se calcula em silencio. */
  naoLidos: boolean;
  /** Sem permissao para ler a margem: nao se sabe se a organizacao a tem. Nao bloqueia o fecho (a base decide). */
  margemRecusada: boolean;
  /** A base ainda nao tem as RPCs (migration por aplicar): nao ha margem nem desvios. */
  indisponivel: boolean;
  /** Falha que NAO e recusa: tambem torna a leitura do relatorio incompleta. */
  erro: boolean;
}

const SEM_DESVIOS: DesviosDoPeriodo = {
  versoes: [],
  porDia: new Map(),
  chave: "",
  naoLidos: false,
  margemRecusada: false,
  indisponivel: false,
  erro: false,
};

const temMargemLigada = (versoes: readonly VersaoMargem[]): boolean =>
  versoes.some((v) => v.substituida_em === null && v.margem_min !== null);

/**
 * Le a margem (versoes; uma leitura por organizacao, partilhada) e, SO se alguma esta ligada, os desvios da pessoa no periodo (por
 * `rpc_hr_desvios_listar`, a unica via de leitura). Sem margem configurada nao se faz a segunda chamada e o resultado e o de sempre.
 */
async function carregarDesvios(orgId: string, pessoaId: string, de: string, ate: string): Promise<DesviosDoPeriodo> {
  let versoes: VersaoMargem[] = [];
  try {
    versoes = (await lerMargemPartilhada(orgId)).versoes;
  } catch (erro) {
    if (rpcDeDesviosIndisponivel(erro, "rpc_hr_desvios_config_ler")) return { ...SEM_DESVIOS, indisponivel: true };
    // Sem permissao para ler a margem: nao se sabe se a organizacao a tem. Nao e «sem margem» nem bloqueia: a base decide no fecho.
    if (isPermissionError(erro)) return { ...SEM_DESVIOS, margemRecusada: true };
    captureFlowError(erro, "hr-relatorio-assiduidade-mensal-load");
    return { ...SEM_DESVIOS, naoLidos: true, erro: true };
  }
  if (!temMargemLigada(versoes)) return { ...SEM_DESVIOS, versoes };
  try {
    const linhas = await listarDesvios(orgId, { estado: null, de, ate, pessoaId });
    const porDia = new Map<string, DesvioLido>();
    const partes: string[] = [];
    for (const linha of linhas) {
      const lido = desvioLidoDaLinha(linha);
      if (!lido) continue;
      porDia.set(linha.data, lido);
      partes.push(linhaDaChaveDeDesvios(linha.data, linha.id, linha.estado, linha.decisao));
    }
    return { ...SEM_DESVIOS, versoes, porDia, chave: chaveDeDesvios(partes) };
  } catch (erro) {
    // Mantem as versoes ja lidas: uma falha ao listar nao apaga o que se sabe da margem.
    if (rpcDeDesviosIndisponivel(erro, "rpc_hr_desvios_listar")) return { ...SEM_DESVIOS, versoes, indisponivel: true };
    if (isPermissionError(erro)) return { ...SEM_DESVIOS, versoes, naoLidos: true };
    captureFlowError(erro, "hr-relatorio-assiduidade-mensal-load");
    return { ...SEM_DESVIOS, versoes, naoLidos: true, erro: true };
  }
}

async function carregar<T>(
  tabela: string,
  colunas: string,
  aplicar: (query: any) => any,
): Promise<Satelite<T>> {
  const { data, error } = await aplicar(hrFrom(tabela).select(colunas));
  if (error) {
    if (isPermissionError(error)) return { linhas: [], recusado: true };
    captureFlowError(error, "hr-relatorio-assiduidade-mensal-load");
    return { linhas: [], recusado: false, erro: true };
  }
  return { linhas: (data ?? []) as T[], recusado: false };
}

/**
 * Hoje, em ISO -- para "sem_registo" nunca apanhar hoje nem o futuro.
 *
 * Usa o `timezone` da organizacao (`schedule_settings`, o mesmo que
 * `useScheduleSettings` le) quando disponivel: perto da meia-noite, quem ve o
 * relatorio de uma equipa portuguesa a partir de outro fuso nao pode ter uma
 * nocao de "hoje" diferente da equipa. Se o timezone ainda nao estiver
 * disponivel (a carregar, ou organizacao sem `schedule_settings`), ou se for
 * um valor que o `Intl` deste ambiente nao reconhece, cai-se para o fuso do
 * browser -- uma aproximacao aceite, nao ignorada em silencio.
 */
function isoDeHoje(timezone?: string | null): string {
  const agora = new Date();
  if (timezone) {
    try {
      const partes = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(agora);
      const valorDe = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
      const ano = valorDe("year");
      const mes = valorDe("month");
      const dia = valorDe("day");
      if (ano && mes && dia) return `${ano}-${mes}-${dia}`;
    } catch {
      // timezone invalido para este Intl -- cai para o fuso do browser abaixo.
    }
  }
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

function diaSemanaDe(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return 0;
  return new Date(ano, mes - 1, dia).getDay();
}

/** Minutos planeados de um dia, somando cada intervalo. */
function minutosPlaneadosDoDia(linhas: readonly HorarioPlaneado[], iso: string): number {
  const { intervalos } = leituraDoPlaneado(linhas, iso);
  return intervalos.reduce((soma, intervalo) => {
    const inicio = minutosDe(intervalo.hora_inicio);
    const fim = minutosDe(intervalo.hora_fim);
    if (inicio === null || fim === null || fim <= inicio) return soma;
    return soma + (fim - inicio);
  }, 0);
}

/**
 * Os intervalos REALMENTE picados de um dia, ordenados pela hora de inicio.
 *
 * Cada linha de `pessoas_horario_realizado` ja e um intervalo fechado (um par
 * entrada/saida): se a pessoa picou para almoco ha duas linhas, se nao picou
 * ha uma so, mais longa. Nao ha aqui nenhuma logica de emparelhamento -- so a
 * ordenacao para o ecra mostrar da esquerda para a direita.
 */
function intervalosOrdenados(
  linhas: readonly Pick<RealizadoComCorreccao, "hora_inicio" | "hora_fim">[],
): IntervaloRelatorio[] {
  return linhas
    .filter((linha) => Boolean(linha.hora_inicio) && Boolean(linha.hora_fim))
    .map((linha) => ({ hora_inicio: linha.hora_inicio, hora_fim: linha.hora_fim }))
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
}

export function useRelatorioAssiduidadeMensal(
  pessoaId: string | undefined,
  ano: number,
  mes: number,
  /** O intervalo da folha (de, ate inclusivos, ISO). Sem ele, o mes de calendario (`mes` e de 0 a 11 neste hook). */
  intervalo?: IntervaloDaFolha,
  /** As faixas noturnas da regra salarial em vigor; sem elas nao ha minutos noturnos por faixa. */
  faixasNoturnas: readonly FaixaNoturnaDoRelatorio[] = SEM_FAIXAS,
) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;

  const [realizado, setRealizado] = useState<Satelite<RealizadoComCorreccao>>(
    vazio<RealizadoComCorreccao>(),
  );
  const [faltas, setFaltas] = useState<Satelite<Falta>>(vazio<Falta>());
  const [planeado, setPlaneado] = useState<Satelite<HorarioPlaneado>>(vazio<HorarioPlaneado>());
  const [ausenciasDias, setAusenciasDias] = useState<Satelite<AusenciaDia>>(vazio<AusenciaDia>());
  const [ausenciasTipos, setAusenciasTipos] = useState<Satelite<AusenciaTipo>>(
    vazio<AusenciaTipo>(),
  );
  const [obras, setObras] = useState<Satelite<ObraHoras>>(vazio<ObraHoras>());
  const [scheduleSettings, setScheduleSettings] = useState<Satelite<ScheduleSettingsTimezone>>(
    vazio<ScheduleSettingsTimezone>(),
  );
  const [feriados, setFeriados] = useState<IndiceFeriados>(() => indexarFeriados([]));
  const [desviosDoPeriodo, setDesviosDoPeriodo] = useState<DesviosDoPeriodo>(SEM_DESVIOS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Uma falha NAO por permissao (rede, base) em qualquer leitura, ou a excepcao geral do carregamento: o relatorio
  // nao pode passar por completo so porque as linhas vieram vazias.
  const [erroDeLeitura, setErroDeLeitura] = useState(false);
  /** Os feriados nao se leram por falta de permissao: o calculo nao os conhece (um feriado trabalhado ou descansado muda o dia). */
  const [feriadosRecusados, setFeriadosRecusados] = useState(false);

  const de =intervalo?.de ?? periodoDaFolha(ano, mes + 1).de;
  const ate = intervalo?.ate ?? periodoDaFolha(ano, mes + 1).ate;

  // Conta os pedidos: so a resposta do mais recente escreve no estado (mudar de periodo a meio de uma leitura).
  const ultimoPedido = useRef(0);

  const load = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    if (!pessoaId || !orgId) {
      setRealizado(vazio<RealizadoComCorreccao>());
      setFaltas(vazio<Falta>());
      setPlaneado(vazio<HorarioPlaneado>());
      setAusenciasDias(vazio<AusenciaDia>());
      setAusenciasTipos(vazio<AusenciaTipo>());
      setObras(vazio<ObraHoras>());
      setScheduleSettings(vazio<ScheduleSettingsTimezone>());
      setDesviosDoPeriodo(SEM_DESVIOS);
      setErroDeLeitura(false);
      setFeriadosRecusados(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        oRealizado,
        asFaltas,
        oPlaneado,
        osDiasDeAusencia,
        osTiposDeAusencia,
        asObras,
        osFeriados,
        asScheduleSettings,
        osDesvios,
      ] = await Promise.all([
        carregar<RealizadoComCorreccao>("pessoas_horario_realizado", COLUNAS_REALIZADO, (q) =>
          q
            .eq("pessoa_id", pessoaId)
            .gte("data", de)
            .lte("data", ate)
            .order("data", { ascending: true }),
        ),
        carregar<Falta>("pessoas_faltas", COLUNAS_FALTA, (q) =>
          q.eq("pessoa_id", pessoaId).gte("data", de).lte("data", ate).order("data", {
            ascending: true,
          }),
        ),
        // Sem filtro de data: o padrao semanal nao tem data.
        carregar<HorarioPlaneado>("pessoas_horario_planeado", COLUNAS_PLANEADO, (q) =>
          q.eq("pessoa_id", pessoaId).order("ordem", { ascending: true }),
        ),
        carregar<AusenciaDia>("pessoas_ausencias_dias", COLUNAS_AUSENCIA_DIA, (q) =>
          q
            .eq("pessoa_id", pessoaId)
            .eq("estado", "aprovado")
            .gte("data", de)
            .lte("data", ate),
        ),
        carregar<AusenciaTipo>("hr_ausencias_tipos", COLUNAS_AUSENCIA_TIPO, (q) =>
          q.eq("organization_id", orgId),
        ),
        carregar<ObraHoras>("hr_obras_horas", COLUNAS_OBRA, (q) =>
          q
            .eq("pessoa_id", pessoaId)
            .gte("data", de)
            .lte("data", ate)
            .order("data", { ascending: true }),
        ),
        carregar<FeriadoOrg>("schedule_holidays", "holiday_date, is_recurring", (q) =>
          q.eq("organization_id", orgId),
        ),
        carregar<ScheduleSettingsTimezone>("schedule_settings", COLUNAS_SCHEDULE_SETTINGS, (q) =>
          q.eq("organization_id", orgId),
        ),
        carregarDesvios(orgId, pessoaId, de, ate),
      ]);

      if (pedido !== ultimoPedido.current) return;
      setRealizado(oRealizado);
      setFaltas(asFaltas);
      setPlaneado(oPlaneado);
      setAusenciasDias(osDiasDeAusencia);
      setAusenciasTipos(osTiposDeAusencia);
      setObras(asObras);
      setFeriados(indexarFeriados(osFeriados.linhas));
      setFeriadosRecusados(osFeriados.recusado);
      setScheduleSettings(asScheduleSettings);
      setDesviosDoPeriodo(osDesvios);
      setErroDeLeitura(
        [oRealizado, asFaltas, oPlaneado, osDiasDeAusencia, osTiposDeAusencia, asObras, osFeriados, asScheduleSettings].some(
          (s) => s.erro === true,
        ) || osDesvios.erro,
      );
    } catch (e) {
      captureFlowError(e, "hr-relatorio-assiduidade-mensal-load");
      // Nao se engole: sem isto o relatorio ficava com as linhas do pedido anterior (ou vazias) como se fosse bom.
      if (pedido === ultimoPedido.current) setErroDeLeitura(true);
    } finally {
      if (pedido === ultimoPedido.current) setLoading(false);
    }
  }, [pessoaId, orgId, de, ate]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoriaPorTipoId = useMemo(() => {
    const mapa = new Map<string, CategoriaAusencia>();
    for (const tipo of ausenciasTipos.linhas) mapa.set(tipo.id, tipo.categoria);
    return mapa;
  }, [ausenciasTipos.linhas]);

  /** `hr_ausencias_tipos.remunerada`, por tipo -- ver `ausenciaRemunerada` do dia. */
  const remuneradaPorTipoId = useMemo(() => {
    const mapa = new Map<string, boolean>();
    for (const tipo of ausenciasTipos.linhas) mapa.set(tipo.id, tipo.remunerada);
    return mapa;
  }, [ausenciasTipos.linhas]);

  /** A ausencia aprovada de maior fraccao por dia -- a mesma regra de useAssiduidadeDaPessoa. */
  const ausenciaAprovadaPorDia = useMemo(() => {
    const mapa = new Map<string, AusenciaDia>();
    for (const dia of ausenciasDias.linhas) {
      const anterior = mapa.get(dia.data);
      if (!anterior || dia.fraccao_dia > anterior.fraccao_dia) mapa.set(dia.data, dia);
    }
    return mapa;
  }, [ausenciasDias.linhas]);

  const timezoneDaOrganizacao = scheduleSettings.linhas[0]?.timezone ?? null;

  const dias = useMemo<DiaRelatorioMensal[]>(() => {
    const realizadoEmVigor = emVigor(realizado.linhas, LEITOR_REALIZADO).filter(
      (linha) => !linha.deleted_at,
    );
    const faltasEmVigor = emVigor(faltas.linhas, LEITOR_FALTAS);
    // Um dia com uma falta ANULADA (o RH anulou, ou uma ausencia aprovada a substituiu) esta TRATADO: nao volta a ser
    // "sem_registo" nem desconta. `emVigor` deixa as anuladas de fora (`LEITOR_FALTAS.viva`), mas a leitura de
    // `pessoas_faltas` nao filtra por estado, por isso estao em `faltas.linhas`.
    const diasComFaltaAnulada = new Set(faltas.linhas.filter((f) => f.estado === "anulada").map((f) => f.data));

    const hoje = isoDeHoje(timezoneDaOrganizacao);

    const linhas: DiaRelatorioMensal[] = [];
    for (const iso of diasDoPeriodo(de, ate)) {
      const realizadoDoDia = realizadoEmVigor.filter((linha) => linha.data === iso);
      const faltasDoDia = faltasEmVigor.filter((falta) => falta.data === iso);
      const obraDoDia = obras.linhas.filter((obra) => obra.data === iso && !obra.anulado_em);
      const { naoTrabalha } = leituraDoPlaneado(planeado.linhas, iso);
      const ausenciaDoDia = ausenciaAprovadaPorDia.get(iso) ?? null;

      const planeadoMinutos = minutosPlaneadosDoDia(planeado.linhas, iso);
      const realizadoMinutos = realizadoDoDia.reduce((soma, linha) => soma + (linha.minutos ?? 0), 0);
      const minutosEmFalta = faltasDoDia.reduce((soma, falta) => soma + (falta.minutos ?? 0), 0);

      // A parte do planeado que a ausencia aprovada do dia cobre (so uma ausencia PARCIAL chega ao calculo da lacuna).
      const minutosCobertosPorAusencia = ausenciaDoDia
        ? Math.round(planeadoMinutos * Math.min(ausenciaDoDia.fraccao_dia, 1))
        : 0;
      const ausenciaPaga = ausenciaDoDia ? remuneradaPorTipoId.get(ausenciaDoDia.tipo_id) !== false : false;

      let estado: EstadoDiaRelatorio = "normal";
      let categoriaAusencia: CategoriaAusencia | null = null;
      let ausenciaRemunerada = false;

      // Uma ausencia aprovada de dia inteiro substitui o dia -- a mesma
      // hierarquia do Excel de referencia (Descanso/Feriado/Ferias no lugar
      // do horario). Fraccoes parciais nao substituem: o dia continua a
      // mostrar as horas, para nao esconder o que se trabalhou.
      if (ausenciaDoDia && ausenciaDoDia.fraccao_dia >= 1) {
        estado = "ausencia";
        categoriaAusencia = categoriaPorTipoId.get(ausenciaDoDia.tipo_id) ?? null;
        // `!== false` cobre o tipo sem linha carregada (fixture antigo sem a
        // coluna); na base a coluna e NOT NULL, por isso so um `false`
        // explicito desliga.
        ausenciaRemunerada = remuneradaPorTipoId.get(ausenciaDoDia.tipo_id) !== false;
      } else if (eFeriado(iso, feriados)) {
        estado = "feriado";
      } else if (naoTrabalha) {
        estado = "descanso";
      } else if (planeadoMinutos === 0) {
        // Sem linha nenhuma de horario para este dia da semana (nao so uma
        // linha explicita a marcar "nao_trabalha") -- para quem ve o
        // relatorio isto e igualmente um dia de descanso, nao "Normal". Vale
        // para o passado e o futuro: um dia sem horario nao e um buraco por
        // esclarecer (isso e o "sem_registo", abaixo, que exige planeado>0).
        estado = "descanso";
      } else if (
        planeadoMinutos > 0 &&
        // Qualquer deficit -- zero realizado OU so parte do planeado -- e um
        // buraco por esclarecer. Um dia com dois blocos planeados em que so
        // um foi picado (realizado > 0 mas < planeado) e tao "sem registo"
        // quanto um dia sem nenhuma picagem: falta o resto, e nada o explica.
        // Uma ausencia aprovada PARCIAL (ex. fraccao_dia 0.5) nao cai no ramo "ausencia" acima (que so substitui o dia
        // inteiro) e explica so a sua parte: o que fica por explicar e o planeado menos a parte coberta.
        realizadoMinutos < planeadoMinutos - minutosCobertosPorAusencia &&
        minutosEmFalta === 0 &&
        !diasComFaltaAnulada.has(iso) &&
        // Hoje e o futuro ainda podem vir a ter picagem -- so um dia que ja
        // passou e um buraco por esclarecer.
        iso < hoje
      ) {
        estado = "sem_registo";
      }

      const { intervalos: planeadoIntervalos } = leituraDoPlaneado(planeado.linhas, iso);
      // `leituraDoPlaneado` ja filtrou fora as linhas sem hora_inicio/hora_fim
      // (ver planeadoDoDia.ts), mas o tipo `HorarioPlaneado` continua nulavel --
      // reduz aqui para o par nao-nulo que `IntervaloRelatorio` promete.
      const planeadoIntervalosRelatorio: IntervaloRelatorio[] = planeadoIntervalos.map(
        (intervalo) => ({
          hora_inicio: intervalo.hora_inicio as string,
          hora_fim: intervalo.hora_fim as string,
        }),
      );
      const realizadoIntervalosDoDia = intervalosOrdenados(realizadoDoDia);
      // Margem de tempo: SEM margem configurada isto devolve o realizado e o excesso em bruto (o resultado de sempre).
      const { contadoMinutos, extraValidadoMinutos, desvio } = contarDia({
        estado,
        planeadoMinutos,
        realizadoMinutos,
        temFalta: faltasDoDia.length > 0,
        planeadoIntervalos: planeadoIntervalosRelatorio,
        realizadoIntervalos: realizadoIntervalosDoDia,
        margemMin: margemDoDia(desviosDoPeriodo.versoes, iso),
        desvio: desviosDoPeriodo.porDia.get(iso) ?? null,
        // PONTO DE LIGACAO (tarefa a parte): as horas extra aprovadas (`pessoas_horas_extra`) do dia entram aqui.
        extraAprovadoMin: 0,
      });
      const horasExtraMinutos = extraValidadoMinutos;
      // Desconto por falta: as faltas marcadas e, num dia sem registo (sem falta e sem picagem), uma falta nao justificada
      // com o defice do dia (desconta ate o RH aprovar uma justificacao do dia).
      const faltasParaDesconto: (FaltaDoPeriodo & { semRegisto?: boolean })[] = faltasDoDia.map((falta) => ({
        data: iso,
        minutos: falta.minutos ?? 0,
        estado: falta.estado,
        justificacao_estado: falta.justificacao_estado,
        remunerada: falta.remunerada,
        motivo_codigo: falta.motivo_codigo,
      }));
      if (estado === "sem_registo") {
        faltasParaDesconto.push({
          data: iso,
          // O que falta depois do picado e da parte que a ausencia (parcial) cobre. Com picagem parcial e um atraso
          // (a tolerancia aplica-se); sem picagem nenhuma e um dia sem registo (conta no aviso).
          minutos: Math.max(planeadoMinutos - minutosCobertosPorAusencia - contadoMinutos, 0),
          estado: "activa",
          justificacao_estado: "sem_justificacao",
          remunerada: false,
          motivo_codigo: realizadoMinutos > 0 ? "atraso" : "ausencia_nao_comunicada",
          semRegisto: realizadoMinutos === 0,
        });
      }
      // Ausencia NAO remunerada (licenca sem vencimento): desconta o planeado coberto (o dia inteiro, ou a fraccao nao
      // paga), como falta sintetica nao justificada. Vai primeiro, para o limite do dia a consumir antes das marcadas.
      if (ausenciaDoDia && !ausenciaPaga) {
        const naoPagos =
          ausenciaDoDia.fraccao_dia >= 1 ? Math.max(planeadoMinutos - realizadoMinutos, 0) : minutosCobertosPorAusencia;
        if (naoPagos > 0) {
          faltasParaDesconto.unshift({
            data: iso,
            minutos: naoPagos,
            estado: "activa",
            justificacao_estado: "sem_justificacao",
            remunerada: false,
            motivo_codigo: "outro",
            ausenciaNaoPaga: true,
          });
        }
      }
      // Limite diario de minutos de falta. Ausencia remunerada: dia inteiro cobre tudo (0); parcial cobre a sua parte.
      // Ausencia nao remunerada: nunca mais do que o planeado do dia (a sintetica e uma falta marcada nao somam a dobrar).
      let limiteFaltaMinutos: number | undefined;
      if (ausenciaDoDia) {
        limiteFaltaMinutos = !ausenciaPaga
          ? planeadoMinutos
          : ausenciaDoDia.fraccao_dia >= 1
            ? 0
            : Math.max(planeadoMinutos - minutosCobertosPorAusencia, 0);
      }
      const excedenteIntervalos = subtrairIntervalos(
        realizadoIntervalosDoDia,
        planeadoIntervalosRelatorio,
      );
      const minutosNoturnosDoExcedente = excedenteIntervalos.reduce(
        (soma, intervalo) => soma + minutosNoturnosDoPeriodo(intervalo),
        0,
      );

      const noturnosPorFaixa = faixasNoturnas.length
        ? realizadoIntervalosDoDia.reduce<number[]>(
            (soma, intervaloDoDia) =>
              minutosNoturnosPorFaixa(intervaloDoDia, faixasNoturnas).map((m, i) => (soma[i] ?? 0) + m),
            faixasNoturnas.map(() => 0),
          )
        : null;

      linhas.push({
        iso,
        diaSemana: diaSemanaDe(iso),
        estado,
        categoriaAusencia,
        ausenciaRemunerada,
        planeadoMinutos,
        realizadoMinutos,
        planeadoIntervalos: planeadoIntervalosRelatorio,
        realizadoIntervalos: realizadoIntervalosDoDia,
        obraHoras: obraDoDia.reduce((soma, obra) => soma + Number(obra.horas), 0),
        temFalta: faltasDoDia.length > 0,
        minutosEmFalta,
        horasExtraMinutos,
        contadoMinutos,
        extraValidadoMinutos,
        desvio,
        horasExtraNoturnasMinutos: Math.min(horasExtraMinutos, minutosNoturnosDoExcedente),
        faltasParaDesconto,
        ...(limiteFaltaMinutos !== undefined ? { limiteFaltaMinutos } : {}),
        ...(noturnosPorFaixa ? { minutosNoturnosPorFaixa: noturnosPorFaixa } : {}),
      });
    }
    return linhas;
  }, [
    realizado.linhas,
    faltas.linhas,
    planeado.linhas,
    obras.linhas,
    ausenciaAprovadaPorDia,
    categoriaPorTipoId,
    remuneradaPorTipoId,
    feriados,
    timezoneDaOrganizacao,
    faixasNoturnas,
    desviosDoPeriodo,
    de,
    ate,
  ]);

  const totais = useMemo<TotaisRelatorioMensal>(
    () => {
      const acumulado = dias.reduce<Omit<TotaisRelatorioMensal, "minutosExtraNormal">>(
        (acc, dia) => {
          // Falta completa so faz sentido com planeado > 0: sem horario nesse
          // dia nao ha "todo o planeado" para a falta cobrir.
          const faltaCompletaRegistada =
            dia.temFalta && dia.planeadoMinutos > 0 && dia.minutosEmFalta >= dia.planeadoMinutos;
          const faltaIncompletaRegistada =
            dia.temFalta &&
            dia.planeadoMinutos > 0 &&
            dia.minutosEmFalta > 0 &&
            !faltaCompletaRegistada;

          // "sem_registo" e a MESMA falta, so que o RH ainda nao criou a linha
          // em pessoas_faltas -- entra no mesmo total, distinguida so por
          // realizadoMinutos (zero = completa, >0 = incompleta), nunca como
          // categoria propria.
          const faltaCompletaSemRegisto = dia.estado === "sem_registo" && dia.realizadoMinutos === 0;
          const faltaIncompletaSemRegisto = dia.estado === "sem_registo" && dia.realizadoMinutos > 0;

          // Uma ausencia aprovada de dia inteiro fica sempre escondida na UI
          // (trabalhouForaDoNormal so revela feriado/descanso, nunca
          // ausencia); por isso os seus minutos nao podem entrar nos totais
          // de horas extra nem de dias trabalhados, sob pena de o total
          // mostrar minutos que nenhuma linha visivel explica.
          const contaParaTotais = dia.estado !== "ausencia";

          return {
            diasTrabalhados:
              acc.diasTrabalhados + (contaParaTotais && dia.realizadoMinutos > 0 ? 1 : 0),
            diasPlaneados:
              (acc.diasPlaneados ?? 0) + (contaParaTotais && dia.planeadoMinutos > 0 ? 1 : 0),
            planeadoMinutos: acc.planeadoMinutos + dia.planeadoMinutos,
            realizadoMinutos: acc.realizadoMinutos + dia.realizadoMinutos,
            contadoMinutos: (acc.contadoMinutos ?? 0) + (dia.contadoMinutos ?? dia.realizadoMinutos),
            diasPorValidar:
              (acc.diasPorValidar ?? 0) +
              (contaParaTotais && dia.desvio && dia.desvio.estado !== "validado" ? 1 : 0),
            // So o DEFICE do dia (planeado menos o que ja foi picado nesse
            // mesmo dia) cobertos por uma ausencia aprovada de dia inteiro e
            // remunerada (ferias, tipicamente) -- para o desconto de faltas
            // os poder neutralizar. Sem o `- realizadoMinutos`, um dia de
            // ferias com picagem (ex.: meio-dia trabalhado por engano) conta
            // os minutos picados a dobrar, e o excedente migra para o
            // desconto de faltas de OUTROS dias, neutralizando faltas reais.
            minutosAusenciaRemunerada:
              (acc.minutosAusenciaRemunerada ?? 0) +
              (dia.estado === "ausencia" && dia.ausenciaRemunerada
                ? Math.max(dia.planeadoMinutos - dia.realizadoMinutos, 0)
                : 0),
            obraHoras: acc.obraHoras + dia.obraHoras,
            diasFeriadoTrabalhados:
              acc.diasFeriadoTrabalhados + (dia.estado === "feriado" && dia.realizadoMinutos > 0 ? 1 : 0),
            diasComFaltaCompleta:
              acc.diasComFaltaCompleta + (faltaCompletaRegistada || faltaCompletaSemRegisto ? 1 : 0),
            diasComFaltaCompletaRegistada:
              acc.diasComFaltaCompletaRegistada + (faltaCompletaRegistada ? 1 : 0),
            diasComFaltaIncompleta:
              acc.diasComFaltaIncompleta + (faltaIncompletaRegistada || faltaIncompletaSemRegisto ? 1 : 0),
            diasComFaltaIncompletaRegistada:
              acc.diasComFaltaIncompletaRegistada + (faltaIncompletaRegistada ? 1 : 0),
            horasExtraMinutos: acc.horasExtraMinutos + (contaParaTotais ? dia.horasExtraMinutos : 0),
            horasExtraNoturnasMinutos:
              acc.horasExtraNoturnasMinutos + (contaParaTotais ? dia.horasExtraNoturnasMinutos : 0),
            // Feriado e descanso tem sempre planeadoMinutos === 0 (ver
            // comentario em TotaisRelatorioMensal), por isso o realizado do
            // dia JA E o excedente -- nao ha aqui nenhuma parte "normal" a
            // descontar. `contaParaTotais` exclui so "ausencia", e nenhum dia
            // pode ser "feriado"/"descanso" e "ausencia" ao mesmo tempo, mas
            // mantem-se a guarda por consistencia com os outros totais.
            minutosFeriadoTrabalhado:
              acc.minutosFeriadoTrabalhado +
              (contaParaTotais && dia.estado === "feriado" ? dia.realizadoMinutos : 0),
            minutosDescansoTrabalhado:
              acc.minutosDescansoTrabalhado +
              (contaParaTotais && dia.estado === "descanso" ? dia.realizadoMinutos : 0),
          };
        },
        {
          diasTrabalhados: 0,
          diasPlaneados: 0,
          planeadoMinutos: 0,
          realizadoMinutos: 0,
          contadoMinutos: 0,
          diasPorValidar: 0,
          minutosAusenciaRemunerada: 0,
          obraHoras: 0,
          diasFeriadoTrabalhados: 0,
          diasComFaltaCompleta: 0,
          diasComFaltaCompletaRegistada: 0,
          diasComFaltaIncompleta: 0,
          diasComFaltaIncompletaRegistada: 0,
          horasExtraMinutos: 0,
          horasExtraNoturnasMinutos: 0,
          minutosFeriadoTrabalhado: 0,
          minutosDescansoTrabalhado: 0,
        },
      );

      // O excedente que sobra depois de feriado e descanso e o excedente em
      // dias normais -- nunca negativo por construcao (feriado/descanso
      // somam so uma PARTE do que entra em horasExtraMinutos), mas o
      // Math.max fica como rede de seguranca, tal como o Math.min de
      // horasExtraNoturnasMinutos acima.
      const minutosExtraNormal = Math.max(
        0,
        acumulado.horasExtraMinutos -
          acumulado.minutosFeriadoTrabalhado -
          acumulado.minutosDescansoTrabalhado,
      );

      // Minutos noturnos por faixa da regra: so os dias que contam (a mesma exclusao das ausencias).
      const noturnosPorFaixa = faixasNoturnas.map((_, i) =>
        dias.reduce(
          (soma, dia) => (dia.estado !== "ausencia" ? soma + (dia.minutosNoturnosPorFaixa?.[i] ?? 0) : soma),
          0,
        ),
      );

      const faltasParaDesconto = dias.flatMap((dia) => dia.faltasParaDesconto ?? []);
      const limiteFaltaPorDia: Record<string, number> = {};
      for (const dia of dias) {
        if (dia.limiteFaltaMinutos !== undefined) limiteFaltaPorDia[dia.iso] = dia.limiteFaltaMinutos;
      }

      return {
        ...acumulado,
        faltasParaDesconto,
        limiteFaltaPorDia,
        faltasChave: chaveDeAssiduidade({ faltas: faltas.linhas, realizado: realizado.linhas, ausencias: ausenciasDias.linhas }),
        minutosExtraNormal,
        margemConfigurada: temMargemLigada(desviosDoPeriodo.versoes),
        desviosNaoLidos: desviosDoPeriodo.naoLidos,
        margemRecusada: desviosDoPeriodo.margemRecusada,
        desviosChave: desviosDoPeriodo.chave,
        ...(faixasNoturnas.length ? { minutosNoturnosPorFaixa: noturnosPorFaixa } : {}),
      };
    },
    [dias, faixasNoturnas, desviosDoPeriodo, faltas.linhas, realizado.linhas, ausenciasDias.linhas],
  );

  const executar = useCallback(
    async (accao: () => Promise<{ error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await accao();
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-relatorio-assiduidade-mensal-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const registarObra = useCallback(
    (args: { data: string; horas: number; descricao: string }) =>
      executar(() =>
        hrRpc("rpc_hr_obra_horas_registar", {
          p_pessoa_id: pessoaId,
          p_data: args.data,
          p_horas: args.horas,
          p_descricao: args.descricao,
        }),
      ),
    [executar, pessoaId],
  );

  const anularObra = useCallback(
    (obraId: string, motivo: string) =>
      executar(() => hrRpc("rpc_hr_obra_horas_anular", { p_obra_id: obraId, p_motivo: motivo })),
    [executar],
  );

  return {
    dias,
    totais,
    obras: obras.linhas,
    obrasRecusadas: obras.recusado,
    realizadoRecusado: realizado.recusado,
    faltasRecusadas: faltas.recusado,
    /** As ausencias aprovadas, os feriados ou os tipos de ausencia nao se leram por permissao: o calculo estaria errado. */
    ausenciasRecusadas: ausenciasDias.recusado,
    feriadosRecusados,
    tiposRecusados: ausenciasTipos.recusado,
    planeadoRecusado: planeado.recusado,
    /** Alguma leitura falhou (nao por permissao): os totais podem estar incompletos. */
    erro: erroDeLeitura,
    /** A margem ou os desvios nao se leram (erro ou recusa): o processamento e o fecho bloqueiam com motivo escrito. */
    desviosNaoLidos: desviosDoPeriodo.naoLidos,
    loading,
    saving,
    recarregar: load,
    registarObra,
    anularObra,
  };
}

export type RelatorioAssiduidadeMensal = ReturnType<typeof useRelatorioAssiduidadeMensal>;
