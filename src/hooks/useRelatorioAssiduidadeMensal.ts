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

export type EstadoDiaRelatorio = "normal" | "descanso" | "feriado" | "ausencia";

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
}

export interface TotaisRelatorioMensal {
  diasTrabalhados: number;
  planeadoMinutos: number;
  realizadoMinutos: number;
  obraHoras: number;
  /** Dias de feriado em que a pessoa trabalhou mesmo assim (realizado > 0). */
  diasFeriadoTrabalhados: number;
  /**
   * Falta completa: a falta cobre todo o planeado do dia (so faz sentido
   * quando havia planeado -- um dia sem horario nenhum nao tem falta a medir).
   * Falta incompleta: cobre uma parte, a pessoa trabalhou o resto.
   */
  diasComFaltaCompleta: number;
  diasComFaltaIncompleta: number;
  horasExtraMinutos: number;
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
      ]);

      setRealizado(oRealizado);
      setFaltas(asFaltas);
      setPlaneado(oPlaneado);
      setAusenciasDias(osDiasDeAusencia);
      setAusenciasTipos(osTiposDeAusencia);
      setObras(asObras);
      setFeriados(indexarFeriados(osFeriados.linhas));
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

  const dias = useMemo<DiaRelatorioMensal[]>(() => {
    const realizadoEmVigor = emVigor(realizado.linhas, LEITOR_REALIZADO).filter(
      (linha) => !linha.deleted_at,
    );
    const faltasEmVigor = emVigor(faltas.linhas, LEITOR_FALTAS);

    const linhas: DiaRelatorioMensal[] = [];
    for (let dia = 1; dia <= ultimoDia; dia += 1) {
      const iso = `${de.slice(0, 8)}${String(dia).padStart(2, "0")}`;

      const realizadoDoDia = realizadoEmVigor.filter((linha) => linha.data === iso);
      const faltasDoDia = faltasEmVigor.filter((falta) => falta.data === iso);
      const obraDoDia = obras.linhas.filter((obra) => obra.data === iso && !obra.anulado_em);
      const { naoTrabalha } = leituraDoPlaneado(planeado.linhas, iso);
      const ausenciaDoDia = ausenciaAprovadaPorDia.get(iso) ?? null;

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
      }

      const planeadoMinutos = minutosPlaneadosDoDia(planeado.linhas, iso);
      const realizadoMinutos = realizadoDoDia.reduce((soma, linha) => soma + (linha.minutos ?? 0), 0);
      const { intervalos: planeadoIntervalos } = leituraDoPlaneado(planeado.linhas, iso);

      linhas.push({
        iso,
        diaSemana: diaSemanaDe(iso),
        estado,
        categoriaAusencia,
        planeadoMinutos,
        realizadoMinutos,
        planeadoIntervalos: planeadoIntervalos.map((intervalo) => ({
          hora_inicio: intervalo.hora_inicio,
          hora_fim: intervalo.hora_fim,
        })),
        realizadoIntervalos: intervalosOrdenados(realizadoDoDia),
        obraHoras: obraDoDia.reduce((soma, obra) => soma + Number(obra.horas), 0),
        temFalta: faltasDoDia.length > 0,
        minutosEmFalta: faltasDoDia.reduce((soma, falta) => soma + (falta.minutos ?? 0), 0),
        horasExtraMinutos: Math.max(realizadoMinutos - planeadoMinutos, 0),
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
    de,
    ultimoDia,
  ]);

  const totais = useMemo<TotaisRelatorioMensal>(
    () =>
      dias.reduce<TotaisRelatorioMensal>(
        (acc, dia) => {
          // Falta completa so faz sentido com planeado > 0: sem horario nesse
          // dia nao ha "todo o planeado" para a falta cobrir.
          const faltaCompleta =
            dia.temFalta && dia.planeadoMinutos > 0 && dia.minutosEmFalta >= dia.planeadoMinutos;
          const faltaIncompleta =
            dia.temFalta && dia.planeadoMinutos > 0 && dia.minutosEmFalta > 0 && !faltaCompleta;

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
            diasComFaltaCompleta: acc.diasComFaltaCompleta + (faltaCompleta ? 1 : 0),
            diasComFaltaIncompleta: acc.diasComFaltaIncompleta + (faltaIncompleta ? 1 : 0),
            horasExtraMinutos: acc.horasExtraMinutos + (contaParaTotais ? dia.horasExtraMinutos : 0),
          };
        },
        {
          diasTrabalhados: 0,
          planeadoMinutos: 0,
          realizadoMinutos: 0,
          obraHoras: 0,
          diasFeriadoTrabalhados: 0,
          diasComFaltaCompleta: 0,
          diasComFaltaIncompleta: 0,
          horasExtraMinutos: 0,
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
