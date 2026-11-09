// As páginas que saíram do menu a 03/11 (Pedidos, Orçamentos, Propostas, Contratos) continuam com rota em App.tsx, guardada pela
// permissão «ver» de cada uma (ProtectedRoute). 05/11 (ronda 2): TODAS as entradas para elas — atalhos da Home e alertas do Hoje (já
// pediam), notificações, ficha da pessoa (abrir documento / passos do processo), PipelineBreadcrumb, Guia de boas-vindas e as ligações
// entre estas páginas — pedem a MESMA permissão que a rota, para ninguém ser levado a um «Sem acesso».
// rotasForaDoMenu.test.ts confirma que App.tsx pede exatamente estas.
// 06/11: /deals saiu do mapa: a rota passou a redirecionar para /negocios (Pedidos de Proposta, CRM antigo) e deixou de pedir deals.view.

/** Caminho da rota → a permissão que a rota pede (ProtectedRoute em App.tsx). */
export const PERMISSAO_DA_ROTA_FORA_DO_MENU: Readonly<Record<string, string>> = {
  "/quotes": "quotes.view",
  "/proposals": "proposals.view",
  "/client-contracts": "client_contracts.view",
};

/** O caminho de um destino da app, sem a pesquisa nem o fragmento ("/quotes?open=1" → "/quotes"). */
export function caminhoDoDestino(destino: string): string {
  const caminho = destino.split(/[?#]/)[0] ?? "";
  return caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho;
}

/** A permissão que a rota do destino pede, se for uma das páginas fora do menu; `null` nas outras (a guarda delas não muda aqui). */
export function permissaoDoDestino(destino: string): string | null {
  return PERMISSAO_DA_ROTA_FORA_DO_MENU[caminhoDoDestino(destino)] ?? null;
}

/** Se a sessão pode abrir o destino: as páginas fora do menu pedem a permissão da rota; os outros destinos não se restringem aqui. */
export function podeAbrirDestino(destino: string, hasPermission: (codigo: string) => boolean): boolean {
  const permissao = permissaoDoDestino(destino);
  return permissao === null || hasPermission(permissao);
}

export const MENSAGEM_SEM_PERMISSAO_DESTINO = "Não tem permissão para abrir esta página.";
