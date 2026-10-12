// A Lista de Negócios V2: uma linha por negócio (os mesmos que o Quadro mostra, com a mesma pesquisa e os mesmos filtros), com cabeçalhos que ordenam (botão com aria-sort).
// Carregar numa linha abre o mesmo painel que o cartão abre no Quadro (quem a usa decide o que abrir).
import { useState } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import { COLUNAS_V2, type CartaoV2 } from "./negociosDocs";
import type { LinhaN } from "./filtrosNegocios";
import { ordenarPor, type Chave, type Direcao } from "./funcOrdenar";

type Coluna = "pessoa" | "servico" | "fase" | "valor" | "parado" | "proximo" | "comercial";
interface Def { id: Coluna; nome: string; dir: Direcao; chave: (l: LinhaN) => Chave; direita?: boolean }

const FASE: Record<string, number> = Object.fromEntries(COLUNAS_V2.map((c, i) => [c.id, i]));
const NOME_FASE: Record<string, string> = Object.fromEntries(COLUNAS_V2.map((c) => [c.id, c.nome]));
const DEFS: readonly Def[] = [
  { id: "pessoa", nome: "Pessoa ou empresa", dir: "asc", chave: (l) => l.negocio.nome },
  { id: "servico", nome: "Serviço", dir: "asc", chave: (l) => l.cartao!.servico },
  { id: "fase", nome: "Fase", dir: "asc", chave: (l) => FASE[l.doc!] },
  { id: "valor", nome: "Valor", dir: "desc", chave: (l) => l.valor, direita: true },
  { id: "parado", nome: "Parado há", dir: "desc", chave: (l) => l.parado },
  { id: "proximo", nome: "Próximo passo", dir: "asc", chave: (l) => l.cartao!.proximo },
  { id: "comercial", nome: "Comercial", dir: "asc", chave: (l) => l.comercial },
];

interface Ordem { coluna: Coluna; dir: Direcao }
const eur0 = (x: number): string => eur(x).replace(/,00$/, "");
const dias = (n: number): string => (n <= 0 ? "hoje" : n === 1 ? "1 dia" : `${n} dias`);

/** Ordena as linhas pela coluna (sem ordem, ficam como o Quadro as dá). */
export function ordenarLista(ls: readonly LinhaN[], o: Ordem | null): LinhaN[] {
  if (!o) return [...ls];
  return ordenarPor(ls, DEFS.find((d) => d.id === o.coluna)!.chave, o.dir);
}

interface ListaProps { linhas: readonly LinhaN[]; aoAbrir: (c: CartaoV2, el: HTMLElement) => void }

export function NegociosLista({ linhas, aoAbrir }: ListaProps) {
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const alternar = (d: Def): void => setOrdem(ordem?.coluna === d.id ? { coluna: d.id, dir: ordem.dir === "asc" ? "desc" : "asc" } : { coluna: d.id, dir: d.dir });
  return (
    <div className="tw mt-4">
      <Table className="min-w-[860px] text-[14px]" containerClassName="overflow-visible">
        <TableCaption className="sr-only">Negócios: um por linha. Escolhe um para o abrir.</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {DEFS.map((d) => (
              <TableHead key={d.id} scope="col" aria-sort={ordem?.coluna === d.id ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("h-11 px-3", d.direita && "text-right")}>
                <button type="button" onClick={() => alternar(d)} className="inline-flex min-h-11 cursor-pointer items-center gap-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {d.nome}<span aria-hidden="true">{ordem?.coluna === d.id ? (ordem.dir === "asc" ? "▲" : "▼") : ""}</span>
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenarLista(linhas, ordem).map((l) => {
            const c = l.cartao!;
            return (
              <TableRow key={l.id} className="cursor-pointer" onClick={(e) => aoAbrir(c, e.currentTarget)}>
                <TableCell className="px-3 py-2">
                  <button type="button" onClick={(e) => { e.stopPropagation(); aoAbrir(c, e.currentTarget); }}
                    className="min-h-11 cursor-pointer text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{c.nome}</button>
                  {c.demo && <span className="ml-2 text-xs text-muted-foreground">exemplo</span>}
                </TableCell>
                <TableCell className="px-3 py-2">{c.servico}{c.local ? ` · ${c.local}` : ""}</TableCell>
                <TableCell className="px-3 py-2">{NOME_FASE[c.doc]}</TableCell>
                <TableCell className="px-3 py-2 text-right tabular-nums">{c.valor === null ? "—" : `${eur0(c.valor)} €`}</TableCell>
                <TableCell className="px-3 py-2">{l.parado === null ? "—" : dias(l.parado)}</TableCell>
                <TableCell className="px-3 py-2">{c.proximo}</TableCell>
                <TableCell className="px-3 py-2">{l.comercial}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
