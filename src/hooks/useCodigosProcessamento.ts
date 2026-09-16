/**
 * Catalogo de codigos de processamento salarial (`hr_codigos_processamento`,
 * 20261201190000) -- leitura/escrita directa por RLS, sem RPC (a tabela nao
 * bloqueia INSERT/UPDATE directo a `authenticated`; a RLS ja distingue
 * transversais de proprios). Segue o padrao de `useModelosDocumentosRH.ts`.
 *
 * SO CATALOGO/CONFIGURACAO -- SEM CALCULO NENHUM
 * -------------------------------------------------
 * Este hook nao liga codigo nenhum a assiduidade ou a picagens. Isso fica
 * para uma fase seguinte, confirmada com o utilizador.
 *
 * NUNCA SE APAGA UM CODIGO -- SO SE (DES)ACTIVA
 * -------------------------------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE; este hook por isso nao
 * expoe `eliminar` nenhum -- so `definirActivo`.
 *
 * SO SE CRIA CODIGO PROPRIO DA ORGANIZACAO ACTIVA
 * ---------------------------------------------------
 * `criar` grava sempre `organization_id = activeCompany.id` -- a RLS ja
 * rejeita qualquer tentativa de criar um codigo transversal
 * (`organization_id IS NULL`) pelo ecra. Os codigos transversais (100, 200)
 * sao so leitura aqui, semeados pela migracao.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import type { HrCodigoProcessamento } from "@/types/hr";

const COLUNAS =
  "id, organization_id, codigo, nome, descricao, activo, created_at, updated_at";

export interface NovoCodigoProcessamento {
  codigo: string;
  nome: string;
  descricao: string | null;
}

export function useCodigosProcessamento() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["hr-codigos-processamento", orgId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<HrCodigoProcessamento[]> => {
      if (!orgId) return [];
      // A RLS ja devolve so os transversais (organization_id NULL) mais os
      // proprios desta organizacao -- sem filtro adicional a fazer aqui.
      const { data: linhas, error: erro } = await hrFrom("hr_codigos_processamento")
        .select(COLUNAS)
        .order("organization_id", { ascending: true, nullsFirst: true })
        .order("codigo", { ascending: true });
      if (erro) {
        if (isPermissionError(erro)) return [];
        throw erro;
      }
      return (linhas ?? []) as HrCodigoProcessamento[];
    },
    enabled: !!orgId,
  });

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, orgId]);

  const criarMutation = useMutation({
    mutationFn: async (novo: NovoCodigoProcessamento) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_codigos_processamento").insert({
        organization_id: orgId,
        codigo: novo.codigo,
        nome: novo.nome,
        descricao: novo.descricao,
        created_by: businessUserId,
        updated_by: businessUserId,
      });
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  const alternarActivoMutation = useMutation({
    mutationFn: async (args: { id: string; activo: boolean }) => {
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_codigos_processamento")
        .update({ activo: args.activo, updated_by: businessUserId })
        .eq("id", args.id);
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  return {
    codigos: data ?? [],
    isLoading,
    error,
    isSaving: criarMutation.isPending || alternarActivoMutation.isPending,
    criar: criarMutation.mutateAsync,
    /** Nunca `eliminar` -- so activar/desactivar. Ver nota no cabecalho. */
    definirActivo: (id: string, activo: boolean) => alternarActivoMutation.mutateAsync({ id, activo }),
  };
}
