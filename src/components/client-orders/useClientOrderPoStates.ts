// Estado das encomendas a fornecedor ligadas às linhas de uma Encomenda
// Cliente, em texto curto para a coluna "De onde vem" (poStateText do
// protótipo): estado da PO + estado no portal do fornecedor. Só leitura e
// best-effort: purchase_orders e supplier_po_publications passam pela RLS
// (purchase_orders.view); sem acesso ou com erro, a coluna mostra só o nº da PO.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const shortDate = (value: string | null | undefined): string => {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m && value.length === 10) return `${m[3]}/${m[2]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
};

interface PoRow {
  id: string;
  status: string | null;
  deleted_at: string | null;
}

interface PublicationRow {
  purchase_order_id: string;
  status: string;
  viewed_at: string | null;
  confirmed_at: string | null;
  promised_date: string | null;
}

function describe(po: PoRow | undefined, pub: PublicationRow | undefined): string | null {
  if (!po) return null;
  if (po.deleted_at) return "eliminada";
  switch (po.status) {
    case "pending":
      return "rascunho por aprovar";
    case "received":
      return "recebida";
    case "cancelled":
      return "cancelada";
    default:
      break;
  }
  if (pub) {
    if (pub.status === "confirmed") {
      const d = shortDate(pub.promised_date);
      return d ? `no portal, confirmada (entrega ${d})` : "no portal, confirmada";
    }
    if (pub.status === "viewed") {
      const d = shortDate(pub.viewed_at);
      return d ? `no portal, vista ${d}` : "no portal, vista";
    }
    if (pub.status === "sent") return "no portal, por ver";
    if (pub.status === "withdrawn") return "retirada do portal";
  }
  if (po.status === "partially_received") return "parcialmente recebida";
  if (po.status === "ordered") return "encomendada";
  return po.status ?? null;
}

/** poId → texto do estado (só as POs que se conseguiram ler). */
export function useClientOrderPoStates(
  organizationId: string | null | undefined,
  poIds: readonly string[],
): Record<string, string> {
  const ids = Array.from(new Set(poIds.filter(Boolean))).sort();
  const query = useQuery({
    queryKey: ["client-order-po-states", organizationId, ids],
    enabled: !!organizationId && ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, string>> => {
      // Só POs da organização ativa; a publicação só conta se a PO veio
      // (describe exige a PO), por isso herda o mesmo âmbito.
      const [posRes, pubsRes] = await Promise.all([
        (supabase as any)
          .from("purchase_orders")
          .select("id, status, deleted_at")
          .eq("organization_id", organizationId)
          .in("id", ids),
        (supabase as any)
          .from("supplier_po_publications")
          .select("purchase_order_id, status, viewed_at, confirmed_at, promised_date")
          .in("purchase_order_id", ids),
      ]);
      if (posRes.error) throw posRes.error;
      const pos = new Map(((posRes.data || []) as PoRow[]).map((p) => [p.id, p]));
      // Publicações: falha (tabela por aplicar, RLS) → só o estado da PO.
      const pubs = new Map(
        (pubsRes.error ? [] : ((pubsRes.data || []) as PublicationRow[])).map((p) => [p.purchase_order_id, p]),
      );
      const out: Record<string, string> = {};
      for (const id of ids) {
        const text = describe(pos.get(id), pubs.get(id));
        if (text) out[id] = text;
      }
      return out;
    },
  });
  return query.data ?? {};
}
