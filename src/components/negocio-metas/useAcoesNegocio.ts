// As ações dos negócios (cartões, linhas da Lista e painel): "Abrir pessoa" leva à ficha dela em /pessoas?open=<id> (a
// página de Pessoas lê o ?open= e abre a ficha, também a de uma pessoa criada nesta sessão) e "Criar orçamento" pede à
// página o diálogo do orçamento. Abrir o painel de um negócio é o `abrir` do próprio Quadro.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { AcoesNegocio } from "./AcoesNegocio";
import type { NegocioMes } from "./negocioMetas";

/** O endereço que abre a ficha de uma pessoa na página de Pessoas. */
export const enderecoDaPessoa = (pessoaId: string): string => `/pessoas?open=${encodeURIComponent(pessoaId)}`;

export function useAcoesNegocio(pedirOrcamento: (negocio: NegocioMes) => void): AcoesNegocio {
  const navigate = useNavigate();
  return useMemo(
    () => ({ abrirPessoa: (n) => navigate(enderecoDaPessoa(n.pessoaId)), criarOrcamento: pedirOrcamento }),
    [navigate, pedirOrcamento],
  );
}
