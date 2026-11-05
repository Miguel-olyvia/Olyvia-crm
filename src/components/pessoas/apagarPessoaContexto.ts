// «Apagar lead» / «Apagar cliente» no menu «Mais» da ficha: só a ficha real o liga (quem monta sabe a organização, as permissões e tem o diálogo).
// Sem o contexto (o exemplo, os testes antigos) o item não existe.
import { createContext, useContext } from "react";

export interface ApagarPessoaFicha {
  /** A sessão pode apagar ESTA pessoa (pessoas.delete, pessoas.edit e leads.delete ou clients.delete, conforme o papel). */
  pode: boolean;
  /** Abre a confirmação; `origem` é o elemento a que o foco volta se se cancelar. */
  abrir: (origem: HTMLElement | null) => void;
}

export const ApagarPessoaFichaContext = createContext<ApagarPessoaFicha | null>(null);

export function useApagarPessoaFicha(): ApagarPessoaFicha | null {
  return useContext(ApagarPessoaFichaContext);
}
