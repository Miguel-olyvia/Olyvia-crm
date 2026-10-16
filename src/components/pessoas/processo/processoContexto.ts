// O que os botões do "A fazer" (Quadro e sub-linhas da Lista) precisam de saber: como executar o passo de um item. O
// `ProcessoProvider` provê-o (e monta, uma vez por página, os diálogos de cada passo); sem provider o botão só abre a ficha.
import { createContext, useContext, type MouseEvent } from "react";
import { ehExecutavel, passoDoItem } from "./passosProcesso";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";

export interface ProcessoValor {
  /**
   * Executa o passo do item: abre o diálogo desse passo (ou explica o que falta). `origem` é o botão clicado: se o cartão já
   * não existir quando o diálogo fechar, o foco vai para o novo botão do mesmo item ou da mesma pessoa.
   * O valor é o mesmo durante toda a vida do provider (abrir e fechar diálogos não re-renderiza os cartões).
   */
  executar: (item: ItemProcesso, origem: HTMLElement | null) => void;
}

export const ProcessoContext = createContext<ProcessoValor | null>(null);

/** O portão que acabou de travar o botão de um item: o passo e a explicação, que fica junto ao botão até o utilizador agir. */
export interface BloqueioProcesso {
  itemId: string;
  passo: PassoProcesso;
  texto: string;
}

/** Vive à parte do `ProcessoContext`: só os cartões o leem, e muda só quando um portão trava (ou deixa de travar) um botão. */
export const BloqueioContext = createContext<BloqueioProcesso | null>(null);

/** O id do texto que explica o portão de um item (o botão aponta para ele com `aria-describedby`). */
export const idExplicacaoDoPasso = (itemId: string): string => `explicacao-passo-${itemId}`;

/** Executa o passo de um item; `null` fora do provider (então os botões só abrem a ficha). */
export const useProcesso = (): ProcessoValor | null => useContext(ProcessoContext);

/** Os atributos que marcam o botão do passo de um item: é por eles que o foco o encontra depois de o cartão mudar de sítio. */
export const ATRIBUTO_ITEM = "data-passo-item";
export const ATRIBUTO_PESSOA = "data-passo-pessoa";

/**
 * O clique do botão do passo de um item: executa o passo se este já executa e há provider; senão abre a ficha. Devolve
 * também se executa (o texto do botão deixa de dizer "abre a ficha"), os atributos que o marcam para o foco e, se um portão
 * acabou de o travar, a explicação (`bloqueio`) para o cartão a mostrar junto ao botão.
 */
export function useAcaoDoPasso(item: ItemProcesso | undefined, aoAbrir: () => void) {
  const processo = useProcesso();
  const travado = useContext(BloqueioContext);
  const passo = item ? passoDoItem(item).id : null;
  const executa = processo !== null && item !== undefined && passo !== null && ehExecutavel(passo);
  const bloqueio = item && travado && travado.itemId === item.id && travado.passo === passo ? travado.texto : null;
  return {
    executa,
    bloqueio,
    idBloqueio: item ? idExplicacaoDoPasso(item.id) : undefined,
    atributos: {
      ...(item ? { [ATRIBUTO_ITEM]: item.id, [ATRIBUTO_PESSOA]: item.pessoaId } : {}),
      ...(item && bloqueio ? { "aria-describedby": idExplicacaoDoPasso(item.id) } : {}),
    },
    aoClicar: (e: MouseEvent<HTMLElement>) => {
      if (executa && processo && item) processo.executar(item, e.currentTarget);
      else aoAbrir();
    },
  };
}
