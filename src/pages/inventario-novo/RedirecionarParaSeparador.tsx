// As rotas clássicas do Inventário (/inventory, /purchase-orders, …) com o novo Inventário ligado (INVENTARIO_NOVO_ATIVO):
// levam ao separador certo (/inventory/novo/<aba>) com o mesmo ?search e #hash, para as ligações antigas (notificações,
// e-mails, favoritos, ecrãs fora do Inventário) continuarem a abrir o que abriam.
//
// Sem ProtectedRoute à volta: a rota /inventory/novo/:aba? tem a guarda OR do menu e, dentro, um separador sem a permissão
// da rota clássica mostra «Sem acesso» (InventarioNovo.tsx) — quem não podia ver a rota clássica continua sem ver o ecrã.
import { Navigate, useLocation } from "react-router-dom";
import { separadorDoCaminho } from "./navegadorInventario";
import { BASE_NOVO, caminhoSeparador } from "./separadores";

export function RedirecionarParaSeparador() {
  const { pathname, search, hash } = useLocation();
  // O react-router compara os caminhos sem maiúsculas (/Stocks abre /stocks); sem separador conhecido, a moldura escolhe
  // o primeiro que se pode abrir — nunca o mesmo endereço (seria um ciclo).
  const chave = separadorDoCaminho(pathname.toLowerCase());
  return <Navigate replace to={(chave ? caminhoSeparador(chave) : BASE_NOVO) + search + hash} />;
}
