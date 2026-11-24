// O painel do produto no endereço (?painel=produto:<id>), como o usePainelUrl do Estúdio (src/lib/paramUrl.ts): o «voltar» do
// browser fecha-o, recarregar volta a abri-lo e fechar pelo botão recua a entrada que o abriu.
//
// Porquê pelo react-router e não pelo usePainelUrl/EnderecoAtivo="pesquisa": esse escreve com history.pushState por fora do
// BrowserRouter, e o ecrã clássico embebido (Stocks.tsx) reescreve ?status=&warehouse= com setSearchParams(prev => …), em que
// `prev` é a pesquisa que o router conhece — o ?painel= desaparecia do endereço à primeira mudança de filtro. Pelo router, o
// `prev` já o traz e fica. O nome "painel" não colide com os parâmetros dos ecrãs clássicos (?open=, ?tab=, ?status=, ?q=…);
// o separador vai no caminho (/inventory/novo/existencias).
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const PARAM_PAINEL = "painel";
const PREFIXO = "produto:";

export const valorPainelProduto = (id: string): string => `${PREFIXO}${id}`;

/** O id do produto em ?painel=produto:<id>; null noutro valor (ou sem painel). */
export function produtoDoPainel(valor: string | null | undefined): string | null {
  if (!valor || !valor.startsWith(PREFIXO)) return null;
  const id = valor.slice(PREFIXO.length).trim();
  return id || null;
}

/** Marca da entrada do histórico que o painel juntou (para fechar = recuar). */
const MARCA = "painelInventario";

/** [o produto aberto, abrir(id), fechar()]. Abrir outro produto com um já aberto substitui a entrada (não empilha). */
export function usePainelProduto(): [string | null, (id: string) => void, () => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const produtoId = produtoDoPainel(new URLSearchParams(location.search).get(PARAM_PAINEL));

  const abrir = useCallback((id: string) => {
    const p = new URLSearchParams(location.search);
    const ja = produtoDoPainel(p.get(PARAM_PAINEL));
    if (ja === id) return;
    p.set(PARAM_PAINEL, valorPainelProduto(id));
    navigate({ pathname: location.pathname, search: `?${p.toString()}`, hash: location.hash },
      ja ? { replace: true, state: location.state } : { state: { [MARCA]: true } });
  }, [location.pathname, location.search, location.hash, location.state, navigate]);

  const fechar = useCallback(() => {
    const p = new URLSearchParams(location.search);
    if (!produtoDoPainel(p.get(PARAM_PAINEL))) return;
    // Foi aberto aqui e a entrada continua a ser a nossa: recua (o «voltar» a seguir não o reabre).
    //
    // Caso conhecido: com o painel aberto, o Stocks.tsx reescreve a search (?status=/?warehouse=/?q=) com
    // setSearchParams(prev => …, { replace: true }) SEM `state`. O ?painel= fica (vem no `prev`), mas a MARCA perde-se, e
    // então cai-se no ramo de baixo: tira-se o ?painel= com replace em vez de recuar. O ecrã fica certo; só sobra no
    // histórico a entrada de antes de abrir, por isso o «voltar» a seguir leva a um endereço igual ao atual (sem o painel,
    // com os filtros de então) em vez de sair logo do separador. Não se reabre o painel em nenhum dos casos.
    const st = location.state as Record<string, unknown> | null;
    if (st && st[MARCA] === true) { navigate(-1); return; }
    p.delete(PARAM_PAINEL);
    const s = p.toString();
    navigate({ pathname: location.pathname, search: s ? `?${s}` : "", hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, location.state, navigate]);

  return [produtoId, abrir, fechar];
}
