// Os tipos do processo da lead ao negócio: um item (um pedido, ou um negócio em curso, de uma pessoa) e os passos que o
// fazem avançar. Os itens saem de `cartoesDoQuadro` (Quadro), por isso a regra pedido/negócio e as fases são as mesmas.
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";

/** Os passos do processo, pela ordem em que acontecem (o texto de cada um é `pessoasPagina.todo.step.<id>`). */
export const PASSOS_PROCESSO = [
  "registarChamada", "marcarVisita", "marcarVisitaFeita", "fazerLevantamento", "criarNegocio", "criarOrcamento",
  "verificarOrcamento", "aguardarDirecao", "escolherOrcamento", "criarProposta", "enviarProposta", "registarRespostaCliente",
  "gerarContrato", "registarAssinatura",
] as const;

export type PassoProcesso = (typeof PASSOS_PROCESSO)[number];

type TipoItemProcesso = "pedido" | "negocio";

/** Um pedido (lead sem negócio aberto) ou um negócio em curso de uma pessoa. A fase é a coluna do Quadro. */
export interface ItemProcesso {
  /** O id do negócio, ou `pedido-<pessoa>` num pedido. */
  id: string;
  pessoaId: string;
  tipo: TipoItemProcesso;
  fase: ColunaQuadro;
  /** O serviço do negócio, ou o da visita num pedido; `null` quando não há. */
  trabalho: string | null;
  /** O valor do orçamento escolhido; `null` num pedido. */
  valor: number | null;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
  atrasado: boolean;
  /** Quantos orçamentos o negócio tem (0 num pedido). */
  orcamentos: number;
  /** Algum dos orçamentos do negócio está escolhido (falso num pedido). */
  orcamentoEscolhido: boolean;
  /** A proposta do negócio existe e ainda é um rascunho (falso num pedido, ou sem proposta). */
  propostaRascunho: boolean;
  /** Um pedido na fase Visita cuja visita já foi feita (falso num negócio). */
  visitaFeita: boolean;
  /** Quantas linhas de medidas tem o levantamento guardado da visita (0 num negócio, ou sem levantamento). */
  levantamentoLinhas: number;
}

/** O próximo passo de um item e a chave do seu texto, para o ecrã traduzir (nunca texto solto). */
export interface PassoDoItem {
  id: PassoProcesso;
  chave: string;
}
