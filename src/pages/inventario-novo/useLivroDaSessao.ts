// O livro da sessão do novo Inventário (fatia 3): os movimentos de stock que ESTE utilizador fez na organização ativa desde
// que abriu o novo Inventário (stock_movements: organization_id, created_by = current_business_user_id() — a mesma função
// que as RPCs de stock usam para created_by —, created_at ≥ abertura; os 20 mais recentes). Só leituras:
//  · stock_movements (+ products.name e warehouses.name pelas chaves estrangeiras);
//  · purchase_order_receipts.stock_movement_id → a PO e a linha de cada receção (para o "Reverter receção" clássico);
//  · stock_movements.reversal_of_movement_id → o que já foi revertido (por quem for).
//
// Volta a ler: ao voltar à janela (focus / visibilitychange), ao trocar de separador (`chave`) e quando uma folha ou um
// diálogo Radix fecha (data-state="closed" num [role=dialog|alertdialog]) — com um atraso curto, sem polling.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MovimentoLivro } from "./anularInventario";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const LIMITE_LIVRO = 20;
/** Margem tirada à hora de abertura (relógio do cliente vs created_at do servidor). Ver InventarioNovo.tsx. */
export const MARGEM_RELOGIO_MS = 2 * 60 * 1000;
const ATRASO_MS = 600;

export const chaveLivro = (orgId: string | null, desde: string) => ["inventario-novo-livro", orgId, desde] as const;

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Quem está na sessão, como as RPCs o gravam em created_by (anew_users.id). null se a base não souber. */
async function quemSou(): Promise<string | null> {
  const r = await db.rpc("current_business_user_id");
  if (!r || r.error) return null;
  return typeof r.data === "string" && r.data ? r.data : null;
}

export async function lerLivro(orgId: string, desde: string): Promise<MovimentoLivro[]> {
  const eu = await quemSou();
  if (!eu) return [];
  const { data, error } = await db
    .from("stock_movements")
    .select("id, movement_type, document_type, document_number, quantity, product_id, warehouse_id, reference_id, sale_source_type, sale_source_id, reversal_of_movement_id, created_at, products(name), warehouses(name)")
    .eq("organization_id", orgId)
    // `desde` = abertura menos MARGEM_RELOGIO_MS (o relógio do cliente pode estar adiantado). Os movimentos dessa margem,
    // feitos antes de abrir, só entram por serem deste utilizador (created_by = eu) — é o mesmo filtro, por isso aceitável.
    .eq("created_by", eu)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(LIMITE_LIVRO);
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown> & { products?: { name?: string | null } | null; warehouses?: { name?: string | null } | null }>;
  const ids = rows.map((r) => String(r.id));
  const recebidos = new Map<string, { purchase_order_id: string; purchase_order_item_id: string | null }>();
  const revertidos = new Set<string>();
  if (ids.length) {
    const [rec, rev] = await Promise.all([
      db.from("purchase_order_receipts")
        .select("purchase_order_id, purchase_order_item_id, stock_movement_id")
        .eq("organization_id", orgId)
        .in("stock_movement_id", ids),
      db.from("stock_movements")
        .select("id, reversal_of_movement_id")
        .eq("organization_id", orgId)
        .in("reversal_of_movement_id", ids),
    ]);
    // Sem acesso às receções (RLS) ou aos estornos: o movimento fica sem a ligação (cai no "não se anula aqui"), nunca erro.
    if (!rec?.error) {
      for (const r of (rec?.data ?? []) as Array<{ purchase_order_id: string; purchase_order_item_id: string | null; stock_movement_id: string | null }>) {
        if (r.stock_movement_id && r.purchase_order_id) recebidos.set(r.stock_movement_id, { purchase_order_id: r.purchase_order_id, purchase_order_item_id: r.purchase_order_item_id ?? null });
      }
    }
    if (!rev?.error) {
      for (const r of (rev?.data ?? []) as Array<{ reversal_of_movement_id: string | null }>) if (r.reversal_of_movement_id) revertidos.add(r.reversal_of_movement_id);
    }
  }
  return rows.map((r) => ({
    id: String(r.id),
    movement_type: String(r.movement_type ?? ""),
    document_type: String(r.document_type ?? ""),
    document_number: String(r.document_number ?? ""),
    quantity: toNum(r.quantity),
    product_id: String(r.product_id ?? ""),
    produto: r.products?.name ?? null,
    warehouse_id: String(r.warehouse_id ?? ""),
    armazem: r.warehouses?.name ?? null,
    reference_id: (r.reference_id as string | null) ?? null,
    sale_source_type: (r.sale_source_type as string | null) ?? null,
    sale_source_id: (r.sale_source_id as string | null) ?? null,
    reversal_of_movement_id: (r.reversal_of_movement_id as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    rececao: recebidos.get(String(r.id)) ?? null,
    anulado: revertidos.has(String(r.id)),
  }));
}

/** Um [role=dialog|alertdialog] que passou a data-state="closed" (uma folha ou um diálogo Radix a fechar). */
export function fechouDialogo(m: Pick<MutationRecord, "type" | "attributeName" | "oldValue" | "target">): boolean {
  if (m.type !== "attributes" || m.attributeName !== "data-state" || m.oldValue !== "open") return false;
  const el = m.target as Element;
  if (!el || typeof el.getAttribute !== "function") return false;
  const role = el.getAttribute("role");
  return (role === "dialog" || role === "alertdialog") && el.getAttribute("data-state") === "closed";
}

/**
 * @param desde ISO da abertura do novo Inventário.
 * @param chave muda ao trocar de separador (volta a ler).
 */
export function useLivroDaSessao(orgId: string | null, desde: string, chave: string, enabled = true) {
  const q = useQuery({
    queryKey: chaveLivro(orgId, desde),
    queryFn: () => lerLivro(orgId as string, desde),
    enabled: !!orgId && enabled,
    staleTime: 0,
    refetchOnWindowFocus: false, // o focus trata-se abaixo, com o mesmo atraso dos outros
    retry: false,
  });
  const { refetch } = q;
  const ativo = !!orgId && enabled;
  const temporizador = useRef<number | null>(null);
  const recarregar = useRef(() => {});
  recarregar.current = () => {
    if (!ativo) return;
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;
      void refetch();
    }, ATRASO_MS);
  };

  // Trocar de separador.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    recarregar.current();
  }, [chave]);

  // Voltar à janela; uma folha ou um diálogo a fechar.
  useEffect(() => {
    if (!ativo) return;
    const aoFocar = () => recarregar.current();
    const aoMudarVisibilidade = () => { if (document.visibilityState === "visible") recarregar.current(); };
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    let obs: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      obs = new MutationObserver((L) => { if (L.some(fechouDialogo)) recarregar.current(); });
      obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-state"], attributeOldValue: true });
    }
    return () => {
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      obs?.disconnect();
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    };
  }, [ativo]);

  return { movimentos: q.data, aCarregar: q.isLoading, recarregar: () => void refetch() };
}
