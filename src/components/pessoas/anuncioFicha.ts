import { createContext, useContext } from "react";

export type Anunciar = (mensagem: string) => void;

/**
 * O anúncio para o leitor de ecrã de dentro da ficha. Os toasts vivem fora do painel lateral (que o Radix marca como
 * `aria-hidden` no resto da página), por isso o que só aparece num toast também se envia por aqui.
 */
export const AnuncioFichaContext = createContext<Anunciar>(() => undefined);

export const useAnunciar = (): Anunciar => useContext(AnuncioFichaContext);
