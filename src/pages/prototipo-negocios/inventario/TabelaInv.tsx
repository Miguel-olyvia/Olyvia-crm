// A tabela de todas as listas do Inventário: cabeçalhos que ordenam (botão com aria-sort), linha que abre o detalhe (clique ou Enter, e as setas/j/k movem o foco),
// e abaixo de lg cada linha passa a cartão. Texto de 15 px, alvos de 44 px. A primeira coluna é só texto: é ela que leva o botão da linha.
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FOCO } from "../FiltrosPopover";
import { useDesktop } from "../useDesktop";
import { ordenarPor, type Chave, type Direcao } from "../funcOrdenar";

export interface Coluna<T> {
  id: string; titulo: string; celula: (t: T) => ReactNode;
  /** Com valor, o cabeçalho ordena a lista por ele. */
  valor?: (t: T) => Chave; direita?: boolean; largura?: string;
}
export interface Ordem { col: string; dir: Direcao }

interface Props<T> {
  colunas: readonly Coluna<T>[]; linhas: readonly T[]; chave: (t: T) => string; titulo: string;
  abrir?: (t: T) => void; acoes?: (t: T) => ReactNode; ordemInicial?: Ordem; classeLinha?: (t: T) => string; rotuloAbrir?: (t: T) => string;
  /** A tabela rola na horizontal dentro da folha (em vez de se esticar). */
  rolar?: boolean;
}

function Cabecalho<T>({ c, ordem, ordenar }: { c: Coluna<T>; ordem: Ordem | null; ordenar: (id: string) => void }) {
  const sort = ordem?.col === c.id ? (ordem.dir === "asc" ? "ascending" : "descending") : "none";
  const I = sort === "ascending" ? ArrowUp : sort === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead scope="col" aria-sort={c.valor ? sort : undefined} className={cn("h-11 px-2 text-[15px] font-medium", c.direita && "text-right", c.largura)}>
      {c.valor ? (
        <button type="button" onClick={() => ordenar(c.id)} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1", FOCO)}>
          {c.titulo}<I className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{sort === "none" ? ", ordenar" : sort === "ascending" ? ", por ordem crescente" : ", por ordem decrescente"}</span>
        </button>
      ) : c.titulo}
    </TableHead>
  );
}

function Cartao<T>({ t, p }: { t: T; p: Props<T> }) {
  const [primeira, ...resto] = p.colunas;
  const k = p.chave(t);
  return (
    <li className={cn("grid gap-1 px-2 py-2", p.classeLinha?.(t))} onClick={() => p.abrir?.(t)}>
      {p.abrir ? (
        <button type="button" data-linha-func="" data-chave={k} aria-haspopup="dialog" aria-label={p.rotuloAbrir?.(t)} className={cn("min-h-11 w-full cursor-pointer rounded-md text-left text-base font-semibold", FOCO)}>{primeira.celula(t)}</button>
      ) : <span className="text-base font-semibold">{primeira.celula(t)}</span>}
      <dl className="grid gap-0.5 text-[15px]">
        {resto.map((c) => <div key={c.id} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{c.titulo}</dt><dd className="min-w-0">{c.celula(t)}</dd></div>)}
      </dl>
      {p.acoes && <div className="flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>{p.acoes(t)}</div>}
    </li>
  );
}

function Linha<T>({ t, p }: { t: T; p: Props<T> }) {
  const [primeira, ...resto] = p.colunas;
  const k = p.chave(t);
  return (
    <TableRow onClick={() => p.abrir?.(t)} className={cn(p.abrir && "cursor-pointer hover:bg-muted/60 focus-within:bg-muted/60", p.classeLinha?.(t))}>
      <TableCell className="px-2 py-1 align-middle text-[15px]">
        {p.abrir ? <button type="button" data-linha-func="" data-chave={k} aria-haspopup="dialog" aria-label={p.rotuloAbrir?.(t)} className={cn("min-h-11 w-full cursor-pointer rounded-md text-left font-semibold", FOCO)}>{primeira.celula(t)}</button> : primeira.celula(t)}
      </TableCell>
      {resto.map((c) => <TableCell key={c.id} className={cn("px-2 py-1 align-middle text-[15px]", c.direita && "text-right tabular-nums")}>{c.celula(t)}</TableCell>)}
      {p.acoes && <TableCell className="px-2 py-1" onClick={(e) => e.stopPropagation()}><div className="flex flex-wrap justify-end gap-2">{p.acoes(t)}</div></TableCell>}
    </TableRow>
  );
}

export function TabelaInv<T>(p: Props<T>) {
  const desktop = useDesktop();
  const [ordem, setOrdem] = useState<Ordem | null>(p.ordemInicial ?? null);
  const col = p.colunas.find((c) => c.id === ordem?.col);
  const linhas = col?.valor && ordem ? ordenarPor(p.linhas, col.valor, ordem.dir) : p.linhas;
  const ordenar = (id: string): void => setOrdem((o) => (o?.col === id ? { col: id, dir: o.dir === "asc" ? "desc" : "asc" } : { col: id, dir: "asc" }));
  if (!desktop) return <ul className="divide-y divide-border border-y border-border" aria-label={p.titulo}>{linhas.map((t) => <Cartao key={p.chave(t)} t={t} p={p} />)}</ul>;
  return (
    <Table className="text-[15px]" containerClassName={p.rolar ? "overflow-x-auto" : "overflow-visible"}>
      <TableCaption className="sr-only">{p.titulo}. Os cabeçalhos com botão ordenam a lista.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {p.colunas.map((c) => <Cabecalho key={c.id} c={c} ordem={ordem} ordenar={ordenar} />)}
          {p.acoes && <TableHead scope="col" className="h-11 px-2 text-right text-[15px] font-medium">Ações</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>{linhas.map((t) => <Linha key={p.chave(t)} t={t} p={p} />)}</TableBody>
    </Table>
  );
}
