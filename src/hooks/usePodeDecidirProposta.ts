// Quem pode registar a decisão do cliente numa proposta DE UM NEGÓCIO (aceitar, recusar, reabrir uma aceite/recusada): a mesma regra do
// servidor (gatilho trg_negocios_21_doc_permissao → fn_neg_documento_exigir_permissao, 20270106030000), que exige
// negocios.proposta.decidir quando a proposta tem negocio_id. Lê-se por fn_cat_pode(org, código), a MESMA função com que o servidor decide
// (perfil na organização, Papel no Negócio de neg_papeis_permissoes, admin do sistema). Propostas sem negócio não passam por aqui.
// Enquanto se lê, `pode` é false e `aLer` é true; uma leitura que falha vale «não». Sem react-query de propósito (como
// usePodeEnviarPropostaPortal): a página de Propostas não tem QueryClient nos testes.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export const PERMISSAO_DECIDIR_PROPOSTA = "negocios.proposta.decidir";
export const SEM_PERMISSAO_DECIDIR_PROPOSTA =
  "Sem permissão para registar a decisão do cliente numa proposta de um negócio (requer negocios.proposta.decidir).";

/** `ativo` false: não se pergunta nada à base e devolve «não». */
export function usePodeDecidirProposta(ativo = true): { pode: boolean; aLer: boolean } {
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
        const { data, error } = await (supabase as any).rpc("fn_cat_pode", { p_org: org, p_perm: PERMISSAO_DECIDIR_PROPOSTA });
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
