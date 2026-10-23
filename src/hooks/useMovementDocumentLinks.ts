// Ligações dos documentos do livro de movimentos (StockMovements.tsx), em lote.
//
// Cada movimento guarda o nº do documento em texto; para o tornar clicável é
// preciso resolver o registo de origem:
//   compra (entrada/reversão de receção) → purchase_orders.id por order_number
//   compra com guia                      → purchase_order_receipts.delivery_note_id
//                                          (pelo stock_movement_id ou revert_movement_id)
//   ajuste de contagem                   → inventory_count_lines.id = reference_id
//                                          → inventory_counts (id, document_number)
// Venda (sale_source_type/sale_source_id) e transferência não precisam de consulta.
//
// Todas as consultas filtram pela organização ativa (a RLS deixa ver também
// organizações descendentes/associadas). Só consulta o que o utilizador pode
// abrir (flags `enabled`), e em blocos de linhas (uma consulta em cache por
// bloco): carregar mais uma página só consulta as linhas novas.
import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MovementLinkSource {
  id: string;
  document_type: string | null;
  document_number: string;
  reference_id: string | null;
}

export interface MovementCountRef {
  countId: string;
  countNumber: string;
}

export interface MovementNoteRef {
  noteId: string;
  noteNumber: string;
}

export interface MovementDocumentLinks {
  /** purchase_orders.order_number → purchase_orders.id */
  poByNumber: Record<string, string>;
  /** inventory_count_lines.id (= stock_movements.reference_id) → contagem */
  countByLineId: Record<string, MovementCountRef>;
  /** stock_movements.id → guia do fornecedor da receção */
  noteByMovementId: Record<string, MovementNoteRef>;
}

export interface MovementDocumentLinksOptions {
  purchaseOrders: boolean;
  counts: boolean;
  deliveryNotes: boolean;
}

const CHUNK = 100;
const EMPTY: MovementDocumentLinks = { poByNumber: {}, countByLineId: {}, noteByMovementId: {} };

const chunks = <T,>(list: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

const uniq = (list: (string | null | undefined)[]): string[] =>
  [...new Set(list.filter((v): v is string => !!v))].sort();

/**
 * Uma consulta por bloco de CHUNK linhas, pela ordem de chegada. A paginação
 * infinita só acrescenta linhas no fim, por isso os blocos anteriores mantêm a
 * mesma chave (ficam em cache) e só o último bloco/os novos são consultados.
 */
function blockQuery(block: MovementLinkSource[], orgId: string | null, options: MovementDocumentLinksOptions) {
  const purchaseRows = block.filter((r) => r.document_type === "compra");
  const poNumbers = options.purchaseOrders ? uniq(purchaseRows.map((r) => r.document_number)) : [];
  const receiptMovementIds = options.deliveryNotes ? uniq(purchaseRows.map((r) => r.id)) : [];
  const countLineIds = options.counts
    ? uniq(block.filter((r) => r.document_type === "ajuste").map((r) => r.reference_id))
    : [];

  const hasWork = poNumbers.length + receiptMovementIds.length + countLineIds.length > 0;

  return {
    queryKey: ["stock-movements-doc-links", orgId, poNumbers, receiptMovementIds, countLineIds],
    queryFn: async (): Promise<MovementDocumentLinks> => {
      const org = orgId as string;
      const result: MovementDocumentLinks = { poByNumber: {}, countByLineId: {}, noteByMovementId: {} };

      const poJobs = chunks(poNumbers).map(async (part) => {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select("id, order_number")
          .eq("organization_id", org)
          .in("order_number", part);
        if (error) throw error;
        for (const po of data ?? []) {
          if (po.order_number) result.poByNumber[po.order_number] = po.id;
        }
      });

      const countJobs = chunks(countLineIds).map(async (part) => {
        const { data, error } = await (supabase as any)
          .from("inventory_count_lines")
          .select("id, inventory_count_id, inventory_counts!inner(document_number, organization_id)")
          .eq("inventory_counts.organization_id", org)
          .in("id", part);
        if (error) throw error;
        for (const line of (data ?? []) as {
          id: string;
          inventory_count_id: string;
          inventory_counts: { document_number: string } | null;
        }[]) {
          result.countByLineId[line.id] = {
            countId: line.inventory_count_id,
            countNumber: line.inventory_counts?.document_number ?? "",
          };
        }
      });

      const noteJobs = chunks(receiptMovementIds).map(async (part) => {
        const list = part.join(",");
        const { data, error } = await (supabase as any)
          .from("purchase_order_receipts")
          .select(
            "stock_movement_id, revert_movement_id, delivery_note_id, supplier_delivery_notes!purchase_order_receipts_delivery_note_id_fkey(note_number)",
          )
          .eq("organization_id", org)
          .not("delivery_note_id", "is", null)
          .or(`stock_movement_id.in.(${list}),revert_movement_id.in.(${list})`);
        if (error) throw error;
        for (const r of (data ?? []) as {
          stock_movement_id: string | null;
          revert_movement_id: string | null;
          delivery_note_id: string;
          supplier_delivery_notes: { note_number: string } | null;
        }[]) {
          const ref: MovementNoteRef = {
            noteId: r.delivery_note_id,
            noteNumber: r.supplier_delivery_notes?.note_number ?? "",
          };
          if (r.stock_movement_id) result.noteByMovementId[r.stock_movement_id] = ref;
          if (r.revert_movement_id) result.noteByMovementId[r.revert_movement_id] = ref;
        }
      });

      await Promise.all([...poJobs, ...countJobs, ...noteJobs]);
      return result;
    },
    enabled: !!orgId && hasWork,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  };
}

export function useMovementDocumentLinks(
  rows: MovementLinkSource[],
  orgId: string | null,
  options: MovementDocumentLinksOptions,
) {
  const blocks = chunks(rows);

  return useQueries({
    queries: blocks.map((block) => blockQuery(block, orgId, options)),
    // Junta os blocos; sem dados (a carregar ou erro) → as células caem em texto simples.
    combine: (results) => {
      const withData = results.filter((r) => r.data);
      if (withData.length === 0) return { links: EMPTY, isLoading: results.some((r) => r.isLoading) };
      const links: MovementDocumentLinks = { poByNumber: {}, countByLineId: {}, noteByMovementId: {} };
      for (const r of withData) {
        const d = r.data as MovementDocumentLinks;
        Object.assign(links.poByNumber, d.poByNumber);
        Object.assign(links.countByLineId, d.countByLineId);
        Object.assign(links.noteByMovementId, d.noteByMovementId);
      }
      return { links, isLoading: results.some((r) => r.isLoading) };
    },
  });
}
