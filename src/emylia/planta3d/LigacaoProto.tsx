// Ligação de texto entre os dois protótipos (planta 3D e configurador de famílias): abre no mesmo separador, sem recarregar a página
// (para as famílias da sessão não se perderem). Fora de um Router (testes isolados da planta) é um <a> normal.
import { useInRouterContext, Link } from "react-router-dom";
import type { ReactNode } from "react";

const CLASSE = "inline-flex min-h-11 items-center rounded-full border border-input bg-background px-4 py-2 text-[15px] font-medium text-primary underline underline-offset-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function LigacaoProto({ para, children }: { para: string; children: ReactNode }) {
  const dentroDoRouter = useInRouterContext();
  return dentroDoRouter ? <Link to={para} className={CLASSE}>{children}</Link> : <a href={para} className={CLASSE}>{children}</a>;
}
