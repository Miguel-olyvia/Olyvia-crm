// Dados reais da Receção (vista lista), com react-query. Só leituras diretas sob a RLS existente — nada novo na BD.
//
// useReceivablePos(orgId, enabled):
//   purchase_orders (status pending|ordered|partially_received, deleted_at null) + suppliers(name)
//   + purchase_order_items (item_type='product': quantity, received_quantity, uom_id, units_per_uom, products, uom)
//   + supplier_po_publications (fetchPoPublications; falha → sem portal)
//   + scheduled_emails (entity_type='purchase_orders', status='sent'; falha → "Sem envio registado")
//   + origem (fetchPoOrigins; falha → sem origem)
//   + guias do portal abertas (fetchPortalShipments: supplier_delivery_notes status='open' com history 'shipped' /
//     supplier_portal, ligadas à PO por supplier_delivery_note_orders ou pelo purchase_order_id do history; falha →
//     sem distintivo "Expedida").
//   A RLS de purchase_orders exige purchase_orders.view — sem ela a leitura viria vazia, por isso quem chama passa
//   enabled=false e mostra "Sem permissão para ver encomendas" (nunca "nada por receber").
// useReceivingReceipts(orgId, enabled): purchase_order_receipts kind='receipt' (as mais recentes), com a PO, o produto,
//   o armazém, a guia e quem recebeu (anew_users).
// useOpenNotesCount(orgId, enabled): nº de guias abertas (supplier_delivery_notes status='open').
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPoPublications, type PoPublicationRow } from "@/components/purchase-orders/poSupplierPortalApi";
import { fetchPoOrigins, type PoOriginInfo } from "@/components/purchase-orders/usePoOrigins";
import { isPortalNote, portalMeta } from "./deliveryNotes";
import type { ReceivableLine, ReceivablePo, ReceivableShipment } from "./porReceber";

const PAGE = 1000;
const CHUNK = 100;
export const RECEIVABLE_STATUSES = ["pending", "ordered", "partially_received"] as const;

