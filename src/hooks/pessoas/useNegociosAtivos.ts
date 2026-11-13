import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface NegociosAtivos {
  /** Pessoas e Negócios existem em todas as organizações: verdadeiro sempre que há organização ativa (e o hook está habilitado). */
  ativo: boolean;
  /** O momento de ganho da linha de negocio_workflow_config; null sem linha, sem permissão ou com a leitura falhada. */
  momentoGanho: string | null;
  isLoading: boolean;
  /** A leitura da configuração falhou. Já não esconde nada: só deixa o momento de ganho por saber. */
  isError: boolean;
  /** Falhou e nunca houve resposta válida (o momento de ganho fica null). Não bloqueia a página. */
  erroSemResposta: boolean;
  /** Há uma leitura em curso (a primeira ou uma repetição). */
  aRepetir: boolean;
}

// A configuração do fecho não deve ficar presa 5 minutos (o staleTime global): 60 s.
const STALE_TIME_MS = 60_000;

/** Chave da leitura, com a organização, para invalidar ao mudar de organização. */
export const negociosAtivosQueryKey = (organizationId: string | null | undefined) =>
  ["negocio-workflow-config", organizationId ?? null] as const;

// Sem linha e 42501 são resultados válidos (sem momento de ganho) e devolvem null.
// Qualquer outro erro lança: o React Query repete e não o guarda como válido.
async function lerConfig(organizationId: string): Promise<{ momentoGanho: string | null } | null> {
  // `as any` sai quando os tipos do Supabase forem regenerados.
  const { data, error } = await (supabase as any)
    .from("negocio_workflow_config")
    .select("momento_ganho")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    if (error.code === "42501") return null;
    captureFlowError(error, "pessoas-neg");
    throw error;
  }
  if (!data) return null;
  return { momentoGanho: (data.momento_ganho as string | null) ?? null };
}

/**
 * Pessoas e Negócios estão em todas as organizações (13/11, migration 20270116100000: cada organização tem
 * sempre a sua linha em `negocio_workflow_config`, criada por gatilho). `ativo` já não depende dessa linha nem
 * do resultado da leitura: é verdadeiro sempre que há organização ativa. A linha só se lê para o `momentoGanho`
 * (null sem linha, sem permissão ou com erro; `isError` distingue a falha). Uma leitura falhada nunca esconde a página.
 *
 * Contrato: o consumidor espera por `isLoading` antes de decidir. É verdadeiro
 * enquanto a organização ainda carrega e enquanto a leitura está em curso.
 * `habilitado: false` (por omissão é true) não lê nada: fica inativo e sem carregar (quem não pode ver Pessoas).
 */
export function useNegociosAtivos({ habilitado = true }: { habilitado?: boolean } = {}): NegociosAtivos {
  const { activeCompany, isLoading: empresaACarregar } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: negociosAtivosQueryKey(organizationId),
    queryFn: () => lerConfig(organizationId as string),
    enabled: habilitado && !!organizationId,
    staleTime: STALE_TIME_MS,
  });
  return {
    ativo: habilitado && !!organizationId,
    momentoGanho: data?.momentoGanho ?? null,
    isLoading: habilitado && (empresaACarregar || (!!organizationId && isLoading)),
    isError: habilitado && !!organizationId && isError,
    erroSemResposta: habilitado && !!organizationId && isError && data === undefined,
    aRepetir: habilitado && !!organizationId && isFetching,
  };
}

/** Repete a leitura da configuração do fecho; sem organização não faz nada. */
export function useRepetirNegociosAtivos(): () => void {
  const queryClient = useQueryClient();
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  return useCallback(() => {
    if (!organizationId) return;
    void queryClient.invalidateQueries({ queryKey: negociosAtivosQueryKey(organizationId) });
  }, [queryClient, organizationId]);
}
