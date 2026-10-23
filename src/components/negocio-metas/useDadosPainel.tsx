// Os dados que o painel de um negócio vai buscar fora do negócio: a ficha da pessoa e os detalhes (orçamentos,
// proposta, contrato). Um provider à volta da página (mesmo padrão de `useWorkflowExemplo.tsx`) deixa a página
// escolher de onde vêm; sem provider, quem lê recebe "sem dados" e o painel mostra os estados vazios.
// Este módulo não importa de pessoas: a página converte a ficha para `DadosPessoaPainel`.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { DadosPessoaPainel } from "@/components/ficha-comum/dadosPessoaPainel";
import type { DetalheNegocio } from "./negocioDetalhes";

export interface DadosPainel {
  /** A ficha da pessoa a que o negócio pertence (pelo `pessoaId`); `null` sem ficha. */
  pessoaDe: (pessoaId: string) => DadosPessoaPainel | null;
  /** Os detalhes de um negócio (pelo `id`); `null` sem detalhes. */
  detalheDe: (negocioId: string) => DetalheNegocio | null;
}

const SEM_DADOS: DadosPainel = { pessoaDe: () => null, detalheDe: () => null };

export const DadosPainelContext = createContext<DadosPainel | null>(null);

/** Os dados do painel; fora do provider não há pessoa nem detalhes. */
export function useDadosPainel(): DadosPainel {
  return useContext(DadosPainelContext) ?? SEM_DADOS;
}

interface DadosPainelProviderProps extends DadosPainel {
  children: ReactNode;
}

export function DadosPainelProvider({ pessoaDe, detalheDe, children }: DadosPainelProviderProps) {
  const valor = useMemo(() => ({ pessoaDe, detalheDe }), [pessoaDe, detalheDe]);
  return <DadosPainelContext.Provider value={valor}>{children}</DadosPainelContext.Provider>;
}
