// O que um cartão do Quadro, uma sub-linha da Lista ou um aviso dizem do "trabalho" de um item: num pedido o nome dele (o serviço, ou
// "Pedido de <dia>", com a numeração entre repetidos); num negócio o serviço dele.
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { textoDoRotulo, type RotuloPedido } from "../pedidoNegocio";

export function trabalhoDoItem(t: Traduzir, item: { trabalho: string | null; rotuloPedido: RotuloPedido | null }): string {
  return item.rotuloPedido ? textoDoRotulo(t, item.rotuloPedido) : item.trabalho ?? t("pessoasPagina.board.request");
}
