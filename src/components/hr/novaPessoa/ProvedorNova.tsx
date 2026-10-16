import type { ReactNode } from "react";
import { Contexto, type ContextoNova } from "./contextoNova";

/** Entrega ao painel «Nova pessoa» os valores, o que a configuração diz de cada campo, a conta, os anexos e as permissões. */
export function ProvedorNova({ valor, children }: { valor: ContextoNova; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
