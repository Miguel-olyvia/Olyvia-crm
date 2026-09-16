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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import {
  LEITOR_FALTAS,
  LEITOR_REALIZADO,
  emVigor,
  minutosNoturnosDoPeriodo,
  subtrairIntervalos,
} from "@/lib/hr/assiduidade";
import { leituraDoPlaneado } from "@/lib/hr/planeadoDoDia";
import { minutosDe } from "@/lib/hr/horario";
import { indexarFeriados, eFeriado, type FeriadoOrg, type IndiceFeriados } from "@/lib/hr/ausencias";
import type { HorarioPlaneado } from "@/types/hr";
import type { Falta } from "@/types/hrAssiduidade";
import type { AusenciaDia, AusenciaTipo, CategoriaAusencia } from "@/types/hrAusencias";
import type { RealizadoComCorreccao } from "@/hooks/useAssiduidadeDaPessoa";

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

const COLUNAS_AUSENCIA_TIPO = "id, organization_id, codigo, nome, categoria";

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
}

export interface TotaisRelatorioMensal {
  diasTrabalhados: number;
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
}

interface Satelite<T> {
  linhas: T[];
  recusado: boolean;
}

const vazio = <T,>(): Satelite<T> => ({ linhas: [], recusado: false });

async function carregar<T>(
  tabela: string,
  colunas: string,
  aplicar: (query: any) => any,
): Promise<Satelite<T>> {
  const { data, error } = await aplicar(hrFrom(tabela).select(colunas));
  if (error) {
    if (isPermissionError(error)) return { linhas: [], recusado: true };
    captureFlowError(error, "hr-relatorio-assiduidade-mensal-load");
    return { linhas: [], recusado: false };
  }
  return { linhas: (data ?? []) as T[], recusado: false };
}

