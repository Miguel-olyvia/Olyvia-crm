// A tabela de todas as listas do Inventário, com o DOM do mockup (função tbl()): `.tw > table`, cabeçalhos que ordenam (`button.sort`), linhas `tr.click` que abrem o detalhe
// (clique ou Enter, e as setas/j/k movem o foco) e a coluna de ações fixa à direita (`td.act`). Sem cartões: abaixo de lg as colunas secundárias escondem-se.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ordenarPor, type Chave, type Direcao } from "../funcOrdenar";

export interface Coluna<T> {
  id: string; titulo: ReactNode; celula: (t: T) => ReactNode;
  /** Com valor, o cabeçalho ordena a lista por ele. */
  valor?: (t: T) => Chave; direita?: boolean; largura?: string;
  /** O nome do cabeçalho para leitores de ecrã quando `titulo` não é texto (por exemplo uma caixa de seleção). */
  nome?: string;
  /** Classe extra da célula (por exemplo `nowrap` ou `late`, como no mockup). */
  classe?: (t: T) => string;
  /** Estilo da célula (por exemplo `font-size:12.5px`, como no mockup); `largura` é o `min-width`. */
  estilo?: React.CSSProperties;
  /** 27/10: abaixo de lg a coluna esconde-se (sem scroll lateral). Sem valor: as três primeiras ficam, as outras escondem-se. */
  secundaria?: boolean;
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
  /** O que se mostra numa linha única quando não há linhas (o `empty()` dentro de `<td colspan>` do mockup). */
  vazio?: ReactNode;
  /** 19/10: uma linha antes desta (por exemplo o cabeçalho de um grupo, dentro da mesma tabela, como na Receção). */
  antes?: (t: T, i: number) => ReactNode;
  /** O id da linha no DOM (para lá rolar e a destacar). */
  idLinha?: (t: T) => string | undefined;
  /** A classe da tabela (por exemplo o desenho em cartões no telemóvel). */
  classeTabela?: string;
}

const POR_PAGINA = 40;
// 27/10: a largura mínima (min-560 … min-1000, inventario.css) só vale a partir de lg; abaixo, as colunas secundárias escondem-se e a tabela cabe sem rolar
const SEM_MINIMO = "max-lg:!min-w-0";
const SECUNDARIA = "hidden lg:table-cell";
/** As colunas que se escondem abaixo de lg (não nas tabelas que já viram cartões no telemóvel, com `classeTabela`). */
const secundarias = <T,>(p: Props<T>): Set<string> =>
  new Set(p.classeTabela ? [] : p.colunas.filter((c, i) => c.secundaria ?? i >= 3).map((c) => c.id));

function Cabecalho<T>({ c, ordem, ordenar, sec }: { c: Coluna<T>; ordem: Ordem | null; ordenar: (id: string) => void; sec: boolean }) {
  const sort = ordem?.col === c.id ? (ordem.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={c.valor ? sort : undefined} className={cn(c.direita && "num", sec && SECUNDARIA)} aria-label={c.nome}>
      {c.valor ? <button type="button" className="sort" onClick={() => ordenar(c.id)}>{c.titulo}{sort === "ascending" ? " ↑" : sort === "descending" ? " ↓" : ""}</button> : c.titulo}
    </th>
  );
}

function Linha<T>({ t, p, i, sec }: { t: T; p: Props<T>; i: number; sec: Set<string> }) {
  const k = p.chave(t);
  const abre = p.abrir;
  return (
    <>
      {p.antes?.(t, i)}
      <tr id={p.idLinha?.(t)} className={cn(abre && "click", p.classeLinha?.(t))} tabIndex={abre ? 0 : undefined} data-linha-func={abre ? "" : undefined} data-chave={abre ? k : undefined}
        aria-label={abre ? p.rotuloAbrir?.(t) : undefined} aria-haspopup={abre ? "dialog" : undefined}
        onClick={abre ? () => abre(t) : undefined} onKeyDown={abre ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) abre(t); } : undefined}>
        {p.colunas.map((c) => <td key={c.id} className={cn(c.direita && "num", c.classe?.(t), sec.has(c.id) && SECUNDARIA)} style={c.largura || c.estilo ? { minWidth: c.largura, ...c.estilo } : undefined}>{c.celula(t)}</td>)}
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
  // 27/10: mostra 40 linhas; o resto atrás de «Mostrar mais»
  const [n, setN] = useState(POR_PAGINA);
  const sec = secundarias(p);
  const vistas = linhas.slice(0, n), faltam = linhas.length - vistas.length;
  return (
    <>
    <div className="tw">
      <table className={cn(p.minimo && [`min-${p.minimo}`, SEM_MINIMO], p.classeTabela) || undefined}>
        <caption className="sr">{p.titulo}. Os cabeçalhos com botão ordenam a lista.</caption>
        <thead>
          <tr>
            {p.colunas.map((c) => <Cabecalho key={c.id} c={c} ordem={ordem} ordenar={ordenar} sec={sec.has(c.id)} />)}
            {p.acoes && <th scope="col" className="acth"><span className="sr">Ações</span></th>}
          </tr>
        </thead>
        <tbody>{linhas.length === 0 && p.vazio ? <tr><td colSpan={p.colunas.length + (p.acoes ? 1 : 0)}>{p.vazio}</td></tr> : vistas.map((t, i) => <Linha key={p.chave(t)} t={t} p={p} i={i} sec={sec} />)}</tbody>
      </table>
    </div>
    {faltam > 0 && <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setN(n + POR_PAGINA)}>Mostrar mais ({faltam})</button>}
    </>
  );
}
