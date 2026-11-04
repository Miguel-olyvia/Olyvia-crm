// As horas livres REAIS para marcar uma visita: pergunta à base, recurso a recurso, o que cada um tem livre nesse dia (get_resource_available_slots, SEMPRE com
// p_organization_id), fica só com as horas que todos os recursos têm livres e corta pelo horário da organização (horasLivresVisita.ts). Nada se inventa: sem
// recursos, sem dia, dia fechado, ou leitura falhada, o hook diz porquê em `estado`.
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DIA_TODO, aplicarAlmoco, comHoraAtual, ehFeriado, horasDoRecurso, intersetar, motivoDiaFechado, type FeriadosOrg, type HorarioOrg, type MotivoDiaFechado, type SlotDb,
} from "./horasLivresVisita";
import { useFontePessoas } from "./useFontePessoas";

export type EstadoHorasLivres =
  | { k: "sem-recursos" }
  | { k: "sem-dia" }
  | { k: "dia-fechado"; motivo: MotivoDiaFechado }
  | { k: "a-ler" }
  | { k: "erro" }
  | { k: "sem-horas" }
  | { k: "pronto" };

export interface HorasLivres {
  horas: string[];
  estado: EstadoHorasLivres;
  refetch: () => void;
  /** 4/11: as horas são do dia todo (neg_horas_livres_visita); false enquanto a base não tem a função (vale o horário da organização). */
  diaTodo: boolean;
}

interface Entrada {
  recursos: readonly string[];
  /** AAAA-MM-DD; vazio = ainda não escolhido. */
  dia: string;
  duracaoMin: number;
  horario: HorarioOrg;
  feriados: FeriadosOrg;
  /** O horário da organização ainda se está a ler ou falhou: não se mostram horas calculadas com a omissão. */
  horarioPronto: boolean;
  /** Ao remarcar: a hora que a visita já tem fica escolhível. */
  atual?: { dia: string; hora: string } | null;
  /** Ao remarcar: a visita que se remarca não ocupa as horas dela. */
  excluirId?: string | null;
}

const STALE_TIME_MS = 30_000;

const semFuncao = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";
interface SlotsLidos { slots: SlotDb[]; diaTodo: boolean }

export async function lerSlots(org: string, recurso: string, dia: string, minutos: number, excluir: string | null): Promise<SlotsLidos> {
  // 4/11 (20270106400000): as horas da visita do negócio são do dia todo, sem o horário da organização (só o que ocupa quem vai)
  const novo = await supabase.rpc("neg_horas_livres_visita" as never, {
    p_resource_id: recurso, p_date: dia, p_duration_minutes: minutos, p_organization_id: org, p_exclude_item_id: excluir,
  } as never);
  if (!novo.error) return { slots: ((novo.data as unknown) ?? []) as SlotDb[], diaTodo: true };
  if (!semFuncao(novo.error)) throw novo.error;
  // sem a função na base (por colar): como antes, com o horário da organização.
  // p_min_advance_hours a 0: o CRM marca visitas para daqui a pouco (o de uma página pública não); o que já passou corta-se em horasDoRecurso.
  const { data, error } = await supabase.rpc("get_resource_available_slots", {
    p_date: dia, p_duration_minutes: minutos, p_min_advance_hours: 0, p_organization_id: org, p_resource_id: recurso,
  });
  if (error) throw error;
  return { slots: (data ?? []) as SlotDb[], diaTodo: false };
}

