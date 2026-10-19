import { forwardRef, memo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { BarraProgresso } from "./BarraProgresso";
import { LinhaListaReal } from "./LinhaListaReal";

/** As 6 colunas, com a largura em percentagem (somam 100). */
const COLUNAS = [
  { id: "person", largura: 26 }, { id: "stage", largura: 16 }, { id: "lastContact", largura: 15 },
  { id: "nextVisit", largura: 15 }, { id: "value", largura: 10 }, { id: "deals", largura: 18 },
] as const;

interface TabelaListaRealProps {
  linhas: readonly PessoaDaLista[];
  /** As linhas são as de um filtro anterior: a tabela fica marcada como ocupada (barra fina, sem perder contraste). */
  ocupada: boolean;
}

/**
 * A tabela da Lista real: uma região com foco (rola na horizontal e na vertical). A legenda (só para leitores
 * de ecrã) dá o nome à tabela; a região leva um rótulo curto, diferente. Em memória: só se redesenha se as linhas mudam.
 */
export const TabelaListaReal = memo(forwardRef<HTMLDivElement, TabelaListaRealProps>(function TabelaListaReal(
  { linhas, ocupada },
  ref,
) {
  const { t } = useTranslation();
  return (
    <div>
      {ocupada && <BarraProgresso />}
      <div
        ref={ref} role="region" aria-label={t("pessoasPagina.real.regionLabel")} aria-busy={ocupada} tabIndex={0}
        className={cn("max-h-[max(70vh,24rem)] overflow-auto rounded-xl border border-border/70 bg-card", FOCO)}
      >
        <Table className="min-w-[960px] table-fixed text-sm" containerClassName="overflow-visible">
          <colgroup>
            {COLUNAS.map((c) => <col key={c.id} style={{ width: `${c.largura}%` }} />)}
          </colgroup>
          <TableCaption className="sr-only">{t("pessoasPagina.real.caption")}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {COLUNAS.map((c) => (
                <TableHead
                  key={c.id} scope="col"
                  className={cn(
                    "sticky top-0 z-10 h-9 bg-card px-3 text-xs font-semibold text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]",
                    c.id === "value" && "text-right",
                  )}
                >
                  {t(`pessoasPagina.real.columns.${c.id}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((pessoa) => <LinhaListaReal key={pessoa.id} pessoa={pessoa} />)}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}));
