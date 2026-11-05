import { useMemo } from "react";
import { PERMISSAO_DECIDIR_PROPOSTA, usePodeDecidirProposta } from "@/hooks/usePodeDecidirProposta";
import { usePermissoesDoFecho } from "./usePermissoesDoFecho";

/**
 * As permissões do fecho (usePermissoesDoFecho) mais `negocios.proposta.decidir` quando a sessão a tem (fn_cat_pode, a função do servidor).
 * As propostas da ficha de um negócio têm sempre negocio_id, e aí o servidor exige-a para aceitar/recusar (fn_neg_documento_exigir_permissao):
 * o guia só mostra «Aceitou»/«Recusou» com proposals.edit E esta. Enquanto qualquer uma das leituras corre devolve `undefined` (nada se
 * esconde nem se ativa às cegas); a leitura falhada de fn_cat_pode vale «não tem».
 */
export function usePermissoesDoFechoNoNegocio(): readonly string[] | undefined {
  const fecho = usePermissoesDoFecho();
  const decidir = usePodeDecidirProposta();
  return useMemo(() => {
    if (fecho === undefined || decidir.aLer) return undefined;
    return decidir.pode ? [...fecho, PERMISSAO_DECIDIR_PROPOSTA] : fecho;
  }, [fecho, decidir.aLer, decidir.pode]);
}
