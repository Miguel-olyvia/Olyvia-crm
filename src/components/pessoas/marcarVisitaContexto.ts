// O que o botão "Marcar visita" de cada cartão de submissão precisa de saber (ver `MarcarVisita.tsx`, que o provê).
import { createContext, useContext } from "react";

/** Quem pede a visita: a pessoa a que a submissão está ligada e o serviço de que pediu a visita. */
export interface PedidoVisita {
  pessoaId: string;
  nome: string;
  servico: string;
}

export interface MarcarVisitaValor {
  /** Abre o diálogo para esta pessoa. */
  pedir: (pedido: PedidoVisita) => void;
  /** As pessoas a quem já se marcou uma visita nesta sessão (o botão deixa de se mostrar). */
  marcadas: ReadonlySet<string>;
}

export const MarcarVisitaContext = createContext<MarcarVisitaValor | null>(null);

/** Abre o diálogo para uma pessoa; `null` fora do provider (então o botão "Marcar visita" não se mostra). */
export const useMarcarVisita = (): MarcarVisitaValor | null => useContext(MarcarVisitaContext);
