// O levantamento de um negócio no Pipeline faz-se no assistente de passos da fase Visita (`VisitaDoGuia`), no próprio ecrã e sem painel lateral. Este provider
// só diz ao guia se o levantamento pode gravar-se (a base é a fonte e quem está na sessão pode editar a ficha) e dá-lhe a ficha lida da base, com que o
// assistente grava. Vive à parte do `ProcessoProviderReal` (cujo contrato não muda). Sem ficha, sem a base ou sem permissão para editar, `pode` é falso.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";

export interface LevantamentoDoNegocioValor {
  /** Pode gravar-se: a base é a fonte e a ficha pode ser editada por quem está na sessão. */
  pode: boolean;
  /** A ficha lida da base, com que o assistente do Pipeline grava o levantamento; `null` se não há. */
  ficha?: FichaDb | null;
}

const LevantamentoDoNegocioContext = createContext<LevantamentoDoNegocioValor | null>(null);

/** O levantamento do negócio; `null` fora do provider (o exemplo, e as fichas sem a base). */
export const useLevantamentoDoNegocio = (): LevantamentoDoNegocioValor | null => useContext(LevantamentoDoNegocioContext);

export function LevantamentoDoNegocioProvider({ ficha, children }: { ficha: FichaDb | null; children: ReactNode }) {
  const fonte = useFontePessoas();
  const pessoaDaFicha = ficha?.pessoa.id ?? null;
  const pode = fonte.modo === "real" && ficha?.permissoes.editar === true;
  const valor = useMemo<LevantamentoDoNegocioValor | null>(() => (pessoaDaFicha ? { pode, ficha } : null), [pessoaDaFicha, pode, ficha]);
  return <LevantamentoDoNegocioContext.Provider value={valor}>{children}</LevantamentoDoNegocioContext.Provider>;
}
