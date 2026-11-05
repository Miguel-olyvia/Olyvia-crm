// Quem pode ver os custos e as margens do orçamento de um negócio em /negocios: a mesma pergunta das RPCs que os devolvem
// (fn_neg_ler_orcamento, neg_ler_negocios, fn_neg_ler_adendas), fn_cat_pode(org, 'quotes.view_costs'), que junta o perfil na
// organização, o Papel no Negócio (neg_papeis_permissoes) e o admin do sistema. Sem ela a base devolve os custos a null e o ecrã
// mostraria margem 100 % e «Custo 0 €». Padrão de usePodeDecidirProposta: enquanto se lê, `pode` é false e `aLer` é true; uma leitura
// que falha vale «não». A ficha (NegocioEmyliaDoGuia) lê o mesmo código em permissoesPosContrato.ts.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { CODIGO_VER_CUSTOS } from "@/emylia/permissoes";

/** `ativo` false: não se pergunta nada à base e devolve «não». */
export function usePodeVerCustos(ativo = true): { pode: boolean; aLer: boolean } {
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
        const { data, error } = await (supabase as any).rpc("fn_cat_pode", { p_org: org, p_perm: CODIGO_VER_CUSTOS });
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
