// As horas livres REAIS para marcar uma visita: pergunta à base, recurso a recurso, o que cada um tem livre nesse dia (get_resource_available_slots, SEMPRE com
// p_organization_id), fica só com as horas que todos os recursos têm livres e corta pelo horário da organização (horasLivresVisita.ts). Nada se inventa: sem
// recursos, sem dia, dia fechado, ou leitura falhada, o hook diz porquê em `estado`.
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  aplicarAlmoco, comHoraAtual, horasDoRecurso, intersetar, motivoDiaFechado, type FeriadosOrg, type HorarioOrg, type MotivoDiaFechado, type SlotDb,
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
}

const STALE_TIME_MS = 30_000;

async function lerSlots(org: string, recurso: string, dia: string, minutos: number): Promise<SlotDb[]> {
  // p_min_advance_hours a 0: o CRM marca visitas para daqui a pouco (o de uma página pública não); o que já passou corta-se em horasDoRecurso.
  const { data, error } = await supabase.rpc("get_resource_available_slots", {
    p_date: dia, p_duration_minutes: minutos, p_min_advance_hours: 0, p_organization_id: org, p_resource_id: recurso,
  });
  if (error) throw error;
  return (data ?? []) as SlotDb[];
}

export function useHorasLivresVisita(e: Entrada): HorasLivres {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const fechado = e.dia !== "" ? motivoDiaFechado(e.dia, e.horario, e.feriados) : null;
  const ativo = org !== null && e.recursos.length > 0 && e.dia !== "" && fechado === null && e.horarioPronto && e.duracaoMin > 0;
  const comPausaMin = e.horario.almoco ? e.duracaoMin + e.horario.almoco.minutos : 0;
  // Uma consulta por recurso (a duração da visita) e, com almoço somado, outra por recurso (a visita mais a pausa).
  const consultas = useQueries({
    queries: [
      ...e.recursos.map((r) => ({
        queryKey: ["neg-horas-livres-visita", org, r, e.dia, e.duracaoMin] as const,
        queryFn: () => lerSlots(org as string, r, e.dia, e.duracaoMin),
        enabled: ativo, staleTime: STALE_TIME_MS,
      })),
      ...e.recursos.map((r) => ({
        queryKey: ["neg-horas-livres-visita", org, r, e.dia, comPausaMin] as const,
        queryFn: () => lerSlots(org as string, r, e.dia, comPausaMin),
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
  let horas: string[] = [];
  if (ativo && !dadosDos.some((d) => d === undefined) && !dadosPausa.some((d) => d === undefined)) {
    const agora = Date.now();
    const porRecurso = dadosDos.map((s) => horasDoRecurso(s as SlotDb[], e.dia, e.duracaoMin, e.horario, agora));
    const livres = intersetar(porRecurso);
    const comPausa = dadosPausa.map((s) => horasDoRecurso(s as SlotDb[], e.dia, comPausaMin, e.horario, agora));
    horas = comHoraAtual(aplicarAlmoco(livres, e.duracaoMin, e.horario.almoco, comPausa), e.dia, e.atual ?? null, e.horario);
  }
  const refetch = (): void => { todas.forEach((q) => { void q.refetch(); }); };

  let estado: EstadoHorasLivres;
  if (e.recursos.length === 0) estado = { k: "sem-recursos" };
  else if (e.dia === "") estado = { k: "sem-dia" };
  else if (fechado) estado = { k: "dia-fechado", motivo: fechado };
  else if (!e.horarioPronto || aLer) estado = { k: "a-ler" };
  else if (comErro) estado = { k: "erro" };
  else estado = horas.length === 0 ? { k: "sem-horas" } : { k: "pronto" };
  return { horas: estado.k === "pronto" ? horas : [], estado, refetch };
}
