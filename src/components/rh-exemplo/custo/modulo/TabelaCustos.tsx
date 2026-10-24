/**
 * A tabela do módulo «Custos»: cabeçalhos acessíveis (cada coluna ordenável é um botão dentro do `th`, com `aria-sort`),
 * uma linha por pessoa, linha de totais e estado vazio. A ordenação vive em quem chama.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import type { ColunaCusto, LinhaCusto, Sentido, TotaisCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { euros } from "@/components/rh-exemplo/custo/formato";
import { LinhaTabelaCusto } from "./LinhaTabelaCusto";

export interface Ordem {
  coluna: ColunaCusto;
  sentido: Sentido;
}

const COLUNAS: ReadonlyArray<{ coluna: ColunaCusto | null; chave: string; numerica: boolean }> = [
  { coluna: "nome", chave: "pessoa", numerica: false },
  { coluna: "centro", chave: "centro", numerica: false },
  { coluna: "retribuicao", chave: "retribuicao", numerica: true },
  { coluna: "encargos", chave: "encargos", numerica: true },
  { coluna: "avulsosMes", chave: "avulsos", numerica: true },
  { coluna: "equipamentosMes", chave: "equipamentos", numerica: true },
  { coluna: "seguro", chave: "seguro", numerica: true },
  { coluna: "total", chave: "total", numerica: true },
  { coluna: "porHora", chave: "porHora", numerica: true },
  { coluna: null, chave: "composicao", numerica: false },
];

interface CabecalhoProps {
  ordem: Ordem;
  aoOrdenar: (coluna: ColunaCusto) => void;
}

function Cabecalho({ ordem, aoOrdenar }: CabecalhoProps) {
  const { t } = useTranslation();
  return (
    <TableHeader>
      <TableRow>
        {COLUNAS.map(({ coluna, chave, numerica }) => {
          const rotulo = t(`rhCustos.col.${chave}`);
          const ativa = coluna !== null && ordem.coluna === coluna;
          const Seta = !ativa ? ChevronsUpDown : ordem.sentido === "asc" ? ArrowUp : ArrowDown;
          return (
            <TableHead
              key={chave} scope="col" className={cn("px-3", numerica && "text-right")}
              aria-sort={ativa ? (ordem.sentido === "asc" ? "ascending" : "descending") : coluna === null ? undefined : "none"}
            >
              {coluna === null ? rotulo : (
                <Button
                  type="button" variant="ghost" size="sm" onClick={() => aoOrdenar(coluna)}
                  aria-label={`${t("rhCustos.ordenar", { coluna: rotulo })}${ativa ? `, ${t(`rhCustos.ordem.${ordem.sentido}`)}` : ""}`}
                  className={cn("-mx-2 min-h-11 gap-1 px-2 font-medium", numerica && "flex-row-reverse", FOCO)}
                >
                  {rotulo}
                  <Seta aria-hidden="true" className={cn("h-3.5 w-3.5", ativa ? "text-foreground" : "text-muted-foreground")} />
                </Button>
              )}
            </TableHead>
          );
        })}
      </TableRow>
    </TableHeader>
  );
}

function LinhaTotais({ totais, n }: { totais: TotaisCusto; n: number }) {
  const { t } = useTranslation();
  const eur = (v: number) => euros(v, "—");
  const celula = "px-3 py-2 text-right text-sm font-semibold tabular-nums";
  return (
    <TableFooter>
      <TableRow>
        <TableHead scope="row" colSpan={2} className="h-auto px-3 py-2 text-sm font-semibold text-foreground">{t("rhCustos.totalLinha", { n })}</TableHead>
        <TableCell className={celula}>{eur(totais.retribuicao)}</TableCell>
        <TableCell className={celula}>{eur(totais.encargos)}</TableCell>
        <TableCell className={celula}>{eur(totais.avulsos)}</TableCell>
        <TableCell className={celula}>{eur(totais.equipamentos)}</TableCell>
        <TableCell className={celula}>{eur(totais.seguro)}</TableCell>
        <TableCell className={celula} data-testid="rhcustos-linha-total">{eur(totais.total)}</TableCell>
        <TableCell colSpan={2} />
      </TableRow>
    </TableFooter>
  );
}

interface Props {
  linhas: readonly LinhaCusto[];
  totais: TotaisCusto;
  mesTexto: string;
  ordem: Ordem;
  aoOrdenar: (coluna: ColunaCusto) => void;
  aoAbrir: (id: string) => void;
  filtrado: boolean;
  aoLimpar: () => void;
}

export function TabelaCustos({ linhas, totais, mesTexto, ordem, aoOrdenar, aoAbrir, filtrado, aoLimpar }: Props) {
  const { t } = useTranslation();
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) => setExpandidas((atual) => {
    const novo = new Set(atual);
    if (!novo.delete(id)) novo.add(id);
    return novo;
  });

  if (linhas.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm text-foreground">{t(filtrado ? "rhCustos.vazioFiltro" : "rhCustos.vazio")}</p>
        {filtrado && <Button type="button" className={cn("min-h-11", FOCO)} onClick={aoLimpar}>{t("rhCustos.limpar")}</Button>}
      </div>
    );
  }
  return (
    <div className="rounded-md border">
      <Table density="compact" aria-label={t("rhCustos.tabela", { mes: mesTexto })}>
        <Cabecalho ordem={ordem} aoOrdenar={aoOrdenar} />
        <TableBody>
          {linhas.map((l) => <LinhaTabelaCusto key={l.pessoaId} linha={l} expandida={expandidas.has(l.pessoaId)} aoAbrir={aoAbrir} aoAlternar={alternar} />)}
        </TableBody>
        <LinhaTotais totais={totais} n={linhas.length} />
      </Table>
    </div>
  );
}
