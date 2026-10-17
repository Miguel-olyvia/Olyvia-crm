// O que o painel «Novo negócio» leva quando se abre a partir de um pedido (o painel de visita e levantamento, o de criar o negócio e
// o «Criar negócio» da ficha de uma lead): a pessoa, o comercial, as visitas e o levantamento do pedido. Função pura.
import type { ValoresIniciaisNegocio } from "@/components/negocio-metas/novoNegocio";
import type { PedidoNegocio, Pessoa } from "./pessoasTipos";

/**
 * Os valores com que o painel abre. Sem pedido (um pedido novo), abre vazio: o comercial da pessoa e nenhuma visita. A morada da obra
 * vem do levantamento guardado ou, sem ele, das visitas (é o painel que decide). Nada se exige além do que o painel já valida: a visita
 * é opcional, e só havendo uma feita se pede pelo menos uma linha de medidas.
 */
export function valoresIniciaisDoPedido(pessoa: Pick<Pessoa, "id" | "comercial">, pedido: PedidoNegocio | null): ValoresIniciaisNegocio {
  if (pedido === null) return { pessoaId: pessoa.id, comercial: pessoa.comercial, visitas: [] };
  return {
    pessoaId: pessoa.id, comercial: pedido.comercial, visitas: [...pedido.visitas],
    ...(pedido.levantamento ? { levantamento: pedido.levantamento } : {}),
  };
}
