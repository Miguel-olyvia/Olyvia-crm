/**
 * Le e grava `organization_admissao_settings.campos_override` da organizacao
 * activa -- o mapa `{ "<codigo>": false }` que torna um campo de admissao
 * FACULTATIVO para esta organizacao (20261201050000). Segue o padrao de
 * `useDocumentSettings.ts`: uma linha por organizacao, upsert por
 * `organization_id`.
 *
 * SO SE GRAVA `false` EXPLICITO
 * -------------------------------
 * Um codigo ausente do mapa continua obrigatorio -- e a omissao de sempre, e
 * a que `hr_admissao_campos_obrigatorios_org()` assume quando nao ha linha
 * nenhuma. Gravar `true` para o resto so faria o objecto crescer sem mudar
 * nada; `definirObrigatorio(codigo, true)` por isso REMOVE a chave em vez de
 * a escrever.
 *
 * As UNICAS chaves aceites sao as que `hr_admissao_campos_obrigatorios()`
 * devolve (29 codigos) -- a mesma lista que `CAMPOS_OBRIGATORIOS_ADMISSAO`
 * mais `data_admissao` espelha do lado 'pessoa'/'rh'. A validacao final e o
 * CHECK constraint na base; este hook nao tenta reimplementa-la.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export type ObrigatoriosOverride = Record<string, boolean>;

interface SettingsRow {
  organization_id: string;
  campos_override: ObrigatoriosOverride;
}

/** Uma linha de `hr_admissao_campos_obrigatorios_org()`, ja com o override aplicado. */
export interface CampoObrigatorioOrg {
  codigo: string;
  origem: "pessoa" | "rh";
  condicional: boolean;
  obrigatorio: boolean;
}

export function useConfiguracaoObrigatoriosAdmissao() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["organization-admissao-settings", orgId];
  const camposQueryKey = ["hr-admissao-campos-obrigatorios-org", orgId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<SettingsRow> => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const { data: row, error } = await (supabase as any)
        .from("organization_admissao_settings")
        .select("organization_id, campos_override")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return row ?? { organization_id: orgId, campos_override: {} };
    },
    enabled: !!orgId,
  });

  // A lista dos 29 codigos, JA cruzada com o override -- a mesma funcao que
  // `hr_admissao_pendencias` usa. Evita duplicar a lista de codigos aqui: a
  // autoridade continua a ser a base.
  const { data: campos, isLoading: camposLoading } = useQuery({
    queryKey: camposQueryKey,
    queryFn: async (): Promise<CampoObrigatorioOrg[]> => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const { data: linhas, error } = await (supabase as any).rpc(
        "hr_admissao_campos_obrigatorios_org",
        { p_organization_id: orgId },
      );
      if (error) throw error;
      return (linhas ?? []) as CampoObrigatorioOrg[];
    },
    enabled: !!orgId,
  });

  const override: ObrigatoriosOverride = useMemo(() => data?.campos_override ?? {}, [data]);

  const saveMutation = useMutation({
    mutationFn: async (novoOverride: ObrigatoriosOverride) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("organization_admissao_settings")
        .upsert(
          {
            organization_id: orgId,
            campos_override: novoOverride,
            updated_at: new Date().toISOString(),
            updated_by: sessao?.user?.id ?? null,
          },
          { onConflict: "organization_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: camposQueryKey });
    },
  });

  /**
   * `true` (o omissao) remove a chave -- nunca grava `true` explicito.
   * `false` marca o codigo como facultativo para esta organizacao.
   */
  const definirObrigatorio = async (codigo: string, obrigatorio: boolean): Promise<void> => {
    const { [codigo]: _removido, ...resto } = override;
    const novoOverride = obrigatorio ? resto : { ...resto, [codigo]: false };
    await saveMutation.mutateAsync(novoOverride);
  };

  return {
    campos: campos ?? [],
    override,
    isLoading: isLoading || camposLoading,
    isSaving: saveMutation.isPending,
    definirObrigatorio,
  };
}
