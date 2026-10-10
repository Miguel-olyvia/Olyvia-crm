// As pessoas da lista: no computador (lg e acima) uma tabela densa com semântica real; abaixo disso cartões de três linhas.
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Estado } from "./motor";
import type { PessoaApp } from "./pessoasDocs";
import { CartaoPessoa, LinhaTabela } from "./PessoaLinha";
import { useDesktop } from "./useDesktop";

/** Largura de cada coluna (soma 100): o valor cabe sem quebrar "16.225,82 €" e o resto quebra em duas linhas. */
const COLUNAS: { nome: string; larg: string; direita?: boolean }[] = [
  { nome: "Pessoa", larg: "w-[18%]" }, { nome: "Serviço · localidade", larg: "w-[17%]" }, { nome: "Etapa", larg: "w-[14%]" }, { nome: "Origem", larg: "w-[9%]" },
  { nome: "Último contacto", larg: "w-[14%]" }, { nome: "Próximo passo", larg: "w-[17%]" }, { nome: "Valor", larg: "w-[11%]", direita: true },
];

interface TabelaProps { S: Estado; pessoas: PessoaApp[]; titulo: string; abrir: (nome: string) => void }

export function PessoaTabela({ S, pessoas, titulo, abrir }: TabelaProps) {
  const desktop = useDesktop();
  if (!desktop) {
    return (
      <ul className="divide-y divide-border border-y border-border" aria-label={titulo}>
        {pessoas.map((p) => <CartaoPessoa key={p.nome} p={p} S={S} abrir={() => abrir(p.nome)} />)}
      </ul>
    );
  }
  return (
    <Table className="table-fixed text-[15px]" containerClassName="overflow-visible">
      <TableCaption className="sr-only">{titulo}: uma pessoa por linha. Escolhe uma para abrir a ficha.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {COLUNAS.map((c) => (
            <TableHead key={c.nome} scope="col" className={`${c.larg} h-9 px-2 text-[15px] font-medium ${c.direita ? "text-right" : ""}`}>{c.nome}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{pessoas.map((p) => <LinhaTabela key={p.nome} p={p} S={S} abrir={() => abrir(p.nome)} />)}</TableBody>
    </Table>
  );
}
