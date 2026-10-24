// Painel "Guias" do ecrã de Receção (guiasPanel / GuiasInv do protótipo):
// lista das guias do fornecedor da organização ativa com filtros por estado,
// anunciado / recebido e divergências.
//
// API: <DeliveryNotesPanel orgId filter onFilterChange onOpen currentNoteId? />
//   filter: valor de ?notes= (parseReceivingParams) — o ecrã guarda-o no URL.
//   onOpen(id): abre a ficha da guia (DeliveryNoteDetail do ecrã).
//
// Dados (só leitura, RLS: purchase_orders.view OU purchase_orders.receive),
// todos filtrados por organization_id = empresa ativa e pedidos em lote (não
// uma chamada por guia):
//   supplier_delivery_notes (+ suppliers.name)
//   supplier_delivery_note_orders (+ purchase_orders.order_number)
//   supplier_delivery_note_lines             → anunciado
//   purchase_order_receipts (kind='receipt', não revertidas) → recebido
// Anunciado / recebido / divergências seguem a regra de fn_delivery_note_summary
// (em unidades de stock: quantity × units_per_uom; produto da receção =
// product_id ou o da linha da PO): divergente = guia com linhas e produto em
// que não se verifica anunciado > 0 e recebido = anunciado. "Com divergências"
// = abertas com divergências (como rpc_inventory_today).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DocumentLink,
  FilterPills,
  InventoryEmptyState,
  InventoryStatusBadge,
  purchaseOrdersLink,
  usePermissionGate,
  type FilterPillOption,
  type InventoryTone,
  type ReceivingNotesFilter,
} from "@/components/inventory/ui";
import { cn } from "@/lib/utils";
import { fmtDay, fmtQty, noteLabel, type DeliveryNoteStatus } from "./deliveryNotes";

/** Máximo de guias carregadas (as mais recentes). */
const NOTES_LIMIT = 500;
/** Ids por pedido .in() (mantém o URL do PostgREST curto). */
const CHUNK = 100;

export const deliveryNotesPanelQueryKey = (orgId: string | null | undefined) =>
  ["receiving-delivery-notes-panel", orgId ?? null] as const;

const STATUS_LABEL: Record<DeliveryNoteStatus, string> = { open: "Aberta", closed: "Fechada", cancelled: "Cancelada" };
const STATUS_TONE: Record<DeliveryNoteStatus, InventoryTone> = { open: "info", closed: "ok", cancelled: "neutral" };

interface PanelOrder {
  id: string;
  number: string | null;
  deleted: boolean;
}

export interface DeliveryNoteListItem {
  id: string;
  noteNumber: string;
  supplierName: string | null;
  documentDate: string | null;
  createdAt: string;
  status: DeliveryNoteStatus;
  orders: PanelOrder[];
  hasLines: boolean;
  announced: number;
  received: number;
  divergences: number;
  activeReceipts: number;
}

interface NoteRow {
  id: string;
  note_number: string;
  document_date: string | null;
  created_at: string;
  status: string;
  supplier: { name: string | null } | null;
}
interface OrderRow {
  delivery_note_id: string;
  purchase_order_id: string;
  po: { order_number: string | null; deleted_at: string | null } | null;
}
interface LineRow {
  delivery_note_id: string;
  product_id: string;
  quantity: number;
  units_per_uom: number;
}
interface ReceiptRow {
  delivery_note_id: string | null;
  product_id: string | null;
  quantity: number;
  units_per_uom: number;
  poi: { product_id: string | null } | null;
}

const chunks = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * Lê todas as páginas (.range) até esgotar — o PostgREST corta em 1000 linhas
 * sem avisar, e 100 guias podem ter mais linhas/receções do que isso.
 */
const PAGE = 1000;
async function fetchPaged<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

/** Soma sem ruído de vírgula flutuante (quantity é numeric). */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