/** O primeiro e o ultimo dia do mes, em ISO, sem passar por UTC. */
function limitesDoMes(ano: number, mes: number): { de: string; ate: string; ultimoDia: number } {
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return {
    de: `${ano}-${doisDigitos(mes + 1)}-01`,
    ate: `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(ultimoDia)}`,
    ultimoDia,
  };
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const janela = useMemo(() => limitesDoMes(ano, mes), [ano, mes]);
  const { de, ate, ultimoDia } = janela;

  const load = useCallback(async () => {
    if (!pessoaId || !orgId) {
      setRealizado(vazio<RealizadoComCorreccao>());
      setFaltas(vazio<Falta>());
      setPlaneado(vazio<HorarioPlaneado>());
      setAusenciasDias(vazio<AusenciaDia>());
      setAusenciasTipos(vazio<AusenciaTipo>());
      setObras(vazio<ObraHoras>());
      setScheduleSettings(vazio<ScheduleSettingsTimezone>());
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
      ]);

      setRealizado(oRealizado);
      setFaltas(asFaltas);
      setPlaneado(oPlaneado);
      setAusenciasDias(osDiasDeAusencia);
      setAusenciasTipos(osTiposDeAusencia);
      setObras(asObras);
      setFeriados(indexarFeriados(osFeriados.linhas));
      setScheduleSettings(asScheduleSettings);
    } catch (e) {
      captureFlowError(e, "hr-relatorio-assiduidade-mensal-load");
    } finally {
      setLoading(false);
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

    const hoje = isoDeHoje(timezoneDaOrganizacao);

    const linhas: DiaRelatorioMensal[] = [];
    for (let dia = 1; dia <= ultimoDia; dia += 1) {
      const iso = `${de.slice(0, 8)}${String(dia).padStart(2, "0")}`;

      const realizadoDoDia = realizadoEmVigor.filter((linha) => linha.data === iso);
      const faltasDoDia = faltasEmVigor.filter((falta) => falta.data === iso);
      const obraDoDia = obras.linhas.filter((obra) => obra.data === iso && !obra.anulado_em);
      const { naoTrabalha } = leituraDoPlaneado(planeado.linhas, iso);
      const ausenciaDoDia = ausenciaAprovadaPorDia.get(iso) ?? null;

      const planeadoMinutos = minutosPlaneadosDoDia(planeado.linhas, iso);
      const realizadoMinutos = realizadoDoDia.reduce((soma, linha) => soma + (linha.minutos ?? 0), 0);
      const minutosEmFalta = faltasDoDia.reduce((soma, falta) => soma + (falta.minutos ?? 0), 0);

      let estado: EstadoDiaRelatorio = "normal";
      let categoriaAusencia: CategoriaAusencia | null = null;

      // Uma ausencia aprovada de dia inteiro substitui o dia -- a mesma
      // hierarquia do Excel de referencia (Descanso/Feriado/Ferias no lugar
      // do horario). Fraccoes parciais nao substituem: o dia continua a
      // mostrar as horas, para nao esconder o que se trabalhou.
      if (ausenciaDoDia && ausenciaDoDia.fraccao_dia >= 1) {
        estado = "ausencia";
        categoriaAusencia = categoriaPorTipoId.get(ausenciaDoDia.tipo_id) ?? null;
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
        realizadoMinutos < planeadoMinutos &&
        minutosEmFalta === 0 &&
        // Uma ausencia aprovada PARCIAL (ex. fraccao_dia 0.5) nao cai no ramo
        // "ausencia" acima (que so substitui o dia inteiro), mas ja explica
        // parte do buraco -- nao deve ficar "por esclarecer" so porque a
        // fraccao nao chega a 1.
        !ausenciaDoDia &&
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
      const horasExtraMinutos = Math.max(realizadoMinutos - planeadoMinutos, 0);
      const excedenteIntervalos = subtrairIntervalos(
        realizadoIntervalosDoDia,
        planeadoIntervalosRelatorio,
      );
      const minutosNoturnosDoExcedente = excedenteIntervalos.reduce(
        (soma, intervalo) => soma + minutosNoturnosDoPeriodo(intervalo),
        0,
      );

      linhas.push({
        iso,
        diaSemana: diaSemanaDe(iso),
        estado,
        categoriaAusencia,
        planeadoMinutos,
        realizadoMinutos,
        planeadoIntervalos: planeadoIntervalosRelatorio,
        realizadoIntervalos: realizadoIntervalosDoDia,
        obraHoras: obraDoDia.reduce((soma, obra) => soma + Number(obra.horas), 0),
        temFalta: faltasDoDia.length > 0,
        minutosEmFalta,
        horasExtraMinutos,
        horasExtraNoturnasMinutos: Math.min(horasExtraMinutos, minutosNoturnosDoExcedente),
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
    feriados,
    timezoneDaOrganizacao,
    de,
    ultimoDia,
  ]);

  const totais = useMemo<TotaisRelatorioMensal>(
    () =>
      dias.reduce<TotaisRelatorioMensal>(
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
            planeadoMinutos: acc.planeadoMinutos + dia.planeadoMinutos,
            realizadoMinutos: acc.realizadoMinutos + dia.realizadoMinutos,
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
          };
        },
        {
          diasTrabalhados: 0,
          planeadoMinutos: 0,
          realizadoMinutos: 0,
          obraHoras: 0,
          diasFeriadoTrabalhados: 0,
          diasComFaltaCompleta: 0,
          diasComFaltaCompletaRegistada: 0,
          diasComFaltaIncompleta: 0,
          diasComFaltaIncompletaRegistada: 0,
          horasExtraMinutos: 0,
          horasExtraNoturnasMinutos: 0,
        },
      ),
    [dias],
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
    planeadoRecusado: planeado.recusado,
    loading,
    saving,
    recarregar: load,
    registarObra,
    anularObra,
  };
}

export type RelatorioAssiduidadeMensal = ReturnType<typeof useRelatorioAssiduidadeMensal>;
