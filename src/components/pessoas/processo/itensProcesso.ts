// Os itens do processo de uma pessoa: os mesmos cartões do Quadro (um por pessoa em abordagem, ou um por negócio em curso), com o que
// a regra dos passos precisa. Funções puras: o dia de hoje chega por parâmetro.
import { cartoesDoQuadro, type CartaoQuadro } from "../quadro/cartoesQuadroPessoas";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { contratoAssinadoPronto, negocioEmFoco, propostaAceiteSemContrato } from "../etapaPessoa";
import type { ResumoPessoa } from "../pessoasTipos";
import { orcamentoDoNegocio, SEM_EXTRAS, type ExtrasPorNegocio } from "./orcamentoDetalhado";
import type { EstadoVerificacao, ItemProcesso } from "./tiposProcesso";

/** O id do painel das sub-linhas de uma pessoa (o `aria-controls` do botão aponta para ele). */
export const idPainelNegocios = (pessoaId: string): string => `negocios-${pessoaId}`;

/** Onde está o orçamento detalhado do negócio; sem ele (os negócios de exemplo) é `semDetalhe`. */
function verificacaoDo(negocio: NegocioMes | undefined, extras: ExtrasPorNegocio): EstadoVerificacao {
  const orcamento = negocio && orcamentoDoNegocio(negocio, extras);
  if (!orcamento) return "semDetalhe";
  if (orcamento.direcao === "pedida") return "aguardaDirecao";
  return orcamento.verificado ? "verificado" : "porVerificar";
}

function itemDoCartao(c: CartaoQuadro, r: ResumoPessoa, extras: ExtrasPorNegocio): ItemProcesso {
  const negocio: NegocioMes | undefined = r.abertos.find((n) => n.id === c.id);
  return {
    id: c.id, pessoaId: c.pessoaId, tipo: c.tipo, fase: c.coluna, trabalho: c.trabalho,
    valor: c.valor, prazo: c.prazo, atrasado: c.atrasado, orcamentos: negocio?.orcamentos.length ?? 0,
    verificacao: verificacaoDo(negocio, extras),
    propostaRascunho: negocio?.proposta?.estado === "rascunho",
    visitaFeita: c.tipo === "pessoa" && r.porLigar.visitas.some((v) => v.estado === "feita"),
    // O fim do percurso só existe nos negócios da base (os de exemplo continuam a acabar no contrato assinado).
    propostaAceite: negocio !== undefined && propostaAceiteSemContrato(negocio),
    prontoAGanhar: negocio !== undefined && contratoAssinadoPronto(negocio),
  };
}

/**
 * Os itens em curso de uma pessoa (ela em abordagem, ou os negócios abertos); uma perdida, ou quem não tem nem uma coisa nem outra, não tem nenhum. `extras` são
 * os orçamentos detalhados (ver `processoNegocios.ts`): sem eles todos os negócios ficam `semDetalhe`.
 */
export function itensDaPessoa(r: ResumoPessoa, hoje: string, extras: ExtrasPorNegocio = SEM_EXTRAS): ItemProcesso[] {
  return cartoesDoQuadro([r], hoje).map((c) => itemDoCartao(c, r, extras));
}

/**
 * O item que o resumo da linha fechada mostra: o do negócio mais avançado, o MESMO critério da coluna "Próximo passo"
 * (`negocioEmFoco`, em empate o primeiro), e não o de prazo mais próximo. Sem negócio aberto, o da pessoa em abordagem.
 */
export function itemEmFoco(r: Pick<ResumoPessoa, "abertos">, itens: readonly ItemProcesso[]): ItemProcesso | null {
  const foco = negocioEmFoco(r.abertos);
  return itens.find((i) => i.id === foco?.id) ?? itens[0] ?? null;
}
