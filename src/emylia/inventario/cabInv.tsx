// O cabeçalho de cada ecrã do Inventário, igual ao do mockup (função head()): o rótulo pequeno "Inventário › Grupo", o título, o texto e as ações.
// Os textos são os do mockup, palavra por palavra.
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useCtxInv } from "./ctxInv";
import type { AbaInv, Destino } from "./ctxInv";
import { NOME_ABA, TITULOS, grupoDe } from "./menuInv";
import { podePerfil } from "./perfil";


/** O cabeçalho do ecrã `aba`; `acoes` são os botões à direita (o Hoje tem os seus). */
export function Cab({ aba }: { aba: AbaInv }) {
  const { registarAcoes, ir, perfil } = useCtxInv();
  const [titulo, sub] = TITULOS[aba];
  const g = grupoDe(aba);
  const separadores = g?.itens.filter((i) => podePerfil(perfil, i.perm));
  return (
    <>
      {separadores ? (
        <div className="tabs" role="tablist" aria-label={g?.t}>
          {separadores.map((i) => (
            <button key={i.aba} type="button" role="tab" aria-selected={i.aba === aba} className={`tab${i.aba === aba ? " on" : ""}`} onClick={() => ir({ aba: i.aba } as Destino)}>
              {NOME_ABA[i.aba]}{i.novo ? <span className="new">Novo</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    <div className="ph">
      <div>
        <div className="crumbs">{`Inventário${g ? ` › ${g.t}` : ""}`}</div>
        <h1>{titulo}</h1>
        <p className="muted" style={{ marginTop: 4, maxWidth: 760 }}>{sub}</p>
      </div>
      <div className="ph-actions" ref={registarAcoes} />
    </div>
    </>
  );
}

/** As ações do ecrã, desenhadas dentro do cabeçalho (`.ph-actions`) onde o mockup as põe. */
export function AcoesCab({ children }: { children: ReactNode }) {
  const { alvoAcoes } = useCtxInv();
  return alvoAcoes ? createPortal(children, alvoAcoes) : null;
}

/** A fonte de dados de cada bloco (o interruptor "Mostrar fontes de dados" do topo mostra-as). */
export const Fonte = ({ children }: { children: string }) => <span className="src" title="Fonte de dados">{children}</span>;
