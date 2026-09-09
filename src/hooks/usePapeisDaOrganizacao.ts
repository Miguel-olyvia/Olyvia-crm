/**
 * Os papeis (`anew_roles`) da organizacao activa, para o passo do ACESSO.
 *
 * O passo "Configuracoes gerais" do assistente de criacao de pessoa nao e
 * sobre a pessoa: e sobre o que ela pode ver no software. E isso e o papel de
 * acesso, que vive em `anew_roles` -- NAO o cargo de RH, que e outro conceito
 * e vive em `pessoas.cargo` / `pessoas_vinculos`.
 *
 * Este hook so LE. A criacao e edicao de papeis continua a ser exclusiva do
 * ecra de Papeis (`/roles`, protegido por `roles.view`, escrita por
 * `rpc_create_role` e companhia): nao se embute superficie de edicao de
 * permissoes do sistema dentro de um ecra de RH.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface PapelDaOrganizacao {
  id: string;
  name: string;
  code: string | null;
}

export function usePapeisDaOrganizacao() {
  const { activeCompany } = useCompany();
  const [papeis, setPapeis] = useState<PapelDaOrganizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [semPermissao, setSemPermissao] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany?.id) {
      setPapeis([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSemPermissao(false);
    const { data, error } = await supabase
      .from("anew_roles")
      .select("id, name, code")
      .eq("organization_id", activeCompany.id)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      if (isPermissionError(error)) setSemPermissao(true);
      else captureFlowError(error, "hr-papeis-load");
      setPapeis([]);
      setLoading(false);
      return;
    }
    setPapeis((data ?? []) as PapelDaOrganizacao[]);
    setLoading(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { papeis, loading, semPermissao, refresh: load };
}
