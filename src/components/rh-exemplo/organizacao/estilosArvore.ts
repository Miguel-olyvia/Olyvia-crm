/** Constantes partilhadas pelas linhas da árvore da organização (à parte dos componentes, para o fast refresh). */

/** O identificador do cartão de um item: é o que dá o nome acessível ao `treeitem` (`aria-labelledby`). */
export const idRotuloNo = (id: string): string => `rhOrg-no-${id}`;

/** O anel de foco visível, no cartão do próprio item (não nos dos itens aninhados). */
export const ANEL_FOCO =
  "[&:focus-visible>div>div:last-child]:ring-2 [&:focus-visible>div>div:last-child]:ring-ring [&:focus-visible>div>div:last-child]:ring-offset-2 [&:focus-visible>div>div:last-child]:ring-offset-background";
