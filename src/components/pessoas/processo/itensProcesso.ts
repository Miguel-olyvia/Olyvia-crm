// Os itens do processo de uma pessoa: os mesmos cartões do Quadro (pedido sem negócio aberto, ou um por negócio em curso),
// com o que a regra dos passos precisa. Funções puras: o dia de hoje chega por parâmetro.
import { cartoesDoQuadro, type CartaoQuadro } from "../quadro/cartoesQuadroPessoas";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioEmFoco } from "../etapaPessoa";
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

function itemDoCartao(c: CartaoQuadro, r: ResumoPessoa, hoje: string, extras: ExtrasPorNegocio): ItemProcesso {
  const negocio: NegocioMes | undefined = r.abertos.find((n) => n.id === c.id);
  const visita = negocio ? undefined : r.pessoa.visita;
  const visitaFeita = visita?.feita === true;
  // Um pedido numa visita por fazer e sem próximo contacto mostra a data da visita como prazo (o texto do item diz quando é).
  const prazo = c.prazo ?? (c.coluna === "visita" && !visitaFeita ? visita?.data ?? null : null);
  return {
    id: c.id, pessoaId: c.pessoaId, tipo: negocio ? "negocio" : "pedido", fase: c.coluna, trabalho: c.trabalho, valor: c.valor,
    prazo, atrasado: prazo !== null && prazo < hoje, orcamentos: negocio?.orcamentos.length ?? 0,
    orcamentoEscolhido: negocio?.orcamentos.some((o) => o.escolhido) ?? false, verificacao: verificacaoDo(negocio, extras),
    propostaRascunho: negocio?.proposta?.estado === "rascunho", visitaFeita, levantamentoLinhas: visita?.levantamento?.linhas.length ?? 0,
  };
}

/**
 * Os itens em curso de uma pessoa, pela ordem do Quadro; uma perdida, ou um cliente sem negócio aberto, não tem nenhum. `extras` são
 * os orçamentos detalhados (ver `processoNegocios.ts`): sem eles todos os negócios ficam `semDetalhe`.
 */
export function itensDaPessoa(r: ResumoPessoa, hoje: string, extras: ExtrasPorNegocio = SEM_EXTRAS): ItemProcesso[] {
  return cartoesDoQuadro([r], hoje).map((c) => itemDoCartao(c, r, hoje, extras));
}

/**
 * O item que o resumo da linha fechada mostra: o do negócio mais avançado, o MESMO critério da coluna "Próximo passo"
 * (`negocioEmFoco`, em empate o primeiro), e não o de prazo mais próximo. Sem negócio aberto, o pedido (o único item).
 */
export function itemEmFoco(r: Pick<ResumoPessoa, "abertos">, itens: readonly ItemProcesso[]): ItemProcesso | null {
  const foco = negocioEmFoco(r.abertos);
  return itens.find((i) => i.id === foco?.id) ?? itens[0] ?? null;
}
