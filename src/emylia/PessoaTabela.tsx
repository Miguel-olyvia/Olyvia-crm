// As pessoas da lista: no computador (lg e acima) uma tabela densa com semântica real; abaixo disso cartões de três linhas.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Estado } from "./motor";
import type { PessoaApp } from "./pessoasDocs";
import { CartaoPessoa, LinhaTabela } from "./PessoaLinha";
import { useDesktop } from "./useDesktop";

/** Largura de cada coluna (soma 100): o valor cabe sem quebrar "16.225,82 €" e o resto quebra em duas linhas. A pessoa tem a maior (nome e selos). */
const COLUNAS: { nome: string; larg: string; direita?: boolean }[] = [
  { nome: "Pessoa", larg: "w-[26%]" }, { nome: "Serviço · localidade", larg: "w-[13%]" }, { nome: "Etapa", larg: "w-[11%]" }, { nome: "Formulário", larg: "w-[10%]" },
  { nome: "Último contacto", larg: "w-[16%]" }, { nome: "Próximo passo", larg: "w-[13%]" }, { nome: "Valor", larg: "w-[11%]", direita: true },
];

// 27/10: mostra 40 pessoas; o resto atrás de «Mostrar mais»
const POR_PAGINA = 40;

interface TabelaProps { S: Estado; pessoas: PessoaApp[]; titulo: string; abrir: (nome: string) => void }

export function PessoaTabela({ S, pessoas, titulo, abrir }: TabelaProps) {
  const desktop = useDesktop();
  const [n, setN] = useState(POR_PAGINA);
  const vistas = pessoas.slice(0, n), faltam = pessoas.length - vistas.length;
  const mais = faltam > 0 && (
    <Button type="button" variant="outline" className="mt-3 min-h-11 cursor-pointer text-[15px]" onClick={() => setN(n + POR_PAGINA)}>Mostrar mais ({faltam})</Button>
  );
  if (!desktop) {
    return (
      <>
        <ul className="divide-y divide-border border-y border-border" aria-label={titulo}>
          {vistas.map((p) => <CartaoPessoa key={p.nome} p={p} S={S} abrir={() => abrir(p.nome)} />)}
        </ul>
        {mais}
      </>
    );
  }
  return (
    <>
    <Table className="table-fixed text-[15px]" containerClassName="overflow-visible">
      <TableCaption className="sr-only">{titulo}: uma pessoa por linha. Escolhe uma para abrir a ficha.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {COLUNAS.map((c) => (
            <TableHead key={c.nome} scope="col" className={`${c.larg} h-9 px-2 text-[15px] font-medium ${c.direita ? "text-right" : ""}`}>{c.nome}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{vistas.map((p) => <LinhaTabela key={p.nome} p={p} S={S} abrir={() => abrir(p.nome)} />)}</TableBody>
    </Table>
    {mais}
    </>
  );
}
