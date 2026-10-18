// O que um negócio guarda ALÉM do que `NegocioMes` já tem (só id, valor e se está escolhido): o orçamento detalhado e as condições da
// proposta. Só tipos e leituras puras; o estado em memória vive em `processoNegocios.ts`. Fica à parte para os itens e os passos
// (puros) o poderem ler sem importar o estado.
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { CondicoesProposta } from "./condicoesProposta";
import type { LinhaTrabalho } from "./orcamentoCalculo";

/** O pedido à Direção: feito (à espera) ou aprovado. Recusar desfaz o pedido, por isso não é um estado. */
export type DirecaoOrcamento = "pedida" | "aprovada" | null;

/** O orçamento de um negócio com as linhas, o desconto e onde está na verificação. */
export interface OrcamentoDetalhado {
  /** O id do orçamento (em `NegocioMes.orcamentos`) que estas linhas detalham. */
  orcamentoId: string;
  linhas: readonly LinhaTrabalho[];
  /** Percentagem de 0 a 50. */
  desconto: number;
  /** A proposta aceite dispensa o contrato. */
  vendaDireta: boolean;
  /** Verificado, ou com a exceção aprovada pela Direção. Guardar o orçamento volta a pô-lo a falso. */
  verificado: boolean;
  direcao: DirecaoOrcamento;
  /** Sobe quando o cliente pede alterações (Fase 5); começa em 1. */
  versao: number;
}

export interface ExtrasNegocio {
  orcamento?: OrcamentoDetalhado;
  /** As condições com que a proposta foi enviada. */
  condicoes?: CondicoesProposta;
}

/** Os extras de todos os negócios, pelo id do negócio. */
export type ExtrasPorNegocio = Readonly<Record<string, ExtrasNegocio>>;

export const SEM_EXTRAS: ExtrasPorNegocio = {};

/** O orçamento de que o processo trata: o escolhido, ou, sem nenhum escolhido (já não há passo de escolher), o último. */
export function orcamentoDoPasso(negocio: NegocioMes): NegocioMes["orcamentos"][number] | undefined {
  return negocio.orcamentos.find((o) => o.escolhido) ?? negocio.orcamentos[negocio.orcamentos.length - 1];
}

/** O orçamento detalhado, mas só se for o do orçamento do passo (um detalhe de outro orçamento já não vale). */
export function orcamentoEscolhidoDetalhado(negocio: NegocioMes, extras: ExtrasNegocio | undefined): OrcamentoDetalhado | undefined {
  const alvo = orcamentoDoPasso(negocio);
  return alvo !== undefined && extras?.orcamento?.orcamentoId === alvo.id ? extras.orcamento : undefined;
}

export const orcamentoDoNegocio = (negocio: NegocioMes, todos: ExtrasPorNegocio): OrcamentoDetalhado | undefined =>
  orcamentoEscolhidoDetalhado(negocio, todos[negocio.id]);
