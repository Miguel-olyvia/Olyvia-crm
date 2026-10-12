// O cabeçalho de cada ecrã do Inventário, igual ao do mockup (função head()): o rótulo pequeno "Inventário › Grupo", o título, o texto e as ações.
// Os textos são os do mockup, palavra por palavra.
import type { ReactNode } from "react";
import type { AbaInv } from "./ctxInv";
import { TITULOS, grupoDe } from "./menuInv";


/** O cabeçalho do ecrã `aba`; `acoes` são os botões à direita (o Hoje tem os seus). */
export function Cab({ aba, acoes }: { aba: AbaInv; acoes?: ReactNode }) {
  const [titulo, sub] = TITULOS[aba];
  const g = grupoDe(aba);
  return (
    <div className="ph">
      <div>
        <div className="crumbs">Inventário{g ? ` › ${g.t}` : ""}</div>
        <h1>{titulo}</h1>
        <p className="muted" style={{ marginTop: 4, maxWidth: 760 }}>{sub}</p>
      </div>
      {acoes ? <div className="ph-actions">{acoes}</div> : null}
    </div>
  );
}

/** A fonte de dados de cada bloco (o interruptor "Mostrar fontes de dados" do topo mostra-as). */
export const Fonte = ({ children }: { children: string }) => <span className="src">{children}</span>;
