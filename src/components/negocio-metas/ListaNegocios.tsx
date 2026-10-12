import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { COR_FASE, FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import {
  ordenarNegocios, proximaOrdem, proximoPasso, temValor, type ColunaLista, type Ordem,
} from "./logicaQuadro";
import { CARTAO } from "./useAtalhosQuadro";

const COLUNAS: readonly { id: ColunaLista; chave: string; direita?: boolean }[] = [
  { id: "pessoa", chave: "businessGoals.deals.person" },
  { id: "servico", chave: "businessGoals.deals.service" },
  { id: "fase", chave: "businessGoals.deals.phase" },
  { id: "valor", chave: "businessGoals.deals.value", direita: true },
  { id: "parado", chave: "businessGoals.deals.stalled" },
  { id: "proximo", chave: "businessGoals.deals.next" },
  { id: "comercial", chave: "businessGoals.deals.rep" },
];

interface ListaNegociosProps {
  negocios: NegocioMes[];
  aoAbrir: (negocio: NegocioMes) => void;
}

function SetaOrdem({ ordem, coluna }: { ordem: Ordem | null; coluna: ColunaLista }) {
  if (ordem?.coluna !== coluna) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />;
  const Seta = ordem.dir === "asc" ? ArrowUp : ArrowDown;
  return <Seta className="h-3.5 w-3.5" aria-hidden="true" />;
}

/**
 * Lista: uma linha por negócio. Cabeçalhos que ordenam (aria-sort e seta) e
 * ficam fixos ao rolar; a primeira coluna também, para a pessoa não se perder
 * quando a tabela rola na horizontal (telemóvel). Cada linha tem hover e foco
 * visíveis e abre o painel. Até umas dezenas de negócios por mês não precisa de paginação.
 */
export function ListaNegocios({ negocios, aoAbrir }: ListaNegociosProps) {
  const { t } = useTranslation();
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const sort = (c: ColunaLista) =>
    ordem?.coluna === c ? (ordem.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <Table className="min-w-[820px] text-sm" containerClassName="max-h-[70vh] rounded-xl">
        <TableCaption className="sr-only">{t("businessGoals.list.caption")}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUNAS.map((c, i) => (
              <TableHead
                key={c.id}
                scope="col"
                aria-sort={sort(c.id)}
                className={cn(
                  "sticky top-0 z-10 bg-card px-3 shadow-[inset_0_-1px_0_hsl(var(--border))]",
                  i === 0 && "left-0 z-20",
                  c.direita && "text-right",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOrdem(proximaOrdem(ordem, c.id))}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-1 font-semibold",
                    c.direita && "w-full justify-end",
                    FOCO,
                  )}
                >
                  {t(c.chave)}
                  <SetaOrdem ordem={ordem} coluna={c.id} />
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenarNegocios(negocios, ordem).map((n, pos) => {
            const fase = faseDoNegocio(n);
            return (
              <TableRow key={n.id} className="group cursor-pointer hover:bg-muted focus-within:bg-muted" onClick={() => aoAbrir(n)}>
                <TableCell className="sticky left-0 z-[1] bg-card px-3 py-1 group-hover:bg-muted group-focus-within:bg-muted">
                  <button
                    type="button"
                    {...{ [CARTAO]: "", "data-coluna": 0, "data-pos": pos }}
                    onClick={(e) => { e.stopPropagation(); aoAbrir(n); }}
                    className={cn("min-h-11 cursor-pointer rounded-sm text-left font-medium", FOCO)}
                  >
                    {n.pessoa}
                  </button>
                </TableCell>
                <TableCell className="px-3 py-2">{n.servico}</TableCell>
                <TableCell className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", COR_FASE[fase])} />
                    {t(`businessGoals.phase.${fase}`)}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-2 text-right font-mono tabular-nums">
                  {temValor(n) ? formatarMeta("euro", valorDoNegocio(n)) : "—"}
                </TableCell>
                <TableCell className="px-3 py-2 tabular-nums">
                  {n.parado === null ? "—" : t("businessGoals.deals.days", { count: n.parado })}
                </TableCell>
                <TableCell className="px-3 py-2">{t(`businessGoals.step.${proximoPasso(n)}`)}</TableCell>
                <TableCell className="px-3 py-2">{n.comercial}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