export const receivablePosQueryKey = (orgId: string | null | undefined) => ["receiving-receivable-pos", orgId ?? null] as const;
export const receivingReceiptsQueryKey = (orgId: string | null | undefined) => ["receiving-receipts", orgId ?? null] as const;
export const openNotesCountQueryKey = (orgId: string | null | undefined) => ["receiving-open-notes-count", orgId ?? null] as const;

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** PostgREST devolve no máximo 1000 linhas sem range: pagina (mesmo padrão de fetchAllRows nas páginas do inventário). */
export async function fetchAllRows<T>(page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

interface PoRow {
  id: string;
  order_number: string;
  status: string;
  supplier_id: string | null;
  expected_delivery: string | null;
  order_date: string | null;
  source_type: string | null;
  source_id: string | null;
  suppliers: { name: string | null } | null;
  purchase_order_items:
    | {
        id: string;
        item_type: string;
        product_id: string | null;
        description: string | null;
        sku: string | null;
        quantity: number | null;
        received_quantity: number | null;
        uom_id: string | null;
        units_per_uom: number | null;
        products: { name: string | null; sku: string | null } | null;
        uom: { code: string | null } | null;
      }[]
    | null;
}

export function mapPoRow(
  r: PoRow,
  extra: {
    publication?: ReceivablePo["publication"];
    emailSent?: boolean;
    origin?: PoOriginInfo | null;
    shipped?: ReceivableShipment | null;
  } = {},
): ReceivablePo {
  const lines: ReceivableLine[] = (r.purchase_order_items ?? [])
    .filter((i) => i.item_type === "product" && !!i.product_id)
    .map((i) => {
      const quantity = Number(i.quantity) || 0;
      const received = Number(i.received_quantity) || 0;
      return {
        id: i.id,
        productId: i.product_id as string,
        name: i.products?.name || i.description || "Produto",
        sku: i.products?.sku ?? i.sku ?? null,
        quantity,
        received,
        open: Math.max(0, quantity - received),
        uomId: i.uom_id,
        uomCode: i.uom?.code ?? null,
        unitsPerUom: Number(i.units_per_uom) || 1,
      };
    });
  const contractId = r.source_type === "contract" && r.source_id ? r.source_id : null;
  return {
    id: r.id,
    orderNumber: r.order_number,
    status: r.status,
    supplierId: r.supplier_id,
    supplierName: r.suppliers?.name || "Sem fornecedor",
    expectedDelivery: r.expected_delivery,
    orderDate: r.order_date,
    contractId,
    origin: contractId ? (extra.origin ?? null) : null,
    publication: extra.publication ?? null,
    emailSent: !!extra.emailSent,
    lines,
    shipped: extra.shipped ?? null,
  };
}

interface PortalNoteRow {
  id: string;
  note_number: string;
  created_at: string | null;
  status: string;
  history: unknown;
}

/**
 * As guias expedidas no portal ainda abertas, por PO (a mais antiga primeiro). Junta as POs da guia
 * (supplier_delivery_note_orders) e a do history (purchase_order_id da expedição).
 */
export function shipmentsByPo(
  notes: readonly PortalNoteRow[],
  orders: readonly { delivery_note_id: string; purchase_order_id: string }[],
): Map<string, ReceivableShipment> {
  const posOf = new Map<string, Set<string>>();
  for (const o of orders) posOf.set(o.delivery_note_id, (posOf.get(o.delivery_note_id) ?? new Set()).add(o.purchase_order_id));
  const byPo = new Map<string, { list: { noteId: string; noteNumber: string; shippedAt: string | null; hasFile: boolean }[] }>();
  for (const n of notes) {
    if (n.status !== "open" || !isPortalNote(n.history)) continue;
    const m = portalMeta(n.history);
    const pos = new Set(posOf.get(n.id) ?? []);
    if (m?.purchaseOrderId) pos.add(m.purchaseOrderId);
    for (const po of pos) {
      const e = byPo.get(po) ?? { list: [] };
      e.list.push({ noteId: n.id, noteNumber: n.note_number, shippedAt: m?.shippedAt ?? n.created_at ?? null, hasFile: !!m?.file });
      byPo.set(po, e);
    }
  }
  const out = new Map<string, ReceivableShipment>();
  for (const [po, { list }] of byPo) {
    list.sort((a, b) => (a.shippedAt ?? "").localeCompare(b.shippedAt ?? "") || a.noteNumber.localeCompare(b.noteNumber));
    out.set(po, { ...list[0], count: list.length });
  }
  return out;
}

export async function fetchPortalShipments(orgId: string): Promise<Map<string, ReceivableShipment>> {
  const notes = await fetchAllRows<PortalNoteRow>((from, to) =>
    supabase
      .from("supplier_delivery_notes")
      .select("id, note_number, created_at, status, history")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const portal = notes.filter((n) => n.status === "open" && isPortalNote(n.history));
  if (!portal.length) return new Map();
  const orders: { delivery_note_id: string; purchase_order_id: string }[] = [];
  for (const part of chunks(portal.map((n) => n.id))) {
    const { data, error } = await supabase
      .from("supplier_delivery_note_orders")
      .select("delivery_note_id, purchase_order_id")
      .eq("organization_id", orgId)
      .in("delivery_note_id", part);
    if (error) throw error;
    const ids = new Set(part);
    for (const o of (data ?? []) as { delivery_note_id: string; purchase_order_id: string }[]) if (ids.has(o.delivery_note_id)) orders.push(o);
  }
  return shipmentsByPo(portal, orders);
}

export async function fetchReceivablePos(orgId: string): Promise<ReceivablePo[]> {
  const rows = await fetchAllRows<PoRow>((from, to) =>
    supabase
      .from("purchase_orders")
      .select(
        "id, order_number, status, supplier_id, expected_delivery, order_date, source_type, source_id, suppliers(name), purchase_order_items(id, item_type, product_id, description, sku, quantity, received_quantity, uom_id, units_per_uom, products(name, sku), uom:uom_id(code))",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("status", [...RECEIVABLE_STATUSES])
      .order("order_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const ids = rows.map((r) => r.id);
  const contractIds = rows.filter((r) => r.source_type === "contract" && r.source_id).map((r) => r.source_id as string);

  const [pubs, emails, origins, shipments] = await Promise.all([
    fetchPoPublications(orgId).catch((): PoPublicationRow[] => []),
    (async () => {
      const sent = new Set<string>();
      for (const part of chunks(ids)) {
        const { data, error } = await supabase
          .from("scheduled_emails")
          .select("entity_id, status")
          .eq("entity_type", "purchase_orders")
          .eq("status", "sent")
          .in("entity_id", part);
        if (error) break;
        for (const e of (data ?? []) as { entity_id: string }[]) sent.add(e.entity_id);
      }
      return sent;
    })(),
    fetchPoOrigins(contractIds).catch(() => ({}) as Record<string, PoOriginInfo>),
    fetchPortalShipments(orgId).catch(() => new Map<string, ReceivableShipment>()),
  ]);
  const pubByPo = new Map<string, PoPublicationRow>(pubs.map((p) => [p.purchase_order_id, p] as const));
  return rows.map((r) => {
    const pub = pubByPo.get(r.id);
    return mapPoRow(r, {
      publication: pub
        ? { status: pub.status, viewedAt: pub.viewed_at, confirmedAt: pub.confirmed_at, promisedDate: pub.promised_date }
        : null,
      emailSent: emails.has(r.id),
      origin: r.source_id ? (origins[r.source_id] ?? null) : null,
      shipped: shipments.get(r.id) ?? null,
    });
  });
}

export function useReceivablePos(orgId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: receivablePosQueryKey(orgId),
    queryFn: () => fetchReceivablePos(orgId as string),
    enabled: !!orgId && enabled,
    staleTime: 30_000,
  });
}

// ── Recebidas ────────────────────────────────────────────────────────────────

export interface ReceiptItem {
  id: string;
  receivedAt: string;
  poId: string;
  orderNumber: string;
  supplierName: string;
  contractId: string | null;
  origin: PoOriginInfo | null;
  productName: string;
  sku: string | null;
  /** Unidades de stock que entraram (quantity × units_per_uom) e as reservadas para a EC. */
  units: number;
  unitsToOrder: number;
  warehouseName: string | null;
  receivedByName: string | null;
  noteNumber: string | null;
  reverted: boolean;
}

interface ReceiptRow {
  id: string;
  received_at: string;
  purchase_order_id: string;
  contract_id: string | null;
  quantity: number | null;
  units_per_uom: number | null;
  units_to_order: number | null;
  units_to_stock: number | null;
  received_by: string | null;
  reverted_at: string | null;
  purchase_orders: { order_number: string | null; suppliers: { name: string | null } | null } | null;
  purchase_order_items: { description: string | null; sku: string | null; products: { name: string | null; sku: string | null } | null } | null;
  warehouses: { name: string | null } | null;
  supplier_delivery_notes: { note_number: string | null } | null;
}

export const RECEIPTS_LIMIT = 300;

/** As receções com a pesquisa por PO, fornecedor, cliente/origem ou produto. */
export function filtrarRecebidas(L: readonly ReceiptItem[], q: string): ReceiptItem[] {
  const t = q.trim().toLowerCase();
  if (!t) return [...L];
  return L.filter((x) =>
    [x.orderNumber, x.supplierName, x.origin?.clientName ?? "", x.origin?.number ?? "", x.productName, x.sku ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(t),
  );
}

export async function fetchReceivingReceipts(orgId: string): Promise<ReceiptItem[]> {
  const { data, error } = await supabase
    .from("purchase_order_receipts")
    .select(
      "id, received_at, purchase_order_id, contract_id, quantity, units_per_uom, units_to_order, units_to_stock, received_by, reverted_at, purchase_orders(order_number, suppliers(name)), purchase_order_items(description, sku, products(name, sku)), warehouses(name), supplier_delivery_notes(note_number)",
    )
    .eq("organization_id", orgId)
    .eq("kind", "receipt")
    .order("received_at", { ascending: false })
    .limit(RECEIPTS_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as unknown as ReceiptRow[];
  const userIds = Array.from(new Set(rows.map((r) => r.received_by).filter((x): x is string => !!x)));
  const contractIds = rows.map((r) => r.contract_id).filter((x): x is string => !!x);
  const [names, origins] = await Promise.all([
    (async () => {
      const m = new Map<string, string>();
      for (const part of chunks(userIds)) {
        const { data: users, error: uErr } = await supabase.from("anew_users").select("id, name").in("id", part);
        if (uErr) break;
        for (const u of (users ?? []) as { id: string; name: string | null }[]) if (u.name) m.set(u.id, u.name);
      }
      return m;
    })(),
    fetchPoOrigins(contractIds).catch(() => ({}) as Record<string, PoOriginInfo>),
  ]);
  return rows.map((r) => {
    const factor = Number(r.units_per_uom) || 1;
    const split = (Number(r.units_to_order) || 0) + (Number(r.units_to_stock) || 0);
    return {
      id: r.id,
      receivedAt: r.received_at,
      poId: r.purchase_order_id,
      orderNumber: r.purchase_orders?.order_number || "PO",
      supplierName: r.purchase_orders?.suppliers?.name || "—",
      contractId: r.contract_id,
      origin: r.contract_id ? (origins[r.contract_id] ?? null) : null,
      productName: r.purchase_order_items?.products?.name || r.purchase_order_items?.description || "Produto",
      sku: r.purchase_order_items?.products?.sku ?? r.purchase_order_items?.sku ?? null,
      units: split > 0 ? split : (Number(r.quantity) || 0) * factor,
      unitsToOrder: Number(r.units_to_order) || 0,
      warehouseName: r.warehouses?.name ?? null,
      receivedByName: r.received_by ? (names.get(r.received_by) ?? null) : null,
      noteNumber: r.supplier_delivery_notes?.note_number ?? null,
      reverted: !!r.reverted_at,
    };
  });
}

export function useReceivingReceipts(orgId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: receivingReceiptsQueryKey(orgId),
    queryFn: () => fetchReceivingReceipts(orgId as string),
    enabled: !!orgId && enabled,
    staleTime: 30_000,
  });
}

export function useOpenNotesCount(orgId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: openNotesCountQueryKey(orgId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("supplier_delivery_notes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId as string)
        .eq("status", "open");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!orgId && enabled,
    staleTime: 30_000,
  });
}
