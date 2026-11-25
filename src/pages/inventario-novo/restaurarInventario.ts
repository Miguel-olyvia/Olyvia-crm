// O "Restaurar" do toast do novo Inventário (fatia 4). Um ecrã clássico embebido elimina (handleDelete, ramo de sucesso) e
// avisa a moldura (AvisosInventario, em components/inventory/ui/embebido.ts); o toast escuro oferece "Restaurar".
//
// O Restaurar chama EXATAMENTE a mesma RPC, com os mesmos parâmetros ({ p_id }), que o handleRestore do ecrã clássico e
// só aparece com a MESMA permissão que o botão "Restaurar" de "Ver eliminados" exige:
//  · PO          → PurchaseOrders.tsx handleRestore: rpc_restore_purchase_order · PoRowActions: purchase_orders.delete
//  · fornecedor  → Suppliers.tsx      handleRestore: rpc_restore_supplier       · RowActions:   suppliers.delete
//  · armazém     → Warehouses.tsx     handleRestore: rpc_restore_warehouse      · RowActions:   warehouses.delete
//  · stock       → Stocks.tsx         handleRestore: rpc_restore_stock          · RowActions:   inventory.delete
// (restaurarInventario.test.ts lê os quatro ecrãs e falha se algum deixar de bater certo com esta tabela.)
// Não se extraiu o handleRestore dos ecrãs: cada um é só a RPC + o toast + o recarregar da sua lista (estado local); aqui
// faz-se a mesma RPC e a moldura volta a montar o ecrã embebido (que relê tudo), como depois de um movimento no painel.
import type { EliminadoInventario, TipoEliminado } from "@/components/inventory/ui/embebido";
import type { ClienteRpc } from "./anularInventario";
import type { ChaveSeparador } from "./separadores";

export interface Restauro {
  rpc: string;
  permissao: string;
  separador: ChaveSeparador;
  /** "Encomenda", "Fornecedor"… (o que se eliminou, para o texto do toast). */
  nome: string;
  feminino: boolean;
}

export const RESTAURAR: Record<TipoEliminado, Restauro> = {
  po: { rpc: "rpc_restore_purchase_order", permissao: "purchase_orders.delete", separador: "encomendas", nome: "Encomenda", feminino: true },
  fornecedor: { rpc: "rpc_restore_supplier", permissao: "suppliers.delete", separador: "fornecedores", nome: "Fornecedor", feminino: false },
  armazem: { rpc: "rpc_restore_warehouse", permissao: "warehouses.delete", separador: "armazens", nome: "Armazém", feminino: false },
  stock: { rpc: "rpc_restore_stock", permissao: "inventory.delete", separador: "existencias", nome: "Stock", feminino: false },
};

/** A mesma chamada do handleRestore do ecrã clássico: a mesma RPC, { p_id }, nada mais. */
export async function restaurar(cliente: ClienteRpc, tipo: TipoEliminado, id: string): Promise<void> {
  const { error } = await cliente.rpc(RESTAURAR[tipo].rpc, { p_id: id });
  if (error) throw error;
}

const comRotulo = (e: Pick<EliminadoInventario, "tipo" | "rotulo">) => {
  const r = RESTAURAR[e.tipo];
  return e.rotulo?.trim() ? `${r.nome} ${e.rotulo.trim()}` : r.nome;
};
/** "Fornecedor Forn Lda eliminado." */
export const textoEliminado = (e: Pick<EliminadoInventario, "tipo" | "rotulo">): string =>
  `${comRotulo(e)} ${RESTAURAR[e.tipo].feminino ? "eliminada" : "eliminado"}.`;
/** "Fornecedor Forn Lda restaurado." */
export const textoRestaurado = (e: Pick<EliminadoInventario, "tipo" | "rotulo">): string =>
  `${comRotulo(e)} ${RESTAURAR[e.tipo].feminino ? "restaurada" : "restaurado"}.`;
