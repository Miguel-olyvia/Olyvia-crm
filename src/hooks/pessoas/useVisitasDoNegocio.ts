// As visitas REAIS de um negócio: os schedule_items ligados a ele (negocio_id, o que neg_guardar_visita com p_negocio_id grava), com quem vai (schedule_item_assignees).
// É a fonte única do passo Visitas: o que o ecrã mostra, conta e age vem daqui. Só leitura. Uma leitura falhada diz-se (isError), nunca passa por «sem visitas».
// As visitas «sombra» (uma cópia que o neg_guardar_negocio faz de um espelho da Emylia) não contam: ver `semSombras`.
import { useQuery } from "@tanstack/react-query";
import type { TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { supabase } from "@/integrations/supabase/client";
import { tipoDaBase } from "./tipoVisitaChave";
import { diaLisboa, horaLisboa } from "./tempoLisboa";
import { useFontePessoas } from "./useFontePessoas";

export type EstadoVisitaCrm = "marcada" | "feita" | "cancelada";

export interface VisitaDoNegocio {
  id: string;
  boardId: string | null;
  inicio: string;
  fim: string;
  minutos: number;
  estado: EstadoVisitaCrm;
  tipo: TipoVisitaNegocio | null;
  /** O número que a Emylia deu à visita (visita_numero), se a cópia da Emylia a tocou; as marcadas pelo CRM não têm. */
  numeroEmylia: number | null;
  titulo: string;
  notas: string | null;
  /** A morada da visita, em texto (o `location` da agenda). */
  local: string | null;
  /** schedule_resources.id de quem vai. */
  recursos: string[];
  /** AAAA-MM-DD e HH:MM, de Lisboa. */
  dia: string;
  hora: string;
}

interface LinhaItem {
  id: string; board_id: string | null; title: string | null; status: string | null; start_datetime: string; end_datetime: string;
  duration_minutes: number | null; visit_kind: string | null; visita_numero: number | null; notes: string | null; location: string | null;
}
interface LinhaQuem { item_id: string; resource_id: string }

const COLUNAS = "id, board_id, title, status, start_datetime, end_datetime, duration_minutes, visit_kind, visita_numero, notes, location";
const STALE_TIME_MS = 15_000;

export const visitasDoNegocioQueryKey = (org: string | null, negocioId: string | null) => ["neg-visitas-do-negocio", org, negocioId] as const;

const estadoDe = (status: string | null): EstadoVisitaCrm => (status === "completed" ? "feita" : status === "cancelled" ? "cancelada" : "marcada");
const minutosEntre = (a: string, b: string): number => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60_000));

async function lerVisitas(org: string, negocioId: string): Promise<VisitaDoNegocio[]> {
  // `negocio_id`, `visit_kind` e `visita_numero` ainda não estão nos tipos gerados: a leitura fica fora dos tipos até se regenerarem.
  const cliente = supabase as unknown as { from: (t: string) => any };
  const itens = await cliente.from("schedule_items").select(COLUNAS).eq("organization_id", org).eq("negocio_id", negocioId).order("start_datetime");
  if (itens.error) throw itens.error;
  const linhas = (itens.data ?? []) as LinhaItem[];
  const ids = linhas.map((l) => l.id);
  const quem = new Map<string, string[]>();
  if (ids.length > 0) {
    const r = await cliente.from("schedule_item_assignees").select("item_id, resource_id").in("item_id", ids);
    if (r.error) throw r.error;
    for (const q of (r.data ?? []) as LinhaQuem[]) quem.set(q.item_id, [...(quem.get(q.item_id) ?? []), q.resource_id]);
  }
  return linhas.map((l) => ({
    id: l.id, boardId: l.board_id, inicio: l.start_datetime, fim: l.end_datetime,
    minutos: l.duration_minutes ?? minutosEntre(l.start_datetime, l.end_datetime), estado: estadoDe(l.status), tipo: tipoDaBase(l.visit_kind),
    numeroEmylia: l.visita_numero, titulo: l.title ?? "", notas: l.notes, local: l.location, recursos: quem.get(l.id) ?? [],
    dia: diaLisboa(l.start_datetime) ?? "", hora: horaLisboa(l.start_datetime) ?? "",
  }));
}

/**
 * Tira as «sombras»: o neg_guardar_negocio copia para a agenda cada visita do espelho da Emylia (visita_numero preenchido). Se o espelho já aponta a visita do
 * CRM (`marcas`: número da Emylia → id da visita do CRM) e a linha com esse número é OUTRA, é a sombra e não se mostra. Linhas com número da Emylia sem marca
 * são visitas antigas só da Emylia (essas mostram-se a partir do espelho, só de leitura, e não daqui).
 */
export function semSombras(visitas: readonly VisitaDoNegocio[], marcas: ReadonlyMap<number, string>): VisitaDoNegocio[] {
  return visitas.filter((v) => v.numeroEmylia === null || marcas.get(v.numeroEmylia) === v.id);
}

export interface VisitasLidas {
  visitas: VisitaDoNegocio[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useVisitasDoNegocio(negocioId: string | null): VisitasLidas {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: visitasDoNegocioQueryKey(org, negocioId), queryFn: () => lerVisitas(org as string, negocioId as string),
    enabled: org !== null && negocioId !== null, staleTime: STALE_TIME_MS,
  });
  return {
    visitas: consulta.data ?? [],
    isLoading: org !== null && negocioId !== null && consulta.isLoading,
    isError: org !== null && negocioId !== null && consulta.isError,
    refetch: () => { void consulta.refetch(); },
  };
}

/** A entidade (a pessoa) a que o negócio pertence; precisa-se dela para marcar a visita (neg_guardar_visita pede p_entity_id). */
export function useEntidadeDoNegocio(negocioId: string | null, conhecida: string | null): { entityId: string | null; isLoading: boolean; isError: boolean } {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const precisa = org !== null && negocioId !== null && conhecida === null;
  const consulta = useQuery({
    queryKey: ["neg-entidade-do-negocio", org, negocioId], enabled: precisa, staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const cliente = supabase as unknown as { from: (t: string) => any };
      const r = await cliente.from("negocios").select("entity_id").eq("organization_id", org).eq("id", negocioId).maybeSingle();
      if (r.error) throw r.error;
      return (r.data as { entity_id: string | null } | null)?.entity_id ?? null;
    },
  });
  if (conhecida !== null) return { entityId: conhecida, isLoading: false, isError: false };
  return { entityId: consulta.data ?? null, isLoading: precisa && consulta.isLoading, isError: precisa && consulta.isError };
}
