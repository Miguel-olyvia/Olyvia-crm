import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { useFontePessoas } from "./useFontePessoas";

export const negociosLixoQueryKey = (organizationId: string, pessoaId: string) => ["negocios-lixo", organizationId, pessoaId] as const;

export interface EventoLixoNegocio {
  id: string;
  tipo: "apagado" | "restaurado";
  /** O instante (ISO). */
  em: string;
}

export interface NegocioNoLixo {
  id: string;
  titulo: string;
  estado: "aberto" | "ganho" | "perdido";
  /** O instante (ISO) em que foi para o lixo. */
  apagadoEm: string | null;
  /** Os eventos «apagado» e «restaurado», do mais antigo para o mais recente. */
  eventos: EventoLixoNegocio[];
}

export interface LixoDosNegocios {
  itens: NegocioNoLixo[];
  isLoading: boolean;
  /** A leitura falhou: o lixo vazio que se vê não quer dizer que não haja nada. */
  isError: boolean;
  repetir: () => void;
}

/** Quantos negócios do lixo se leem de uma vez (o mais recente primeiro). */
const LIMITE = 50;
const SEM_ITENS: NegocioNoLixo[] = [];

type Linha = Record<string, unknown>;
type Consulta = PromiseLike<{ data: unknown; error: unknown }>;
const db = (): { from: (tabela: string) => any } => supabase as unknown as { from: (tabela: string) => any };

async function ler(consulta: Consulta): Promise<Linha[]> {
  const { data, error } = await consulta;
  if (error) {
    captureFlowError(error, "pessoas-neg");
    throw error instanceof Error ? error : new Error("falha a ler o lixo de negócios");
  }
  return Array.isArray(data) ? data.filter((l): l is Linha => typeof l === "object" && l !== null && !Array.isArray(l)) : [];
}

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const estadoDe = (v: unknown): NegocioNoLixo["estado"] => (v === "ganho" || v === "perdido" ? v : "aberto");

function eventosDe(linhas: Linha[], negocioId: string): EventoLixoNegocio[] {
  return linhas.flatMap((e): EventoLixoNegocio[] => {
    const id = texto(e.id);
    const em = texto(e.created_at);
    if (!id || !em || e.negocio_id !== negocioId || (e.tipo !== "apagado" && e.tipo !== "restaurado")) return [];
    return [{ id, tipo: e.tipo, em }];
  }).sort((a, b) => a.em.localeCompare(b.em));
}

/** Os negócios da pessoa que estão no lixo (preso à pessoa e à organização, só os apagados) e os eventos apagado e restaurado de cada um. */
async function lerLixo(organizationId: string, pessoaId: string): Promise<NegocioNoLixo[]> {
  const negocios = await ler(
    db().from("negocios").select("id, titulo, estado, deleted_at")
      .eq("entity_id", pessoaId).eq("organization_id", organizationId).not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }).limit(LIMITE),
  );
  const ids = negocios.flatMap((n) => (typeof n.id === "string" ? [n.id] : []));
  if (ids.length === 0) return SEM_ITENS;
  const eventos = await ler(
    db().from("negocio_eventos").select("id, negocio_id, tipo, created_at")
      .in("negocio_id", ids).in("tipo", ["apagado", "restaurado"]).order("created_at", { ascending: true }),
  );
  return negocios.flatMap((n): NegocioNoLixo[] => {
    const id = texto(n.id);
    if (!id) return [];
    return [{ id, titulo: texto(n.titulo) ?? "", estado: estadoDe(n.estado), apagadoEm: texto(n.deleted_at), eventos: eventosDe(eventos, id) }];
  });
}

/**
 * O lixo de negócios de uma pessoa, para o filtro «Lixo» da ficha. A ficha (`neg_ficha_pessoa`) não devolve negócios apagados, por isso lê-se
 * à parte, por SELECT (a RLS de `negocios` e `negocio_eventos` decide o que se vê). Só lê com `ativo` (filtro aberto) e em modo real.
 */
export function useNegociosNoLixo(pessoaId: string, ativo: boolean): LixoDosNegocios {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: negociosLixoQueryKey(organizationId ?? "", pessoaId),
    queryFn: () => lerLixo(organizationId as string, pessoaId),
    enabled: ativo && organizationId !== null && pessoaId !== "",
    // Quem abre o filtro quer o que está no lixo AGORA (outro utilizador pode ter apagado ou restaurado).
    staleTime: 0,
    retry: 1,
  });
  return { itens: consulta.data ?? SEM_ITENS, isLoading: consulta.isLoading, isError: consulta.isError, repetir: () => { void consulta.refetch(); } };
}
