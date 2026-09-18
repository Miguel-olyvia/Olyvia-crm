/**
 * Clausulas reutilizaveis de RH (`pessoas_documentos_clausulas`, 20261202010000):
 * paragrafos-tipo (periodo experimental, confidencialidade, RGPD, ...) para
 * colar dentro do corpo de um modelo de documento. Segue exactamente o padrao
 * de `useModelosDocumentosRH.ts` -- leitura/escrita directa por
 * `organization_id`, mesmas permissoes (hr.pessoas.documentos.modelos.view/.edit),
 * nunca se apaga (so `activo`).
 *
 * INSERCAO POR COPIA, NAO POR REFERENCIA
 * -----------------------------------------
 * Este hook nao tem nenhum "usar clausula no modelo X": a insercao e feita no
 * editor (`SelectorClausulasRH.tsx`), copiando `corpo_html` para dentro do
 * corpo do modelo. Este hook so gere a biblioteca em si.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrFrom } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

const COLUNAS_CLAUSULA_COMPLETA =
  "id, organization_id, nome, categoria, corpo_html, activo, created_at, updated_at";

export interface ClausulaDocumentoRH {
  id: string;
  organization_id: string;
  nome: string;
  categoria: string | null;
  corpo_html: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface NovaClausulaDocumentoRH {
  nome: string;
  categoria: string | null;
  corpo_html: string;
}

export type EdicaoClausulaDocumentoRH = NovaClausulaDocumentoRH & { id: string };

export function useClausulasDocumentosRH() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["hr-clausulas-documentos", orgId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<ClausulaDocumentoRH[]> => {
      if (!orgId) return [];
      const { data: linhas, error: erro } = await hrFrom("pessoas_documentos_clausulas")
        .select(COLUNAS_CLAUSULA_COMPLETA)
        .eq("organization_id", orgId)
        .order("nome", { ascending: true });
      if (erro) throw erro;
      return (linhas ?? []) as ClausulaDocumentoRH[];
    },
    enabled: !!orgId,
  });

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, orgId]);

  const criarMutation = useMutation({
    mutationFn: async (nova: NovaClausulaDocumentoRH) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("pessoas_documentos_clausulas").insert({
        organization_id: orgId,
        nome: nova.nome,
        categoria: nova.categoria,
        corpo_html: nova.corpo_html,
        created_by: businessUserId,
        updated_by: businessUserId,
      });
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  const editarMutation = useMutation({
    mutationFn: async (edicao: EdicaoClausulaDocumentoRH) => {
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("pessoas_documentos_clausulas")
        .update({
          nome: edicao.nome,
          categoria: edicao.categoria,
          corpo_html: edicao.corpo_html,
          updated_by: businessUserId,
        })
        .eq("id", edicao.id);
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  const alternarActivoMutation = useMutation({
    mutationFn: async (args: { id: string; activo: boolean }) => {
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("pessoas_documentos_clausulas")
        .update({ activo: args.activo, updated_by: businessUserId })
        .eq("id", args.id);
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  return {
    clausulas: data ?? [],
    isLoading,
    error,
    isSaving:
      criarMutation.isPending || editarMutation.isPending || alternarActivoMutation.isPending,
    criar: criarMutation.mutateAsync,
    editar: editarMutation.mutateAsync,
    /** Nunca `eliminar` -- so activar/desactivar, mesma razao dos modelos. */
    definirActivo: (id: string, activo: boolean) => alternarActivoMutation.mutateAsync({ id, activo }),
  };
}
