// O que o botão "Marcar visita" de cada cartão de submissão precisa de saber (ver `MarcarVisita.tsx`, que o provê).
import { createContext, useContext } from "react";

import type { MoradaVisita } from "./pessoasTipos";

/** Para quem se marca a visita: a pessoa, o nome dela e a morada que a lead indicou (`null` sem morada). A visita é da pessoa. */
export interface AberturaVisita {
  pessoaId: string;
  nome: string;
  moradaLead: MoradaVisita | null;
  /** O `anew_users.id` do responsável da pessoa (só com a base ligada): o recurso dele vai escolhido por omissão. */
  responsavelUserId?: string | null;
  /** O negócio aberto de que se marca a visita: a visita nasce ligada a ele. Sem isto nasce por ligar. */
  negocioId?: string | null;
  /** O que se preparou no passo «Preparar a visita» do assistente: já vai escolhido no diálogo (e pode mudar-se). Sem isto o diálogo abre como sempre. */
  preparar?: { duracao: string; quemVaiEstar: string; nota: string };
  /** Chamada depois de marcar (só o exemplo): `ligada` diz se a visita ficou onde se pediu (ligada ao negócio, ou por ligar se não se pediu negócio). */
  aoMarcada?: (ligada: boolean) => void;
}

export interface MarcarVisitaValor {
  /** Abre o diálogo para esta pessoa. */
  pedir: (abertura: AberturaVisita) => void;
  /** As pessoas que já têm uma visita marcada (a deste ecrã ou uma por ligar nos registos): o botão "Marcar visita" deixa de se mostrar. */
  marcadas: ReadonlySet<string>;
}

export const MarcarVisitaContext = createContext<MarcarVisitaValor | null>(null);

/** Abre o diálogo para uma pessoa; `null` fora do provider (então o botão "Marcar visita" não se mostra). */
export const useMarcarVisita = (): MarcarVisitaValor | null => useContext(MarcarVisitaContext);
