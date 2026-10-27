import { createContext, type ReactNode } from "react";

// A altura do ecrã guiado do Pipeline. Em ecrã largo E alto (3 colunas, pelo menos 1024 x 704 px) a ficha tem a altura que sobra da janela: o cabeçalho
// do guia, a coluna dos passos e o cartão do cliente ficam fixos e só a coluna do meio rola. Abaixo disso (estreito ou baixo) nada disto se aplica e
// quem rola é a página, como sempre. As classes estão escritas por extenso porque o Tailwind só vê o texto literal.
//
// A cadeia de alturas, de cima para baixo: zona da ficha (altura fixa) > secção da ficha > contentor da ficha > coluna > guia (flex) > grelha > centro (rola).
// Só a zona tem altura definida; os restantes seguem-na com `h-full` ou `flex-1 min-h-0`. Fora da página (o painel lateral) nenhum ancestral tem altura
// definida, por isso estas classes não fazem nada lá.

/** 3.5rem do cabeçalho do Layout + 4rem de `md:p-8` do contentor (2 x 2rem). É a única constante frágil: se o Layout mudar, muda aqui. */
export const ZONA_FICHA_ALTA =
  "[@media(min-width:1024px)_and_(min-height:44rem)]:h-[calc(100dvh-7.5rem)] [@media(min-width:1024px)_and_(min-height:44rem)]:overflow-hidden [@media(min-width:1024px)_and_(min-height:44rem)]:pb-4";

/** Ocupa a altura do pai (que tem altura definida). */
export const ALTURA_DO_PAI = "[@media(min-width:1024px)_and_(min-height:44rem)]:h-full";

/** Ocupa a altura do pai e distribui os filhos em coluna. */
export const COLUNA_DO_PAI = "[@media(min-width:1024px)_and_(min-height:44rem)]:flex [@media(min-width:1024px)_and_(min-height:44rem)]:h-full [@media(min-width:1024px)_and_(min-height:44rem)]:flex-col";

/** Um filho de uma coluna flex que fica com o que sobra e deixa o conteúdo encolher; ele próprio é uma coluna. */
export const RESTO_EM_COLUNA =
  "[@media(min-width:1024px)_and_(min-height:44rem)]:flex [@media(min-width:1024px)_and_(min-height:44rem)]:min-h-0 [@media(min-width:1024px)_and_(min-height:44rem)]:flex-1 [@media(min-width:1024px)_and_(min-height:44rem)]:flex-col";

/** O que fica fixo no topo da coluna (não encolhe). */
export const FIXO_NO_TOPO = "[@media(min-width:1024px)_and_(min-height:44rem)]:shrink-0";

/** A grelha de colunas do guia: ocupa o que sobra e a sua única linha tem essa altura. */
export const GRELHA_DO_GUIA =
  "[@media(min-width:1024px)_and_(min-height:44rem)]:min-h-0 [@media(min-width:1024px)_and_(min-height:44rem)]:flex-1 [@media(min-width:1024px)_and_(min-height:44rem)]:grid-rows-[minmax(0,1fr)]";

/** A coluna do meio: a única que rola. `scroll-py` deixa folga ao foco do teclado, que nunca fica escondido sob a borda. */
export const CENTRO_QUE_ROLA =
  "[@media(min-width:1024px)_and_(min-height:44rem)]:min-h-0 [@media(min-width:1024px)_and_(min-height:44rem)]:overflow-y-auto [@media(min-width:1024px)_and_(min-height:44rem)]:scroll-py-6";

/** O que acompanha um guia sem passo: rola, mas nunca come a grelha toda. */
export const RODAPE_SEM_PASSO = "[@media(min-width:1024px)_and_(min-height:44rem)]:max-h-[40%]";

/** As colunas laterais: fixas, e só rolam se não couberem (rede de segurança para uma janela baixa). */
export const LATERAL_FIXA =
  "[@media(min-width:1024px)_and_(min-height:44rem)]:max-h-full [@media(min-width:1024px)_and_(min-height:44rem)]:overflow-y-auto";

/**
 * O que a ficha da página põe por baixo do guia (os painéis em linha abertos: Nota, Adiar, Encerrar, Visita, chamada). Em ecrã largo o guia tem altura fixa
 * e por baixo não há sítio: o guia desenha isto no fim da coluna que rola. Fora da página (sem valor) a ficha desenha-os por baixo, como sempre.
 */
export const RodapeGuiaContext = createContext<ReactNode>(null);