export function useHorasLivresVisita(e: Entrada): HorasLivres {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  // os feriados fecham sempre; os dias em que a organização não trabalha só sem as horas do dia todo (vê-se depois de ler)
  const feriado = e.dia !== "" && ehFeriado(e.dia, e.feriados);
  const ativo = org !== null && e.recursos.length > 0 && e.dia !== "" && !feriado && e.horarioPronto && e.duracaoMin > 0;
  const excluir = e.excluirId ?? null;
  const comPausaMin = e.horario.almoco ? e.duracaoMin + e.horario.almoco.minutos : 0;
  // Uma consulta por recurso (a duração da visita) e, com almoço somado, outra por recurso (a visita mais a pausa).
  const consultas = useQueries({
    queries: [
      ...e.recursos.map((r) => ({
        queryKey: ["neg-horas-livres-visita", org, r, e.dia, e.duracaoMin, excluir] as const,
        queryFn: () => lerSlots(org as string, r, e.dia, e.duracaoMin, excluir),
        enabled: ativo, staleTime: STALE_TIME_MS,
      })),
      ...e.recursos.map((r) => ({
        queryKey: ["neg-horas-livres-visita", org, r, e.dia, comPausaMin, excluir] as const,
        queryFn: () => lerSlots(org as string, r, e.dia, comPausaMin, excluir),
        enabled: ativo && comPausaMin > 0, staleTime: STALE_TIME_MS,
      })),
    ],
  });
  const n = e.recursos.length;
  const dos = consultas.slice(0, n);
  const pausas = comPausaMin > 0 ? consultas.slice(n) : [];
  const todas = [...dos, ...pausas];
  const aLer = todas.some((q) => q.isLoading || q.isFetching);
  const comErro = todas.some((q) => q.isError);
  const dadosDos = dos.map((q) => q.data);
  const dadosPausa = pausas.map((q) => q.data);
  // Sem useMemo: o cálculo é barato e um memo com dependências de tamanho variável (uma por recurso) ou com `atual` (objeto novo a cada render) não poupa nada.
  // com a função nova, o dia todo (sem horário nem almoço); sem ela, o horário da organização
  const diaTodo = !dadosDos.some((d) => d !== undefined && !d.diaTodo);
  const h = diaTodo ? DIA_TODO : e.horario;
  const fechado = e.dia === "" ? null : feriado ? "feriado" as const : diaTodo ? null : motivoDiaFechado(e.dia, e.horario, e.feriados);
  let horas: string[] = [];
  if (ativo && fechado === null && !dadosDos.some((d) => d === undefined) && (diaTodo || !dadosPausa.some((d) => d === undefined))) {
    const agora = Date.now();
    const porRecurso = dadosDos.map((s) => horasDoRecurso((s as SlotsLidos).slots, e.dia, e.duracaoMin, h, agora));
    const livres = intersetar(porRecurso);
    const comPausa = diaTodo ? [] : dadosPausa.map((s) => horasDoRecurso((s as SlotsLidos).slots, e.dia, comPausaMin, h, agora));
    horas = comHoraAtual(diaTodo ? livres : aplicarAlmoco(livres, e.duracaoMin, h.almoco, comPausa), e.dia, e.atual ?? null, h);
  }
  const refetch = (): void => { todas.forEach((q) => { void q.refetch(); }); };

  let estado: EstadoHorasLivres;
  if (e.recursos.length === 0) estado = { k: "sem-recursos" };
  else if (e.dia === "") estado = { k: "sem-dia" };
  else if (fechado) estado = { k: "dia-fechado", motivo: fechado };
  else if (!e.horarioPronto || aLer) estado = { k: "a-ler" };
  else if (comErro) estado = { k: "erro" };
  else estado = horas.length === 0 ? { k: "sem-horas" } : { k: "pronto" };
  return { horas: estado.k === "pronto" ? horas : [], estado, refetch, diaTodo };
}

/**
 * 4/11 (Rúben): quem pode ir à visita em cada dia: as horas livres de cada recurso em cada dia pedido (as mesmas leituras e a mesma cache de
 * useHorasLivresVisita). Serve para mostrar, depois da data, os comerciais livres e, sem nenhum, sugerir técnicos ou outros dias.
 */
export function useHorasPorRecurso(e: {
  recursos: readonly string[]; dias: readonly string[]; duracaoMin: number; horario: HorarioOrg; feriados: FeriadosOrg; horarioPronto: boolean;
  excluirId?: string | null; ativo?: boolean;
}): { horas: (dia: string, recurso: string) => string[] | undefined; aLer: boolean; comErro: boolean } {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const excluir = e.excluirId ?? null;
  const pares = e.dias.filter((dia) => !ehFeriado(dia, e.feriados)).flatMap((dia) => e.recursos.map((r) => ({ dia, r })));
  const consultas = useQueries({
    queries: pares.map(({ dia, r }) => ({
      queryKey: ["neg-horas-livres-visita", org, r, dia, e.duracaoMin, excluir] as const,
      queryFn: () => lerSlots(org as string, r, dia, e.duracaoMin, excluir),
      enabled: (e.ativo ?? true) && org !== null && e.horarioPronto && e.duracaoMin > 0, staleTime: STALE_TIME_MS,
    })),
  });
  const agora = Date.now();
  const mapa = new Map<string, string[]>();
  pares.forEach(({ dia, r }, i) => {
    const lido = consultas[i]?.data;
    if (!lido) return;
    const h = lido.diaTodo ? DIA_TODO : e.horario;
    const fechado = !lido.diaTodo && motivoDiaFechado(dia, e.horario, e.feriados) !== null;
    mapa.set(`${dia}|${r}`, fechado ? [] : horasDoRecurso(lido.slots, dia, e.duracaoMin, h, agora));
  });
  return {
    horas: (dia, recurso) => (ehFeriado(dia, e.feriados) ? [] : mapa.get(`${dia}|${recurso}`)),
    aLer: consultas.some((q) => q.isLoading || q.isFetching),
    comErro: consultas.some((q) => q.isError),
  };
}
