// Encomendas a fornecedor: "Expedida · GR …" / "Parcialmente expedida · GR …" quando o fornecedor expediu a PO no
// portal (sp_ship_order) e a guia ainda está aberta — como o selo "Expedida pelo fornecedor · guia …" do Olyvia 2.0
// (selarPortal), que substitui o "Confirmada · entrega …". "Receber" numa PO assim vai para a Receção com a PO aberta
// (receivingLink({ po })), onde o painel "Dar entrada" escolhe a guia do portal e pré-preenche as quantidades.
//
// Só leituras diretas sob a RLS existente (purchase_orders.view ou .receive) — nada novo na BD. Uma leitura em lote por
// carga da lista (nunca uma por PO):
//   1. supplier_delivery_notes abertas com history @> [{action:'shipped', origin:'supplier_portal'}]
//   2. supplier_delivery_note_orders dessas guias → as POs (mais o purchase_order_id do history)
//   3. supplier_delivery_note_orders dessas POs → as outras guias delas (fechadas contam para o "já expedido")
//   4. linhas das guias, receções feitas com as guias fechadas e linhas de produto das POs
// "Parcialmente expedida" segue a regra do servidor (fn_sp_po_shipped / sp_order_shipments):
//   expedido por linha = Σ guias do portal não canceladas (abertas: o anunciado; fechadas: o recebido com ela, no
//   máximo o anunciado) / units_per_uom da linha; por expedir = max(quantity − max(received_quantity, expedido), 0).
import { supabase } from "@/integrations/supabase/client";
import { isPortalNote, noteLabel } from "@/components/receiving/deliveryNotes";
import type { ReceivableShipment } from "@/components/receiving/porReceber";
import { fetchAllRows, shipmentsByPo } from "@/components/receiving/useReceivablePos";

export interface PortalShipNoteRow {
  id: string;
  note_number: string;
  created_at: string | null;
  status: string;
  history: unknown;
}

export interface ShipLinkRow {
  delivery_note_id: string;
  purchase_order_id: string;
}

export interface ShipNoteLineRow {
  delivery_note_id: string;
  purchase_order_item_id: string | null;
  quantity: number | null;
  units_per_uom: number | null;
}

export interface ShipReceiptRow {
  delivery_note_id: string | null;
  purchase_order_item_id: string | null;
  quantity: number | null;
  units_per_uom: number | null;
}

export interface ShipPoItemRow {
  id: string;
  purchase_order_id: string;
  quantity: number | null;
  received_quantity: number | null;
  units_per_uom: number | null;
}

/** A guia do portal aberta mais antiga da PO (a que a Receção escolhe), quantas há e se falta expedir alguma coisa. */
export interface PoShipment extends ReceivableShipment {
  partial: boolean;
}

export interface PoShipmentInputs {
  notes: readonly PortalShipNoteRow[];
  links: readonly ShipLinkRow[];
  lines: readonly ShipNoteLineRow[];
  receipts: readonly ShipReceiptRow[];
  items: readonly ShipPoItemRow[];
}

const EPS = 1e-9;
const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const upu = (v: unknown) => Math.max(num(v, 1) || 1, 1);

/** Por PO com pelo menos uma guia do portal aberta: a guia, o nº de guias abertas e se é parcial. */
export function computePoShipments(i: PoShipmentInputs): Map<string, PoShipment> {
  const base = shipmentsByPo(i.notes, i.links);
  const out = new Map<string, PoShipment>();
  if (base.size === 0) return out;

  const portal = new Map(i.notes.filter((n) => n.status !== "cancelled" && isPortalNote(n.history)).map((n) => [n.id, n] as const));
  // anunciado / recebido por guia e linha da PO, em unidades de stock
  const key = (note: string, poi: string) => `${note}|${poi}`;
  const ann = new Map<string, number>();
  for (const l of i.lines) {
    if (!l.purchase_order_item_id || !portal.has(l.delivery_note_id)) continue;
    const k = key(l.delivery_note_id, l.purchase_order_item_id);
    ann.set(k, (ann.get(k) ?? 0) + num(l.quantity) * upu(l.units_per_uom));
  }
  const rec = new Map<string, number>();
  for (const r of i.receipts) {
    if (!r.delivery_note_id || !r.purchase_order_item_id || !portal.has(r.delivery_note_id)) continue;
    const k = key(r.delivery_note_id, r.purchase_order_item_id);
    rec.set(k, (rec.get(k) ?? 0) + num(r.quantity) * upu(r.units_per_uom));
  }
  const itemsByPo = new Map<string, ShipPoItemRow[]>();
  for (const it of i.items) itemsByPo.set(it.purchase_order_id, [...(itemsByPo.get(it.purchase_order_id) ?? []), it]);

  for (const [poId, s] of base) {
    const items = itemsByPo.get(poId) ?? [];
    const partial = items.some((it) => {
      let shippedUnits = 0;
      for (const n of portal.values()) {
        const a = ann.get(key(n.id, it.id)) ?? 0;
        if (a <= 0) continue;
        shippedUnits += n.status === "closed" ? Math.min(a, rec.get(key(n.id, it.id)) ?? 0) : a;
      }
      const shipped = shippedUnits / upu(it.units_per_uom);
      const toShip = Math.max(num(it.quantity) - Math.max(num(it.received_quantity), shipped), 0);
      return toShip > EPS;
    });
    out.set(poId, { ...s, partial });
  }
  return out;
}

