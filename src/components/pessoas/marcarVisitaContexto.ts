// O que o botão "Marcar visita" de cada cartão de submissão precisa de saber (ver `MarcarVisita.tsx`, que o provê).
import { createContext, useContext } from "react";

import type { MoradaVisita } from "./pessoasTipos";

/** Quem pede a visita: a pessoa a que a submissão está ligada, o serviço de que pediu a visita e a morada que a lead indicou (`null` sem morada). */
export interface PedidoVisita {
  pessoaId: string;
  nome: string;
  servico: string;
  moradaLead: MoradaVisita | null;
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
