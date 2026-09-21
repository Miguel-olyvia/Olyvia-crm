/**
 * Catalogo de cargos da organizacao activa (`hr_cargos`, 20261202070000) --
 * copia estrutural de `useModelosDocumentosRH.ts`.
 *
 * O SALARIO AQUI E O UNICO SALARIO -- OBRIGACAO LEGAL, NAO CONVENIENCIA
 * -----------------------------------------------------------------------
 * `salario_base`/`periodicidade` sao a fonte de verdade do salario de toda a
 * gente com `pessoas.cargo_id` a apontar para este cargo -- um trigger em
 * `pessoas_retribuicoes` bloqueia qualquer versao de retribuicao que
 * divirja. Mudar aqui muda o que uma NOVA versao de retribuicao dessas
 * pessoas tem de valer; nao reescreve retribuicoes ja gravadas.
 *
 * NUNCA SE APAGA UM CARGO
 * -------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE (pessoas.cargo_id pode
 * apontar para ele). So `activo`, por UPDATE.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrFrom } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import type { Periodicidade } from "@/types/hr";

export interface HrCargo {
  id: string;
  organization_id: string;
  nome: string;
  salario_base: number;
  periodicidade: Periodicidade;
  horas_referencia: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

const COLUNAS =
  "id, organization_id, nome, salario_base, periodicidade, horas_referencia, activo, created_at, updated_at";

export interface NovoCargoRH {
  nome: string;
  salario_base: number;
  periodicidade: Periodicidade;
  horas_referencia: number | null;
}

export type EdicaoCargoRH = NovoCargoRH & { id: string };

export function useCargos() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["hr-cargos", orgId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<HrCargo[]> => {
      if (!orgId) return [];
      const { data: linhas, error: erro } = await hrFrom("hr_cargos")
        .select(COLUNAS)
        .eq("organization_id", orgId)
        .order("nome", { ascending: true });
      if (erro) throw erro;
      return (linhas ?? []) as HrCargo[];
    },
    enabled: !!orgId,
  });

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, orgId]);

  const criarMutation = useMutation({
    mutationFn: async (novo: NovoCargoRH) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_cargos").insert({
        organization_id: orgId,
        nome: novo.nome,
        salario_base: novo.salario_base,
        periodicidade: novo.periodicidade,
        horas_referencia: novo.horas_referencia,
        created_by: businessUserId,
        updated_by: businessUserId,
      });
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  const editarMutation = useMutation({
    mutationFn: async (edicao: EdicaoCargoRH) => {
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_cargos")
        .update({
          nome: edicao.nome,
          salario_base: edicao.salario_base,
          periodicidade: edicao.periodicidade,
          horas_referencia: edicao.horas_referencia,
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
      const { error: erro } = await hrFrom("hr_cargos")
        .update({ activo: args.activo, updated_by: businessUserId })
        .eq("id", args.id);
      if (erro) throw erro;
    },
    onSuccess: invalidar,
  });

  return {
    cargos: data ?? [],
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
