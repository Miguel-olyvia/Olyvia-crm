// As bandeiras das migrations 20261226190000 e 20261226200000, aplicadas a 21/10 e provadas na nike (âmbito organização, equipa e só os meus; NG025,
// NG027 e a classificação só com a qualificação). Ligadas: o ecrã usa o que a base devolve. Se uma das migrations for revertida, desliga-se a constante
// correspondente no mesmo commit (ligar sem a função na base parte a ação). O contexto serve os testes (e uma eventual ligação por organização): quando existe, manda sobre a constante.
import { createContext, useContext } from "react";

/** B (`neg_ficha_pessoa` devolve `pode_editar`, `pode_apagar` e `pode_restaurar` por negócio): o ecrã esconde editar, lixo e restaurar quando vêm falsos. */
export const PERMISSOES_POR_NEGOCIO_ATIVO = true;
/** C (`neg_classificar_lead`): classificar MQL ou SQL grava só a classificação, em vez de regravar a lead inteira por `rpc_update_lead`. */
export const CLASSIFICAR_LEAD_ATIVO = true;

export const PermissoesPorNegocioContext = createContext<boolean | null>(null);
export const ClassificarLeadContext = createContext<boolean | null>(null);

export function usePermissoesPorNegocio(): boolean {
  return useContext(PermissoesPorNegocioContext) ?? PERMISSOES_POR_NEGOCIO_ATIVO;
}

export function useClassificarLeadAtivo(): boolean {
  return useContext(ClassificarLeadContext) ?? CLASSIFICAR_LEAD_ATIVO;
}
