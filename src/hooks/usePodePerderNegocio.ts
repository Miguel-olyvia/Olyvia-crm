// 23/11/2026 (permissões, B1): quem pode dar um negócio como perdido e anular a perda. O servidor (neg_perder_negocio, neg_anular_perda)
// exige negocios.perder (além de pessoas.edit no âmbito do negócio); o ecrã mostrava «Perder negócio» e «Anular perda» só com pessoas.edit
// e a base recusava. Lê-se por fn_cat_pode(org, código), a MESMA função com que o servidor decide (como usePodeDecidirProposta).
// Enquanto se lê, `pode` é false e `aLer` é true; uma leitura que falha vale «não». Sem react-query de propósito (como
// usePodeDecidirProposta).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export const PERMISSAO_PERDER_NEGOCIO = "negocios.perder";

/** `ativo` false: não se pergunta nada à base e devolve «não». */
export function usePodePerderNegocio(ativo = true): { pode: boolean; aLer: boolean } {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  const perguntar = ativo && org !== null;
  // a resposta guarda a organização a que respondeu: a de outra organização (troca de empresa a meio) não conta
  const [lida, setLida] = useState<{ org: string; pode: boolean } | null>(null);
  useEffect(() => {
    if (!perguntar || !org) return;
    let cancelado = false;
    void (async () => {
      let pode = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("fn_cat_pode", { p_org: org, p_perm: PERMISSAO_PERDER_NEGOCIO });
        pode = !error && data === true;
      } catch {
        pode = false;
      }
      if (!cancelado) setLida({ org, pode });
    })();
    return () => { cancelado = true; };
  }, [perguntar, org]);
  if (!ativo || !org) return { pode: false, aLer: false };
  const daOrg = lida && lida.org === org ? lida : null;
  return { pode: daOrg?.pode === true, aLer: daOrg === null };
}
