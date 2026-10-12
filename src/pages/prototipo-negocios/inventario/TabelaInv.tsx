// A tabela de todas as listas do Inventário, com o DOM do mockup (função tbl()): `.tw > table`, cabeçalhos que ordenam (`button.sort`), linhas `tr.click` que abrem o detalhe
// (clique ou Enter, e as setas/j/k movem o foco) e a coluna de ações fixa à direita (`td.act`). Sem cartões: a tabela rola na horizontal.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ordenarPor, type Chave, type Direcao } from "../funcOrdenar";

export interface Coluna<T> {
  id: string; titulo: ReactNode; celula: (t: T) => ReactNode;
  /** Com valor, o cabeçalho ordena a lista por ele. */
  valor?: (t: T) => Chave; direita?: boolean; largura?: string;
  /** O nome do cabeçalho para leitores de ecrã quando `titulo` não é texto (por exemplo uma caixa de seleção). */
  nome?: string;
}
export interface Ordem { col: string; dir: Direcao }

interface Props<T> {
  colunas: readonly Coluna<T>[]; linhas: readonly T[]; chave: (t: T) => string; titulo: string;
  abrir?: (t: T) => void; acoes?: (t: T) => ReactNode; ordemInicial?: Ordem; classeLinha?: (t: T) => string; rotuloAbrir?: (t: T) => string;
  /** Largura mínima da tabela, como as classes min-560 ... min-1000 do mockup. */
  minimo?: 560 | 640 | 900 | 1000;
  /** Mantido por compatibilidade: a tabela já rola na horizontal. */
  rolar?: boolean;
  /** Uma linha extra por baixo de cada linha (por exemplo o detalhe de um grupo). */
  extra?: (t: T) => ReactNode;
}

function Cabecalho<T>({ c, ordem, ordenar }: { c: Coluna<T>; ordem: Ordem | null; ordenar: (id: string) => void }) {
  const sort = ordem?.col === c.id ? (ordem.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={c.valor ? sort : undefined} className={cn(c.direita && "num")} aria-label={c.nome}>
      {c.valor ? <button type="button" className="sort" onClick={() => ordenar(c.id)}>{c.titulo}{sort === "ascending" ? " ↑" : sort === "descending" ? " ↓" : ""}</button> : c.titulo}
    </th>
  );
}

function Linha<T>({ t, p }: { t: T; p: Props<T> }) {
  const k = p.chave(t);
  const abre = p.abrir;
  return (
    <>
      <tr className={cn(abre && "click", p.classeLinha?.(t))} tabIndex={abre ? 0 : undefined} data-linha-func={abre ? "" : undefined} data-chave={abre ? k : undefined}
        aria-label={abre ? p.rotuloAbrir?.(t) : undefined} aria-haspopup={abre ? "dialog" : undefined}
        onClick={abre ? () => abre(t) : undefined} onKeyDown={abre ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) abre(t); } : undefined}>
        {p.colunas.map((c) => <td key={c.id} className={cn(c.direita && "num")}>{c.celula(t)}</td>)}
        {p.acoes && <td className="act" onClick={(e) => e.stopPropagation()}><div className="row-act">{p.acoes(t)}</div></td>}
      </tr>
      {p.extra?.(t)}
    </>
  );
}

export function TabelaInv<T>(p: Props<T>) {
  const [ordem, setOrdem] = useState<Ordem | null>(p.ordemInicial ?? null);
  const col = p.colunas.find((c) => c.id === ordem?.col);
  const linhas = col?.valor && ordem ? ordenarPor(p.linhas, col.valor, ordem.dir) : p.linhas;
  const ordenar = (id: string): void => setOrdem((o) => (o?.col === id ? { col: id, dir: o.dir === "asc" ? "desc" : "asc" } : { col: id, dir: "asc" }));
  return (
    <div className="tw">
      <table className={p.minimo ? `min-${p.minimo}` : undefined}>
        <caption className="sr">{p.titulo}. Os cabeçalhos com botão ordenam a lista.</caption>
        <thead>
          <tr>
            {p.colunas.map((c) => <Cabecalho key={c.id} c={c} ordem={ordem} ordenar={ordenar} />)}
            {p.acoes && <th scope="col" className="acth"><span className="sr">Ações</span></th>}
          </tr>
        </thead>
        <tbody>{linhas.map((t) => <Linha key={p.chave(t)} t={t} p={p} />)}</tbody>
      </table>
    </div>
  );
}
