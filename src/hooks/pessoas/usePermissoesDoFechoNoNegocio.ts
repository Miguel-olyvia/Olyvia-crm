import { useMemo } from "react";
import { PERMISSAO_DECIDIR_PROPOSTA, usePodeDecidirProposta } from "@/hooks/usePodeDecidirProposta";
import { PERMISSAO_PERDER_NEGOCIO, usePodePerderNegocio } from "@/hooks/usePodePerderNegocio";
import { usePermissoesDoFecho } from "./usePermissoesDoFecho";

/**
 * As permissões do fecho (usePermissoesDoFecho) mais `negocios.proposta.decidir` quando a sessão a tem (fn_cat_pode, a função do servidor).
 * As propostas da ficha de um negócio têm sempre negocio_id, e aí o servidor exige-a para aceitar/recusar (fn_neg_documento_exigir_permissao):
 * o guia só mostra «Aceitou»/«Recusou» com proposals.edit E esta. Enquanto qualquer uma das leituras corre devolve `undefined` (nada se
 * esconde nem se ativa às cegas); a leitura falhada de fn_cat_pode vale «não tem».
 * 23/11 (B1): e `negocios.perder` quando a sessão a tem (fn_cat_pode): «Perder negócio» e «Anular perda» pedem-na no servidor. Esta não
 * suspende a lista: enquanto se lê (ou se a leitura falha) fica de fora, e os dois botões ficam escondidos até se saber.
 */
export function usePermissoesDoFechoNoNegocio(): readonly string[] | undefined {
  const fecho = usePermissoesDoFecho();
  const decidir = usePodeDecidirProposta();
  const perder = usePodePerderNegocio();
  const podePerder = perder.pode && !perder.aLer;
  return useMemo(() => {
    if (fecho === undefined || decidir.aLer) return undefined;
    if (!decidir.pode && !podePerder) return fecho;
    return [...fecho, ...(decidir.pode ? [PERMISSAO_DECIDIR_PROPOSTA] : []), ...(podePerder ? [PERMISSAO_PERDER_NEGOCIO] : [])];
  }, [fecho, decidir.aLer, decidir.pode, podePerder]);
}
