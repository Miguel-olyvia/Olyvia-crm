import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatarMeta } from "./formatoMetas";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import {
  ordenarNegocios, proximaOrdem, proximoPasso, temValor, type ColunaLista, type Ordem,
} from "./logicaQuadro";

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

/** Lista: uma linha por negócio, com cabeçalhos que ordenam (aria-sort). */
export function ListaNegocios({ negocios, aoAbrir }: ListaNegociosProps) {
  const { t } = useTranslation();
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const sort = (c: ColunaLista) =>
    ordem?.coluna === c ? (ordem.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <Table className="min-w-[820px] text-sm">
        <TableCaption className="sr-only">{t("businessGoals.list.caption")}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUNAS.map((c) => (
              <TableHead key={c.id} scope="col" aria-sort={sort(c.id)} className={cn("px-3", c.direita && "text-right")}>
                <button
                  type="button"
                  onClick={() => setOrdem(proximaOrdem(ordem, c.id))}
                  className="inline-flex min-h-11 items-center gap-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t(c.chave)}
                  <span aria-hidden="true">{ordem?.coluna === c.id ? (ordem.dir === "asc" ? "▲" : "▼") : ""}</span>
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenarNegocios(negocios, ordem).map((n) => (
            <TableRow key={n.id} className="cursor-pointer" onClick={() => aoAbrir(n)}>
              <TableCell className="px-3 py-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); aoAbrir(n); }}
                  className="min-h-11 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {n.pessoa}
                </button>
              </TableCell>
              <TableCell className="px-3 py-2">{n.servico}</TableCell>
              <TableCell className="px-3 py-2">{t(`businessGoals.phase.${faseDoNegocio(n)}`)}</TableCell>
              <TableCell className="px-3 py-2 text-right font-mono tabular-nums">
                {temValor(n) ? formatarMeta("euro", valorDoNegocio(n)) : "—"}
              </TableCell>
              <TableCell className="px-3 py-2 tabular-nums">
                {n.parado === null ? "—" : t("businessGoals.deals.days", { count: n.parado })}
              </TableCell>
              <TableCell className="px-3 py-2">{t(`businessGoals.step.${proximoPasso(n)}`)}</TableCell>
              <TableCell className="px-3 py-2">{n.comercial}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
