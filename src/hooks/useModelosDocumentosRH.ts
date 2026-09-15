/**
 * Modelos de documento de RH (`pessoas_documentos_modelos`, 20261123020000):
 * corpo HTML reutilizavel para emitir contratos, adendas, declaracoes e
 * recibos a uma pessoa. Segue o padrao de
 * `useConfiguracaoObrigatoriosAdmissao.ts` -- leitura/escrita directa por
 * `organization_id`, sem RPC (a tabela nao bloqueia INSERT/UPDATE directo a
 * `authenticated`, ao contrario de `pessoas_documentos`).
 *
 * NUNCA SE APAGA UM MODELO
 * -------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE (um modelo em uso explica
 * como um documento antigo foi gerado). Este hook por isso nao expoe
 * `eliminar` nenhum -- so `activo`, que se liga/desliga por UPDATE.
 *
 * `created_by`/`updated_by` SAO ID DE NEGOCIO, NAO auth.uid()
 * ---------------------------------------------------------------------------
 * As duas colunas referenciam `anew_users(id)`, nao `auth.users(id)` -- ao
 * contrario de `organization_admissao_settings.updated_by`. Por isso usa-se
 * `resolveCurrentBusinessUserId()` (o mesmo helper que `ContractTemplates.tsx`
 * usa para `client_contract_templates.created_by`), nunca
 * `supabase.auth.getUser().id` directo.
 *
 * `corpo_html` NAO SUBSTITUI VARIAVEIS
 * -------------------------------------
 * `variaveis` e so uma lista documental (jsonb) para quem le o modelo -- sem
 * efeito automatico nenhum na emissao. `corpo_html` e copiado byte-a-byte
 * para `pessoas_documentos.corpo_html` no momento da emissao
 * (`rpc_hr_documento_emitir`). Este hook nao tenta validar nem substituir
 * tokens `{{...}}`.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrFrom } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import type { PessoaDocumentoModelo, TipoDocumentoRH } from "@/types/hr";

const COLUNAS_MODELO_COMPLETO =
  "id, organization_id, nome, tipo, corpo_html, variaveis, activo, created_at, updated_at";

/** A forma completa de uma linha, incluindo os carimbos que a lista mostra
 *  ("ultima actualizacao") mas que `PessoaDocumentoModelo` (a forma resumida
 *  usada em `usePessoaDocumentos`) nao tem. */
export interface ModeloDocumentoRH extends PessoaDocumentoModelo {
  created_at: string;
  updated_at: string;
}

export interface NovoModeloDocumentoRH {
  nome: string;
  tipo: TipoDocumentoRH;
  corpo_html: string;
  variaveis: string[];
}

export type EdicaoModeloDocumentoRH = NovoModeloDocumentoRH & { id: string };

export function useModelosDocumentosRH() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["hr-modelos-documentos", orgId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<ModeloDocumentoRH[]> => {
      if (!orgId) return [];
      // Inclui inactivos de proposito -- o ecra e que decide mostra-los ou
      // nao, para poderem ser reactivados sem passar por outro lado.
      const { data: linhas, error: erro } = await hrFrom("pessoas_documentos_modelos")
        .select(COLUNAS_MODELO_COMPLETO)
        .eq("organization_id", orgId)
        .order("nome", { ascending: true });
      if (erro) throw erro;
      return (linhas ?? []) as ModeloDocumentoRH[];
    },
    enabled: !!orgId,
  });

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, orgId]);

  const criarMutation = useMutation({
    mutationFn: async (novo: NovoModeloDocumentoRH) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("pessoas_documentos_modelos").insert({
        organization_id: orgId,
        nome: novo.nome,
        tipo: novo.tipo,
        corpo_html: novo.corpo_html,
        variaveis: novo.variaveis,
        created_by: businessUserId,
        updated_by: businessUserId,
      });
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  const editarMutation = useMutation({
    mutationFn: async (edicao: EdicaoModeloDocumentoRH) => {
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("pessoas_documentos_modelos")
        .update({
          nome: edicao.nome,
          tipo: edicao.tipo,
          corpo_html: edicao.corpo_html,
          variaveis: edicao.variaveis,
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
      const { error: erro } = await hrFrom("pessoas_documentos_modelos")
        .update({ activo: args.activo, updated_by: businessUserId })
        .eq("id", args.id);
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  return {
    modelos: data ?? [],
    isLoading,
    error,
    isSaving:
      criarMutation.isPending || editarMutation.isPending || alternarActivoMutation.isPending,
    criar: criarMutation.mutateAsync,
    editar: editarMutation.mutateAsync,
    /** Nunca `eliminar` -- so activar/desactivar. Ver nota no cabecalho. */
    definirActivo: (id: string, activo: boolean) => alternarActivoMutation.mutateAsync({ id, activo }),
  };
}
