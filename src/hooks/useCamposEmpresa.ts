import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { lerConfigEmpresa, type ConfigEmpresa } from "@/lib/campos/api";
import type { Ficha } from "@/lib/campos/catalogo";
import { combinarFicha, type FichaCombinada } from "@/lib/campos/definicoes";
import { combinarTermos, type Termos } from "@/lib/campos/termos";

export const chaveCamposEmpresa = (org: string | null | undefined) => ["cfg-campos", org ?? null] as const;

/**
 * Configuração dos campos e nomes da empresa ativa (ou da indicada).
 * Sem configuração — ou sem a migração aplicada — devolve as fichas de sempre.
 */
export function useCamposEmpresa(orgId?: string | null) {
  const { activeCompany } = useCompany();
  const org = orgId ?? activeCompany?.id ?? null;
  const consulta = useQuery<ConfigEmpresa>({
    queryKey: chaveCamposEmpresa(org),
    queryFn: () => lerConfigEmpresa(org!),
    enabled: !!org,
    staleTime: 5 * 60 * 1000,
  });

  const fichas = useMemo(() => {
    const l = consulta.data?.linhas;
    const r = {} as Record<Ficha, FichaCombinada>;
    for (const f of ["local", "diagnostico", "cliente", "lead"] as Ficha[]) r[f] = combinarFicha(f, l?.[f]);
    return r;
  }, [consulta.data]);

  const termos: Termos = useMemo(() => combinarTermos(consulta.data?.termos), [consulta.data]);

  return {
    org,
    fichas,
    termos,
    modeloSetor: consulta.data?.modeloSetor ?? null,
    disponivel: consulta.data?.disponivel ?? false,
    carregando: consulta.isLoading,
    erro: consulta.error,
  };
}

/** Nomes da empresa ativa (Cliente/Local/Obra/Negócio/Lead). */
export function useTermos(): Termos {
  return useCamposEmpresa().termos;
}

export function useInvalidarCamposEmpresa() {
  const qc = useQueryClient();
  return (org: string | null | undefined) => qc.invalidateQueries({ queryKey: chaveCamposEmpresa(org) });
}
