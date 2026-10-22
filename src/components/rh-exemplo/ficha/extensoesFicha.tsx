// Ponto de extensão opcional da ficha da pessoa: quem embebe o RH (por exemplo o protótipo de negócios) pode juntar blocos seus ao fim da
// Visão geral, sem a ficha os conhecer. Sem fornecedor (o caso normal), não desenha nada e a ficha fica igual.
import { createContext, useContext, type ReactNode } from "react";

/** Desenha os blocos extra da ficha de `pessoaId` (ou null quando não há nada a juntar para essa pessoa). */
export type BlocosExtraFicha = (pessoaId: string) => ReactNode;

const ContextoExtensoes = createContext<BlocosExtraFicha | null>(null);

/** Fornece os blocos extra às fichas que abrirem por baixo dele. */
export const ExtensoesFichaRh = ContextoExtensoes.Provider;

/** Onde a ficha põe os blocos extra; sem fornecedor, nada. */
export function BlocosExtraDaFicha({ pessoaId }: { pessoaId: string }) {
  const blocos = useContext(ContextoExtensoes);
  if (!blocos) return null;
  return <div className="mt-4 space-y-4">{blocos(pessoaId)}</div>;
}
