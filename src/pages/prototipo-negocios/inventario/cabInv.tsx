// O cabeçalho de cada ecrã do Inventário, igual ao do mockup (função head()): o rótulo pequeno "Inventário › Grupo", o título, o texto e as ações.
// Os textos são os do mockup, palavra por palavra.
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useCtxInv } from "./ctxInv";
import type { AbaInv } from "./ctxInv";
import { TITULOS, grupoDe } from "./menuInv";


/** O cabeçalho do ecrã `aba`; `acoes` são os botões à direita (o Hoje tem os seus). */
export function Cab({ aba }: { aba: AbaInv }) {
  const { registarAcoes } = useCtxInv();
  const [titulo, sub] = TITULOS[aba];
  const g = grupoDe(aba);
  return (
    <div className="ph">
      <div>
        <div className="crumbs">Inventário{g ? ` › ${g.t}` : ""}</div>
        <h1>{titulo}</h1>
        <p className="muted" style={{ marginTop: 4, maxWidth: 760 }}>{sub}</p>
      </div>
      <div className="ph-actions" ref={registarAcoes} />
    </div>
  );
}

/** As ações do ecrã, desenhadas dentro do cabeçalho (`.ph-actions`) onde o mockup as põe. */
export function AcoesCab({ children }: { children: ReactNode }) {
  const { alvoAcoes } = useCtxInv();
  return alvoAcoes ? createPortal(children, alvoAcoes) : null;
}

/** A fonte de dados de cada bloco (o interruptor "Mostrar fontes de dados" do topo mostra-as). */
export const Fonte = ({ children }: { children: string }) => <span className="src">{children}</span>;
