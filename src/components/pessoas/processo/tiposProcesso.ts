// Os tipos do processo da lead ao negócio: um item (uma pessoa em abordagem, ou um negócio em curso) e os passos que o fazem
// avançar. Os itens saem de `cartoesDoQuadro` (Quadro), por isso a regra pessoa/negócio e as fases são as mesmas.
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";

/** Os passos do processo, pela ordem em que acontecem (o texto de cada um é `pessoasPagina.todo.step.<id>`). */
export const PASSOS_PROCESSO = [
  "registarChamada", "marcarVisita", "marcarVisitaFeita", "criarNegocio", "fazerLevantamento", "criarOrcamento",
  "verificarOrcamento", "aguardarDirecao", "criarProposta", "enviarProposta", "registarRespostaCliente", "registarAssinatura",
] as const;

export type PassoProcesso = (typeof PASSOS_PROCESSO)[number];

type TipoItemProcesso = "pessoa" | "negocio";

export type EstadoVerificacao = "semDetalhe" | "porVerificar" | "aguardaDirecao" | "verificado";

/** Uma pessoa em abordagem (Parte 1 do Quadro) ou um negócio em curso (Parte 2). A fase é a coluna do Quadro. */
export interface ItemProcesso {
  /** O id do negócio, ou `pessoa-<id da pessoa>` numa pessoa em abordagem. */
  id: string;
  pessoaId: string;
  tipo: TipoItemProcesso;
  fase: ColunaQuadro;
  /** O serviço do negócio; `null` numa pessoa em abordagem, ou quando não há. */
  trabalho: string | null;
  /** O valor do orçamento escolhido; `null` numa pessoa em abordagem e num negócio em Levantamento. */
  valor: number | null;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
  atrasado: boolean;
  /** Quantos orçamentos o negócio tem (0 numa pessoa). */
  orcamentos: number;
  /**
   * Onde está o orçamento detalhado do negócio: `semDetalhe` numa pessoa e num negócio sem orçamento detalhado guardado (os de exemplo);
   * `porVerificar`, `aguardaDirecao` (pedido à Direção feito) ou `verificado` (também com a exceção aprovada).
   */
  verificacao: EstadoVerificacao;
  /** A proposta do negócio existe e ainda é um rascunho (falso numa pessoa, ou sem proposta). */
  propostaRascunho: boolean;
  /** Uma pessoa em Visita com pelo menos uma visita feita por ligar (falso num negócio). */
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
