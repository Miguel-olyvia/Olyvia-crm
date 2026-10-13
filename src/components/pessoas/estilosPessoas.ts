/**
 * Abas sublinhadas, como as do Inventário (`InventoryPageHeader`): a ativa com o sublinhado e a cor primária, a inativa
 * transparente. Por cima de `ui/tabs` (que não se altera) só com classes: sem fundo, sem cantos e sem sombra.
 */
export const LISTA_ABAS =
  "h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0 text-muted-foreground";

export const ABA = [
  "min-h-11 shrink-0 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-normal shadow-none",
  "text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none",
  // O anel só com o teclado (Tab, setas): depois de um clique com o rato não fica caixa nenhuma à volta da aba.
  "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
  "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-medium",
  // Escuro: o roxo da marca fica a ~3,3:1 sobre o fundo; violet-300 passa dos 4,5:1. O sublinhado mantém border-primary.
  "data-[state=active]:text-primary dark:data-[state=active]:text-violet-300 data-[state=active]:shadow-none",
].join(" ");