/** Estados em que a PO ainda se recebe (os mesmos de "Por receber" na Receção). */
const RECEIVABLE = new Set(["pending", "ordered", "partially_received"]);

/** A expedição a mostrar/usar nesta PO (só em aberto; recebida, cancelada ou eliminada → nada). */
export function activeShipment(
  order: { id: string; status: string; deleted_at?: string | null },
  shipments: ReadonlyMap<string, PoShipment>,
): PoShipment | null {
  if (order.deleted_at || !RECEIVABLE.has(order.status)) return null;
  return shipments.get(order.id) ?? null;
}

/** "Expedida · GR 12345", "Parcialmente expedida · GR 12345 +1". */
export function poShipmentLabel(s: Pick<PoShipment, "noteNumber" | "count" | "partial">): string {
  return `${s.partial ? "Parcialmente expedida" : "Expedida"} · ${noteLabel(s.noteNumber)}${s.count > 1 ? ` +${s.count - 1}` : ""}`;
}

const SHIPPED_FILTER = JSON.stringify([{ action: "shipped", origin: "supplier_portal" }]);
const CHUNK = 100;

function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < list.length; k += size) out.push(list.slice(k, k + size));
  return out;
}

/** PostgREST devolve no máximo 1000 linhas por pedido: as leituras de linhas vão em blocos pequenos (SMALL). */
const SMALL = 25;

async function inChunks<T>(
  ids: readonly string[],
  run: (part: string[]) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  size = CHUNK,
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunks(ids, size)) {
    const { data, error } = await run(part);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

/** Leitura em lote das expedições do portal ainda por receber, por PO. */
export async function fetchPoPortalShipments(orgId: string): Promise<Map<string, PoShipment>> {
  const open = await fetchAllRows<PortalShipNoteRow>((from, to) =>
    supabase
      .from("supplier_delivery_notes")
      .select("id, note_number, created_at, status, history")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .contains("history", SHIPPED_FILTER)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const openPortal = open.filter((n) => isPortalNote(n.history));
  if (!openPortal.length) return new Map();

  const openLinks = await inChunks<ShipLinkRow>(openPortal.map((n) => n.id), (part) =>
    supabase.from("supplier_delivery_note_orders").select("delivery_note_id, purchase_order_id").eq("organization_id", orgId).in("delivery_note_id", part),
  );
  // As POs destas guias (pela ligação ou pelo purchase_order_id do history, como em shipmentsByPo).
  const firstPass = shipmentsByPo(openPortal, openLinks);
  const poIds = [...firstPass.keys()];
  if (!poIds.length) return new Map();

  const [poLinks, items] = await Promise.all([
    inChunks<ShipLinkRow>(poIds, (part) =>
      supabase.from("supplier_delivery_note_orders").select("delivery_note_id, purchase_order_id").eq("organization_id", orgId).in("purchase_order_id", part),
    ),
    inChunks<ShipPoItemRow>(poIds, (part) =>
      supabase
        .from("purchase_order_items")
        .select("id, purchase_order_id, quantity, received_quantity, units_per_uom")
        .in("purchase_order_id", part)
        .eq("item_type", "product"),
      SMALL,
    ),
  ]);
  const known = new Set(openPortal.map((n) => n.id));
  const otherIds = [...new Set(poLinks.map((l) => l.delivery_note_id).filter((id) => !known.has(id)))];
  const closed = otherIds.length
    ? (
        await inChunks<PortalShipNoteRow>(otherIds, (part) =>
          supabase
            .from("supplier_delivery_notes")
            .select("id, note_number, created_at, status, history")
            .eq("organization_id", orgId)
            .eq("status", "closed")
            .in("id", part),
        )
      ).filter((n) => isPortalNote(n.history))
    : [];
  const notes = [...openPortal, ...closed];
  const [lines, receipts] = await Promise.all([
    inChunks<ShipNoteLineRow>(notes.map((n) => n.id), (part) =>
      supabase
        .from("supplier_delivery_note_lines")
        .select("delivery_note_id, purchase_order_item_id, quantity, units_per_uom")
        .eq("organization_id", orgId)
        .in("delivery_note_id", part),
      SMALL,
    ),
    closed.length
      ? inChunks<ShipReceiptRow>(closed.map((n) => n.id), (part) =>
          supabase
            .from("purchase_order_receipts")
            .select("delivery_note_id, purchase_order_item_id, quantity, units_per_uom")
            .eq("organization_id", orgId)
            .in("delivery_note_id", part)
            .eq("kind", "receipt")
            .is("reverted_at", null),
          SMALL,
        )
      : Promise.resolve([] as ShipReceiptRow[]),
  ]);
  const links = [...openLinks, ...poLinks.filter((l) => !openLinks.some((o) => o.delivery_note_id === l.delivery_note_id && o.purchase_order_id === l.purchase_order_id))];
  return computePoShipments({ notes, links, lines, receipts, items });
}
