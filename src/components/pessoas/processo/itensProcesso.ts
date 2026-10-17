// Os itens do processo de uma pessoa: os mesmos cartões do Quadro (um por pedido e um por negócio em curso, pela ordem dos
// pedidos e depois dos negócios), com o que a regra dos passos precisa. Funções puras: o dia de hoje chega por parâmetro.
import { cartoesDoQuadro, type CartaoQuadro } from "../quadro/cartoesQuadroPessoas";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioEmFoco, pedidoMaisAvancado } from "../etapaPessoa";
import type { ResumoPessoa } from "../pessoasTipos";
import { orcamentoDoNegocio, SEM_EXTRAS, type ExtrasPorNegocio } from "./orcamentoDetalhado";
import type { EstadoVerificacao, ItemProcesso } from "./tiposProcesso";

/** O id do painel das sub-linhas de uma pessoa (o `aria-controls` do botão aponta para ele). */
export const idPainelNegocios = (pessoaId: string): string => `negocios-${pessoaId}`;

/** Onde está o orçamento detalhado do negócio; sem ele (os negócios de exemplo, e os pedidos) é `semDetalhe`. */
function verificacaoDo(negocio: NegocioMes | undefined, extras: ExtrasPorNegocio): EstadoVerificacao {
  const orcamento = negocio && orcamentoDoNegocio(negocio, extras);
  if (!orcamento) return "semDetalhe";
  if (orcamento.direcao === "pedida") return "aguardaDirecao";
  return orcamento.verificado ? "verificado" : "porVerificar";
}

function itemDoCartao(c: CartaoQuadro, r: ResumoPessoa, extras: ExtrasPorNegocio): ItemProcesso {
  const negocio: NegocioMes | undefined = r.abertos.find((n) => n.id === c.id);
  const pedido = c.pedidoId === null ? undefined : r.pedidos.find((p) => p.id === c.pedidoId);
  return {
    id: c.id, pessoaId: c.pessoaId, pedidoId: c.pedidoId, tipo: negocio ? "negocio" : "pedido", fase: c.coluna, trabalho: c.trabalho,
    rotuloPedido: c.rotuloPedido,
    valor: c.valor, prazo: c.prazo, atrasado: c.atrasado, orcamentos: negocio?.orcamentos.length ?? 0,
    orcamentoEscolhido: negocio?.orcamentos.some((o) => o.escolhido) ?? false, verificacao: verificacaoDo(negocio, extras),
    propostaRascunho: negocio?.proposta?.estado === "rascunho",
    visitaFeita: pedido?.visitas.some((v) => v.estado === "feita") ?? false,
  };
}

/**
 * Os itens em curso de uma pessoa (os pedidos e depois os negócios abertos); uma perdida, ou quem não tem nem uns nem outros, não tem nenhum. `extras` são
 * os orçamentos detalhados (ver `processoNegocios.ts`): sem eles todos os negócios ficam `semDetalhe`.
 */
export function itensDaPessoa(r: ResumoPessoa, hoje: string, extras: ExtrasPorNegocio = SEM_EXTRAS): ItemProcesso[] {
  return cartoesDoQuadro([r], hoje).map((c) => itemDoCartao(c, r, extras));
}

/**
 * O item que o resumo da linha fechada mostra: o do negócio mais avançado, o MESMO critério da coluna "Próximo passo"
 * (`negocioEmFoco`, em empate o primeiro), e não o de prazo mais próximo. Sem negócio aberto, o do pedido mais avançado.
 */
export function itemEmFoco(r: Pick<ResumoPessoa, "abertos" | "pedidos">, itens: readonly ItemProcesso[]): ItemProcesso | null {
  const foco = negocioEmFoco(r.abertos);
  const pedido = pedidoMaisAvancado(r.pedidos);
  const id = foco?.id ?? (pedido && `pedido-${pedido.id}`);
  return itens.find((i) => i.id === id) ?? itens[0] ?? null;
}
