// Devolver o foco depois de fechar o diálogo de um passo. O botão que o abriu pode já não existir (o cartão mudou de coluna,
// ou o pedido virou negócio), por isso procura-se, por esta ordem: o botão do mesmo item, o de outro item da mesma pessoa,
// o botão de origem (se ainda está na página) e o nome da pessoa.
import { ATRIBUTO_ITEM, ATRIBUTO_PESSOA } from "./processoContexto";

export interface OrigemFoco {
  itemId: string;
  pessoaId: string;
  /** O botão clicado; pode já não estar na página. */
  origem: HTMLElement | null;
}

const procurar = (atributo: string, valor: string): HTMLElement | undefined =>
  Array.from(document.querySelectorAll<HTMLElement>(`[${atributo}]`)).find((e) => e.getAttribute(atributo) === valor);

/** Põe o foco no botão certo e diz se o conseguiu (então o diálogo não devolve o foco por si). */
export function devolverFoco(o: OrigemFoco): boolean {
  const alvo = procurar(ATRIBUTO_ITEM, o.itemId) ?? procurar(ATRIBUTO_PESSOA, o.pessoaId)
    ?? (o.origem?.isConnected ? o.origem : undefined) ?? procurar("data-linha-pessoa", o.pessoaId);
  alvo?.focus();
  return alvo !== undefined;
}
