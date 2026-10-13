// Tabela da lista de Contagens (Armazém › Contagens) — UI de ContagensInv do
// protótipo sobre dados reais (inventory_counts + agregados de
// inventory_count_lines calculados em StockCounts.tsx). Só apresentação: os
// dados, filtros e o diálogo de detalhe vivem na página.
//
// Regras de apresentação:
//   - "Parada há N dias": em contagem e sem atividade (cabeçalho ou linhas)
//     há mais de 7 dias — mesma regra de rpc_inventory_today (counts.stalled).
//   - Progresso: linhas com quantidade contada / total de linhas.
//   - Discrepâncias: linhas contadas com diferença ≠ 0 face à fotografia do
//     sistema (resolvidas ou não); as por resolver aparecem por baixo.
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Eye, ListChecks } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DocumentLink,
  InventoryEmptyState,
  InventoryStatusBadge,
  RowActions,
  stockMovementsLink,
  type InventoryTone,
} from "@/components/inventory/ui";

export const STALLED_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;

export interface StockCountRow {
  id: string;
  document_number: string;
  status: string;
  started_at: string;
  updated_at: string;
  finalized_at: string | null;
  warehouse_id: string;
  category_id: string | null;
  warehouses?: { name: string } | null;
  product_categories?: { name: string } | null;
  // Agregados de inventory_count_lines (ver loadLineAggregates na página).
  total_lines?: number;
  counted_lines?: number;
  /** Linhas contadas com diferença ≠ 0 (resolvidas ou não). */
  discrepancies?: number;
  /** Diferenças ainda sem resolução — a condição de rpc_finalize_inventory_count. */
  pending_discrepancies?: number;
  /** Nunca contadas mas com stock no sistema na fotografia. */
  uncounted_with_stock?: number;
  /** Última atividade: max(started_at, updated_at, linhas.updated_at/counted_at). */
  last_activity_at?: string;
}

const STATUS_LABEL: Record<string, string> = {
  em_contagem: "Em contagem",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};
const STATUS_TONE: Record<string, InventoryTone> = {
  em_contagem: "info",
  finalizada: "ok",
  cancelada: "neutral",
};

/** Dias sem atividade se a contagem estiver parada; null caso contrário. */
export function stalledDays(row: StockCountRow, now = Date.now()): number | null {
  if (row.status !== "em_contagem") return null;
  const last = Date.parse(row.last_activity_at ?? row.updated_at ?? row.started_at);
  if (Number.isNaN(last)) return null;
  const elapsed = now - last;
  if (elapsed <= STALLED_AFTER_DAYS * DAY_MS) return null;
  return Math.floor(elapsed / DAY_MS);
}

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function CountProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-1.5 w-[110px] overflow-hidden rounded bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done} de ${total} contadas`}
        title={`${done} de ${total}`}
      >
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <small className="text-xs text-muted-foreground tabular-nums">
        {done} / {total} contadas
      </small>
    </div>
  );
}

interface StockCountsTableProps {
  rows: StockCountRow[];
  loading: boolean;
  allCategoriesLabel: string;
  uncountedWithStockLabel: (count: number) => string;
  onOpen: (id: string) => void;
}

export function StockCountsTable({ rows, loading, allCategoriesLabel, uncountedWithStockLabel, onOpen }: StockCountsTableProps) {
  const navigate = useNavigate();
  const now = Date.now();
  const COLS = 8;

  if (!loading && rows.length === 0) {
    return <InventoryEmptyState title="Sem contagens" icon={ListChecks} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Armazém</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Iniciada</TableHead>
            <TableHead>Progresso</TableHead>
            <TableHead className="text-right">Discrepâncias</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={COLS} className="text-center text-muted-foreground">
                A carregar…
              </TableCell>
            </TableRow>
          ) : (
            rows.map((c) => {
              const days = stalledDays(c, now);
              const disc = c.discrepancies ?? 0;
              const pending = c.pending_discrepancies ?? 0;
              const uncounted = c.uncounted_with_stock ?? 0;
              return (
                <TableRow
                  key={c.id}
                  tabIndex={0}
                  aria-label={`Abrir a contagem ${c.document_number}`}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => onOpen(c.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(c.id);
                    }
                  }}
                >
                  <TableCell>
                    <DocumentLink onClick={() => onOpen(c.id)} className="font-semibold">
                      {c.document_number}
                    </DocumentLink>
                  </TableCell>
                  <TableCell>{c.warehouses?.name || "—"}</TableCell>
                  <TableCell>{c.product_categories?.name || allCategoriesLabel}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <InventoryStatusBadge tone={STATUS_TONE[c.status] ?? "neutral"}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </InventoryStatusBadge>
                      {days !== null ? <InventoryStatusBadge tone="warn">Parada há {days} dias</InventoryStatusBadge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(c.started_at)}</TableCell>
                  <TableCell>
                    <CountProgress done={c.counted_lines ?? 0} total={c.total_lines ?? 0} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      {/* Total em tom neutro; só as por resolver a vermelho. */}
                      <span className="whitespace-nowrap tabular-nums">
                        {disc}
                        {pending > 0 && c.status === "em_contagem" ? (
                          <>
                            {" · "}
                            <span className="font-semibold text-red-700 dark:text-red-400">{pending} por resolver</span>
                          </>
                        ) : null}
                      </span>
                      {uncounted > 0 ? (
                        // Não é discrepância (nada foi comparado), mas há stock
                        // no sistema que ninguém foi verificar fisicamente.
                        <InventoryStatusBadge tone="warn">{uncountedWithStockLabel(uncounted)}</InventoryStatusBadge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      primary={{ label: "Abrir", onClick: () => onOpen(c.id) }}
                      items={[
                        { label: "Abrir detalhe", icon: Eye, onSelect: () => onOpen(c.id) },
                        {
                          label: "Ver movimentos de ajuste",
                          icon: ArrowLeftRight,
                          onSelect: () => navigate(stockMovementsLink({ doc: c.document_number })),
                          hidden: c.status !== "finalizada",
                        },
                      ]}
                      menuLabel={`Mais ações para ${c.document_number}`}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
