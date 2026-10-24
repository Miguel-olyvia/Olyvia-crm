import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFontePessoas } from "./useFontePessoas";

/** Um quadro da agenda onde se pode marcar uma visita. */
export interface QuadroVisita {
  id: string;
  name: string;
  board_type: string | null;
  settings: Record<string, unknown> | null;
}

/** Quem (ou o quê) pode ir a uma visita. `user_id` é o `anew_users.id`. */
export interface RecursoVisita {
  id: string;
  name: string;
  resource_type: string;
  user_id: string | null;
}

export interface AgendaVisita {
  quadros: QuadroVisita[];
  recursos: RecursoVisita[];
}

export interface EscolhaPorOmissao {
  boardId: string | null;
  recursoId: string | null;
}

const STALE_TIME_MS = 60_000;
// Quadros que não servem para visitas: as ausências (a base recusa, NG009) e a frota (a base só o recusa ao alterar).
const TIPOS_QUADRO_FORA = ["time_off", "fleet"];
const COLUNAS_QUADRO = "id, name, board_type, settings";
const COLUNAS_RECURSO = "id, name, resource_type, user_id";

/** Chave da leitura, com a organização (mudar de organização não reaproveita a agenda da outra). */
export const agendaVisitaQueryKey = (organizationId: string | null | undefined) => ["neg-agenda-visita", organizationId ?? null] as const;

/**
 * O quadro serve para marcar uma visita: nem ausências nem frota, e se o quadro tem lista de campos (`allowed_modules`) tem de deixar
 * escolher recursos. É a única guarda na criação: `neg_guardar_visita` só recusa as ausências.
 */
export function quadroElegivel(quadro: QuadroVisita): boolean {
  if (quadro.board_type !== null && TIPOS_QUADRO_FORA.includes(quadro.board_type)) return false;
  const modulos = quadro.settings?.allowed_modules;
  return !Array.isArray(modulos) || modulos.includes("resources");
}

const nomeIgual = (quadro: QuadroVisita, nome: string): boolean => quadro.name.trim().toLowerCase() === nome;

/** O quadro por omissão: o de visitas, senão o chamado «Visitas», senão o único elegível; com vários e nenhum destes, nenhum. */
function quadroPorOmissao(quadros: readonly QuadroVisita[]): string | null {
  const escolhido = quadros.find((q) => q.board_type === "visits") ?? quadros.find((q) => nomeIgual(q, "visitas"));
  if (escolhido) return escolhido.id;
  return quadros.length === 1 ? quadros[0].id : null;
}

/** O recurso por omissão: o do tipo utilizador do responsável da pessoa, senão o de quem está na sessão. */
function recursoPorOmissao(recursos: readonly RecursoVisita[], responsavelUserId: string | null, utilizadorId: string | null): string | null {
  const dePessoa = (userId: string | null): RecursoVisita | undefined =>
    userId ? recursos.find((r) => r.resource_type === "user" && r.user_id === userId) : undefined;
  return (dePessoa(responsavelUserId) ?? dePessoa(utilizadorId))?.id ?? null;
}

export interface EntradaOmissao {
  quadros: readonly QuadroVisita[];
  recursos: readonly RecursoVisita[];
  responsavelUserId: string | null;
  utilizadorId: string | null;
}

/** Pura: o quadro e o recurso com que o diálogo abre. `null` quando não há escolha segura (o ecrã pede ao utilizador). */
export function escolhaPorOmissao(e: EntradaOmissao): EscolhaPorOmissao {
  return { boardId: quadroPorOmissao(e.quadros), recursoId: recursoPorOmissao(e.recursos, e.responsavelUserId, e.utilizadorId) };
}

async function lerAgenda(organizationId: string): Promise<AgendaVisita> {
  const [quadros, recursos] = await Promise.all([
    supabase.from("schedule_boards").select(COLUNAS_QUADRO).eq("organization_id", organizationId).eq("is_active", true).order("name"),
    supabase.from("schedule_resources").select(COLUNAS_RECURSO).eq("organization_id", organizationId).eq("is_active", true).order("name"),
  ]);
  if (quadros.error) throw quadros.error;
  if (recursos.error) throw recursos.error;
  return {
    quadros: ((quadros.data ?? []) as unknown as QuadroVisita[]).filter(quadroElegivel),
    recursos: (recursos.data ?? []) as unknown as RecursoVisita[],
  };
}

const VAZIA: AgendaVisita = { quadros: [], recursos: [] };

export interface AgendaVisitaLida extends AgendaVisita {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  omissao: EscolhaPorOmissao;
}

/**
 * Os quadros e os recursos para marcar ou alterar uma visita (só leitura, na organização da fonte), e a escolha por omissão.
 * `responsavelUserId` é o `anew_users.id` do responsável da pessoa. Na fonte de exemplo não lê nada.
 */
export function useAgendaVisita(responsavelUserId: string | null = null): AgendaVisitaLida {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const utilizadorId = fonte.modo === "real" ? fonte.utilizadorId ?? null : null;
  const consulta = useQuery({
    queryKey: agendaVisitaQueryKey(organizationId),
    queryFn: () => lerAgenda(organizationId as string),
    enabled: organizationId !== null,
    staleTime: STALE_TIME_MS,
  });
  const agenda = consulta.data ?? VAZIA;
  const omissao = useMemo(
    () => escolhaPorOmissao({ quadros: agenda.quadros, recursos: agenda.recursos, responsavelUserId, utilizadorId }),
    [agenda, responsavelUserId, utilizadorId],
  );
  return {
    quadros: agenda.quadros,
    recursos: agenda.recursos,
    isLoading: organizationId !== null && consulta.isLoading,
    isError: organizationId !== null && consulta.isError,
    refetch: () => { void consulta.refetch(); },
    omissao,
  };
}