async function fetchPanel(orgId: string): Promise<{ items: DeliveryNoteListItem[]; truncated: boolean }> {
  const { data: notesData, error: notesErr } = await supabase
    .from("supplier_delivery_notes")
    .select(
      "id, note_number, document_date, created_at, status, supplier:suppliers!supplier_delivery_notes_supplier_id_fkey(name)",
    )
    .eq("organization_id", orgId)
    .order("document_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(NOTES_LIMIT);
  if (notesErr) throw notesErr;
  const notes = (notesData ?? []) as unknown as NoteRow[];
  if (notes.length === 0) return { items: [], truncated: false };

  const groups = chunks(
    notes.map((n) => n.id),
    CHUNK,
  );
  const [orders, lines, receipts] = await Promise.all([
    Promise.all(
      groups.map(async (ids) => {
        const { data, error } = await supabase
          .from("supplier_delivery_note_orders")
          .select(
            "delivery_note_id, purchase_order_id, po:purchase_orders!supplier_delivery_note_orders_purchase_order_id_fkey(order_number, deleted_at)",
          )
          .eq("organization_id", orgId)
          .in("delivery_note_id", ids);
        if (error) throw error;
        return (data ?? []) as unknown as OrderRow[];
      }),
    ),
    Promise.all(
      groups.map((ids) =>
        fetchPaged<LineRow>((from, to) =>
          supabase
            .from("supplier_delivery_note_lines")
            .select("delivery_note_id, product_id, quantity, units_per_uom")
            .eq("organization_id", orgId)
            .in("delivery_note_id", ids)
            .order("id")
            .range(from, to),
        ),
      ),
    ),
    Promise.all(
      groups.map((ids) =>
        fetchPaged<ReceiptRow>((from, to) =>
          supabase
            .from("purchase_order_receipts")
            .select(
              "delivery_note_id, product_id, quantity, units_per_uom, poi:purchase_order_items!purchase_order_receipts_purchase_order_item_id_fkey(product_id)",
            )
            .eq("organization_id", orgId)
            .in("delivery_note_id", ids)
            .eq("kind", "receipt")
            .is("reverted_at", null)
            .order("id")
            .range(from, to),
        ),
      ),
    ),
  ]);

  const ordersBy = new Map<string, PanelOrder[]>();
  for (const o of orders.flat()) {
    const list = ordersBy.get(o.delivery_note_id) ?? [];
    list.push({ id: o.purchase_order_id, number: o.po?.order_number ?? null, deleted: !!o.po?.deleted_at });
    ordersBy.set(o.delivery_note_id, list);
  }

  const annBy = new Map<string, Map<string, number>>();
  for (const l of lines.flat()) {
    const m = annBy.get(l.delivery_note_id) ?? new Map<string, number>();
    m.set(l.product_id, (m.get(l.product_id) ?? 0) + Number(l.quantity) * Number(l.units_per_uom));
    annBy.set(l.delivery_note_id, m);
  }
  const recBy = new Map<string, Map<string, number>>();
  const recCount = new Map<string, number>();
  for (const r of receipts.flat()) {
    if (!r.delivery_note_id) continue;
    recCount.set(r.delivery_note_id, (recCount.get(r.delivery_note_id) ?? 0) + 1);
    const product = r.product_id ?? r.poi?.product_id ?? "";
    const m = recBy.get(r.delivery_note_id) ?? new Map<string, number>();
    m.set(product, (m.get(product) ?? 0) + Number(r.quantity) * Number(r.units_per_uom));
    recBy.set(r.delivery_note_id, m);
  }

  const items = notes.map((n): DeliveryNoteListItem => {
    const ann = annBy.get(n.id) ?? new Map<string, number>();
    const rec = recBy.get(n.id) ?? new Map<string, number>();
    const hasLines = ann.size > 0;
    let announced = 0;
    let received = 0;
    let divergences = 0;
    for (const p of new Set([...ann.keys(), ...rec.keys()])) {
      const a = round(ann.get(p) ?? 0);
      const r = round(rec.get(p) ?? 0);
      announced += a;
      received += r;
      if (hasLines && !(a > 0 && r === a)) divergences += 1;
    }
    const status = (["open", "closed", "cancelled"].includes(n.status) ? n.status : "open") as DeliveryNoteStatus;
    return {
      id: n.id,
      noteNumber: n.note_number,
      supplierName: n.supplier?.name ?? null,
      documentDate: n.document_date,
      createdAt: n.created_at,
      status,
      orders: (ordersBy.get(n.id) ?? []).sort((a, b) => (a.number ?? "").localeCompare(b.number ?? "", "pt")),
      hasLines,
      announced: round(announced),
      received: round(received),
      divergences,
      activeReceipts: recCount.get(n.id) ?? 0,
    };
  });
  return { items, truncated: notes.length >= NOTES_LIMIT };
}

function matches(n: DeliveryNoteListItem, f: ReceivingNotesFilter): boolean {
  if (f === "all") return true;
  if (f === "divergent") return n.status === "open" && n.divergences > 0;
  return n.status === f;
}

const FILTERS: readonly (readonly [ReceivingNotesFilter, string])[] = [
  ["all", "Todas"],
  ["open", "Abertas"],
  ["divergent", "Com divergências"],
  ["closed", "Fechadas"],
  ["cancelled", "Canceladas"],
];

interface DeliveryNotesPanelProps {
  orgId: string | null;
  filter: ReceivingNotesFilter;
  onFilterChange: (f: ReceivingNotesFilter) => void;
  onOpen: (id: string) => void;
  /** Guia escolhida no leitor (marcada "Em uso"). */
  currentNoteId?: string | null;
  className?: string;
}

export function DeliveryNotesPanel({ orgId, filter, onFilterChange, onOpen, currentNoteId, className }: DeliveryNotesPanelProps) {
  const gate = usePermissionGate();
  const canPo = gate("purchase_orders.view").allowed;

  const query = useQuery({
    queryKey: deliveryNotesPanelQueryKey(orgId),
    queryFn: () => fetchPanel(orgId as string),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const list = useMemo(() => items.filter((n) => matches(n, filter)), [items, filter]);
  const options: FilterPillOption<ReceivingNotesFilter>[] = FILTERS.map(([value, label]) => ({
    value,
    label,
    count: query.data ? items.filter((n) => matches(n, value)).length : null,
  }));

  return (
    <section aria-labelledby="receiving-notes-title" className={cn("min-w-0", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="receiving-notes-title" className="text-base font-semibold">
          Guias
        </h2>
      </div>
      <FilterPills ariaLabel="Estado da guia" options={options} value={filter} onChange={onFilterChange} className="mb-2.5" />

      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="A carregar guias">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
          <span className="min-w-0 flex-1">Não foi possível carregar as guias.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : list.length === 0 ? (
        <InventoryEmptyState
          icon={FileText}
          title="Sem guias"
          description={items.length > 0 ? "Nenhuma guia neste filtro." : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[640px]">
            <caption className="sr-only">Guias do fornecedor</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>POs</TableHead>
                <TableHead className="text-right">Anunciado / Recebido</TableHead>
                <TableHead>Divergências</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((n) => (
                <TableRow key={n.id} className="cursor-pointer" onClick={() => onOpen(n.id)}>
                  <TableCell className="font-semibold">
                    <DocumentLink onClick={() => onOpen(n.id)} title={`Abrir a guia ${noteLabel(n.noteNumber)}`} className="font-semibold">
                      {noteLabel(n.noteNumber)}
                    </DocumentLink>
                    {currentNoteId === n.id ? (
                      <InventoryStatusBadge tone="violet" className="ml-1.5 align-middle">
                        Em uso
                      </InventoryStatusBadge>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={n.supplierName ?? undefined}>
                    {n.supplierName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDay(n.documentDate ?? n.createdAt) || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {n.orders.length === 0 ? (
                      <span className="text-muted-foreground" title="Sem POs indicadas: abrange as POs do fornecedor">
                        —
                      </span>
                    ) : (
                      n.orders.map((o, i) => (
                        <span key={o.id} className="block">
                          <DocumentLink
                            to={canPo && !o.deleted ? purchaseOrdersLink({ open: o.id }) : undefined}
                            title={o.deleted ? "Encomenda eliminada" : undefined}
                            className={o.deleted ? "line-through text-muted-foreground" : undefined}
                          >
                            {o.number ?? `PO ${i + 1}`}
                          </DocumentLink>
                        </span>
                      ))
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {fmtQty(n.announced)} / {fmtQty(n.received)}
                  </TableCell>
                  <TableCell>
                    {n.divergences > 0 ? (
                      <InventoryStatusBadge tone="bad">{n.divergences}</InventoryStatusBadge>
                    ) : n.hasLines ? (
                      <InventoryStatusBadge tone="ok">0</InventoryStatusBadge>
                    ) : (
                      <span className="text-muted-foreground" title="Guia sem linhas anunciadas">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <InventoryStatusBadge tone={STATUS_TONE[n.status]}>{STATUS_LABEL[n.status]}</InventoryStatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {query.data?.truncated ? (
        <p className="mt-2 text-xs text-muted-foreground">A mostrar as {NOTES_LIMIT} guias mais recentes.</p>
      ) : null}
    </section>
  );
}
