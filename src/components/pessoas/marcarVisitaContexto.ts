// O que o botão "Marcar visita" de cada cartão de submissão precisa de saber (ver `MarcarVisita.tsx`, que o provê).
import { createContext, useContext } from "react";

import type { MoradaVisita } from "./pessoasTipos";

/**
 * Quem pede a visita: a pessoa, o pedido a que a visita vai, o serviço dele e a morada que a lead indicou (`null` sem morada). Sem
 * `pedidoId` (uma submissão que pede visita) vale o primeiro pedido da pessoa ainda sem visita, ou cria-se um com este serviço.
 */
export interface PedidoVisita {
  pessoaId: string;
  pedidoId?: string;
  nome: string;
  servico: string;
  /** O nome do pedido (ver `nomeDoPedido`), quando o pedido já existe: diz-se na descrição do diálogo. */
  pedidoNome?: string;
  moradaLead: MoradaVisita | null;
}

export interface MarcarVisitaValor {
  /** Abre o diálogo para esta pessoa. */
  pedir: (pedido: PedidoVisita) => void;
  /** As pessoas que já têm uma visita marcada (a deste ecrã ou a de um pedido): o botão "Marcar visita" deixa de se mostrar. */
  marcadas: ReadonlySet<string>;
}

export const MarcarVisitaContext = createContext<MarcarVisitaValor | null>(null);

/** Abre o diálogo para uma pessoa; `null` fora do provider (então o botão "Marcar visita" não se mostra). */
export const useMarcarVisita = (): MarcarVisitaValor | null => useContext(MarcarVisitaContext);
