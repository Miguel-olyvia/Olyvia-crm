// Os tipos do processo da lead ao negócio: um item (um pedido, ou um negócio em curso, de uma pessoa) e os passos que o
// fazem avançar. Os itens saem de `cartoesDoQuadro` (Quadro), por isso a regra pedido/negócio e as fases são as mesmas.
import type { RotuloPedido } from "../pedidoNegocio";
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";

/** Os passos do processo, pela ordem em que acontecem (o texto de cada um é `pessoasPagina.todo.step.<id>`). */
export const PASSOS_PROCESSO = [
  "registarChamada", "marcarVisita", "marcarVisitaFeita", "criarNegocio", "criarOrcamento",
  "verificarOrcamento", "aguardarDirecao", "escolherOrcamento", "criarProposta", "enviarProposta", "registarRespostaCliente",
  "gerarContrato", "registarAssinatura",
] as const;

export type PassoProcesso = (typeof PASSOS_PROCESSO)[number];

type TipoItemProcesso = "pedido" | "negocio";

export type EstadoVerificacao = "semDetalhe" | "porVerificar" | "aguardaDirecao" | "verificado";

/** Um pedido (lead sem negócio aberto) ou um negócio em curso de uma pessoa. A fase é a coluna do Quadro. */
export interface ItemProcesso {
  /** O id do negócio, ou `pedido-<id do pedido>` num pedido. */
  id: string;
  pessoaId: string;
  /** O id do pedido (`pd-<n>`); `null` num negócio. */
  pedidoId: string | null;
  tipo: TipoItemProcesso;
  fase: ColunaQuadro;
  /** O serviço do negócio ou do pedido; `null` quando não há. */
  trabalho: string | null;
  /** O que identifica o pedido ao utilizador (ver `nomeDoPedido`); `null` num negócio. */
  rotuloPedido: RotuloPedido | null;
  /** O valor do orçamento escolhido; `null` num pedido. */
  valor: number | null;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
  atrasado: boolean;
  /** Quantos orçamentos o negócio tem (0 num pedido). */
  orcamentos: number;
  /** Algum dos orçamentos do negócio está escolhido (falso num pedido). */
  orcamentoEscolhido: boolean;
  /**
   * Onde está o orçamento detalhado do negócio: `semDetalhe` num pedido e num negócio sem orçamento detalhado guardado (os de exemplo);
   * `porVerificar`, `aguardaDirecao` (pedido à Direção feito) ou `verificado` (também com a exceção aprovada).
   */
  verificacao: EstadoVerificacao;
  /** A proposta do negócio existe e ainda é um rascunho (falso num pedido, ou sem proposta). */
  propostaRascunho: boolean;
  /** Um pedido na fase Visita com pelo menos uma visita feita (falso num negócio). */
  visitaFeita: boolean;
}

/** O negócio a que um diálogo do orçamento ou da proposta se refere: o título diz o trabalho e a descrição diz a pessoa. */
export interface NegocioDoPasso {
  id: string;
  nome: string;
  trabalho: string;
}

/** O próximo passo de um item e a chave do seu texto, para o ecrã traduzir (nunca texto solto). */
export interface PassoDoItem {
  id: PassoProcesso;
  chave: string;
}
