// As bandeiras das migrations desta ronda (20261226190000 e 20261226200000), por aplicar na base. Desligadas, o ecrã faz o que sempre fez: nada de
// novo se pede à base. Liga-se cada uma quando a migration correspondente estiver aplicada e provada na nike (não antes: ligar sem a função na base
// parte a ação). Ordem: migration aplicada, prova na nike, constante a true, e só então o commit com a constante ligada (publicar o código antes
// de a migration estar aplicada parte a ação). Para a C, a prova inclui as contas de âmbito (organização, equipa, só os meus) a classificar a lead
// de um colega, a de uma pessoa fora do âmbito (NG027) e a de quem só pertence à organização-raiz. O contexto serve os testes (e uma eventual ligação por organização): quando existe, manda sobre a constante.
import { createContext, useContext } from "react";

/** B (`neg_ficha_pessoa` devolve `pode_editar`, `pode_apagar` e `pode_restaurar` por negócio): o ecrã esconde editar, lixo e restaurar quando vêm falsos. */
export const PERMISSOES_POR_NEGOCIO_ATIVO = false;
/** C (`neg_classificar_lead`): classificar MQL ou SQL grava só a classificação, em vez de regravar a lead inteira por `rpc_update_lead`. */
export const CLASSIFICAR_LEAD_ATIVO = false;

export const PermissoesPorNegocioContext = createContext<boolean | null>(null);
export const ClassificarLeadContext = createContext<boolean | null>(null);

export function usePermissoesPorNegocio(): boolean {
  return useContext(PermissoesPorNegocioContext) ?? PERMISSOES_POR_NEGOCIO_ATIVO;
}

export function useClassificarLeadAtivo(): boolean {
  return useContext(ClassificarLeadContext) ?? CLASSIFICAR_LEAD_ATIVO;
}
