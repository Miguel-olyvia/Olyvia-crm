// CRM (28/10/2026): a encomenda de cliente e as encomendas a fornecedor do negócio, lidas da base, nos ecrãs da Emylia (Materiais da obra,
// o resumo no Financeiro e na Obra, a receção). Na V1 vinham do Inventário de exemplo do browser (inventario/loja). Na Olyvia a encomenda
// de cliente é o contrato assinado com ec_emitida_em (20261231980000, 20261231999700: nasce com a fatura e o 1.º pagamento validados, e
// a base pede logo ao fornecedor o que falta). Aqui lê-se o documento da encomenda (rpc_get_client_order_document: as linhas com o
// reservado, o servido, o pedido e o recebido) e as encomendas a fornecedor do contrato (purchase_orders), e monta-se o mesmo resumo que
// os ecrãs já mostram (ResumoEcNeg). O resumo de um negócio com encomenda na base passa a ser este (inventario/ponteNegocios.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { EC_ESTADOS, type EstadoEc, type EstadoLinhaEc } from "../inventario/ec";
import type { FasePo, LinhaResumoNeg, PoResumoNeg, ResumoEcNeg } from "../inventario/ponteNegocios";

export interface LinhaDocEc {
  quote_line_id: string; item_type: "product" | "service"; product_id: string | null; product_name: string | null; product_sku: string | null;
  quantity: number | null; unidade: string | null; line_status: string | null; purchase_order_id: string | null;
  qty_needed: number | null; qty_reserved: number | null; qty_ordered: number | null; qty_received: number | null; qty_missing: number | null;
  qty_served: number | null; has_preferred_supplier: boolean | null;
}
export interface DocEc { contract_id?: string; order_number: string | null; signed?: boolean; lines: LinhaDocEc[] }
export interface PoBase { id: string; order_number: string | null; status: string; expected_delivery: string | null; fornecedor: string | null }

const n = (x: unknown): number => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const FASE: Record<string, FasePo> = {
  pending: "por aprovar", draft: "por aprovar", ordered: "no portal", sent: "no portal", partially_received: "parcial", received: "recebida", cancelled: "cancelada",
};

export const poResumo = (p: PoBase): PoResumoNeg => ({
  id: p.order_number ?? p.id, uuid: p.id, forn: p.fornecedor ?? "Fornecedor", estado: p.status, fase: FASE[p.status] ?? "no portal",
  prometida: null, prevista: (p.expected_delivery ?? "").slice(0, 10),
});

/** O estado de uma linha, como o Inventário da V1 o diz (servido, pronto a sair, à espera do fornecedor, sem fornecedor…). */
export function estadoDaLinha(l: LinhaDocEc): EstadoLinhaEc {
  if (l.item_type !== "product") return "service";
  const q = n(l.qty_needed) || n(l.quantity), servido = n(l.qty_served), res = n(l.qty_reserved), ped = n(l.qty_ordered), rec = n(l.qty_received);
  if (q > 0 && servido >= q) return "served";
  // 30/10 (visto no browser): como a base (rpc_get_client_order_document: "is_served = qty_served + qty_received >= qty_needed"), o que
  // chegou do fornecedor para esta linha conta; antes, com a receção feita e a reserva a 0, a linha ficava "parcial" e a obra não arrancava
  if (q > 0 && servido + Math.max(res, rec) >= q) return rec > 0 ? "recvpo" : "ready";
  if (ped > rec) return "waitpo";
  if (n(l.qty_missing) > 0 && l.has_preferred_supplier === false) return "nosup";
  if (res > 0 || servido > 0) return "partial";
  return "missing";
}

/** O resumo da encomenda de cliente da base, no formato dos ecrãs. */
export function resumoDaBase(doc: DocEc, pos: readonly PoBase[]): ResumoEcNeg {
  const porId = new Map(pos.map((p) => [p.id, poResumo(p)]));
  const ec = doc.order_number ?? "Encomenda de cliente";
  const linhas: LinhaResumoNeg[] = (doc.lines ?? []).filter((l) => l.item_type === "product").map((l) => {
    const st = estadoDaLinha(l), q = n(l.qty_needed) || n(l.quantity);
    const servido = n(l.qty_served), pronto = n(l.qty_reserved), aChegar = Math.max(0, n(l.qty_ordered) - n(l.qty_received));
    const semForn = st === "nosup" ? n(l.qty_missing) : 0;
    const po = l.purchase_order_id ? porId.get(l.purchase_order_id) : undefined;
    return {
      ec, id: l.quote_line_id, sku: l.product_sku ?? "", n: l.product_name ?? "Produto", q, un: l.unidade ?? "un", st, rotulo: l.line_status ?? st,
      aBordo: false, saida: servido, pronto, aChegar, semForn, pos: po ? [po] : [],
    };
  });
  const servidas = linhas.filter((l) => l.st === "served").length, prontas = linhas.filter((l) => l.st === "ready" || l.st === "recvpo").length;
  const aFornecedor = linhas.filter((l) => l.aChegar > 0).length, semForn = linhas.filter((l) => l.semForn > 0).length;
  const estado: EstadoEc = linhas.length && servidas === linhas.length ? "full" : semForn ? "nosup" : aFornecedor ? "waiting" : "partial";
  return {
    id: ec, eliminada: false, estado, rotulo: EC_ESTADOS[estado], linhas, ajustes: [],
    tot: { linhas: linhas.length, servidas, prontas, aBordo: 0, aFornecedor, semForn }, pos: [...porId.values()],
    pronta: linhas.every((l) => l.st === "served" || l.st === "ready" || l.st === "recvpo"),
  };
}

/* ------------------------------------------------------------------ 30/10: aprovar a encomenda a fornecedor */
// A encomenda a fornecedor nasce pendente (a base pede ao fornecedor o que falta quando emite a encomenda de cliente). Quem a aprova e a
// envia ao fornecedor é Compras e armazém (o papel do RH, 20270101340000, ou purchase_orders.approve): rpc_po_send_to_supplier. A página
// liga o aprovador (com a releitura das encomendas); fora dela não há botão.
type Aprovador = (uuid: string) => Promise<void>;
let aprovador: Aprovador | null = null;
export const definirAprovadorPo = (f: Aprovador | null): void => { aprovador = f; };
export const aprovadorPo = (): Aprovador | null => aprovador;

/** Aprova e envia ao fornecedor. A mensagem de erro da base volta tal como vem (sem fornecedor, sem linhas, sem permissão). */
export async function aprovarPoReal(sb: SupabaseClient, uuid: string): Promise<{ publicada: boolean; aviso: string | null }> {
  const { data, error } = await sb.rpc("rpc_po_send_to_supplier" as never, { p_po_id: uuid } as never);
  if (error) throw new Error(error.message || "Não foi possível aprovar a encomenda a fornecedor.");
  const r = (data ?? {}) as { published?: boolean; warning?: string | null };
  return { publicada: r.published === true, aviso: r.warning ?? null };
}

/* ------------------------------------------------------------------ os resumos reais (pela referência do negócio) */
let reais = new Map<string, ResumoEcNeg>();
const ouvintes = new Set<() => void>();
/** Os resumos da base, pela referência do negócio na Emylia (refNegocio: "CT 2026/<n>"). null: volta ao Inventário do browser. */
export function definirEncomendasReais(m: Map<string, ResumoEcNeg> | null): void {
  reais = m ?? new Map();
  for (const f of ouvintes) f();
}
export const encomendaReal = (ref: string | null | undefined): ResumoEcNeg | undefined => (ref ? reais.get(ref) : undefined);
export const subscreverEncomendasReais = (f: () => void): (() => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

type Consulta = { eq: (c: string, v: string) => Consulta; is: (c: string, v: null) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> };

/** Lê o documento e as encomendas a fornecedor de um contrato. */
export async function lerEncomendaReal(sb: SupabaseClient, org: string, contractId: string): Promise<ResumoEcNeg> {
  const { data, error } = await sb.rpc("rpc_get_client_order_document" as never, { p_contract_id: contractId } as never);
  if (error) throw new Error(error.message || "Não foi possível ler a encomenda de cliente.");
  // 30/10 (20270101360000): pela base, que aceita o papel do RH (Compras e armazém não lê purchase_orders pelo RLS do perfil da Olyvia);
  // sem a função (a migration por aplicar), da tabela, como antes
  const r = await sb.rpc("neg_ler_encomendas_fornecedor" as never, { p_org: org, p_contrato: contractId } as never);
  let pos: PoBase[];
  if (!r.error && Array.isArray(r.data)) {
    pos = (r.data as Record<string, unknown>[]).map((p) => ({
      id: String(p.id), order_number: (p.order_number as string | null) ?? null, status: String(p.status ?? ""),
      expected_delivery: (p.expected_delivery as string | null) ?? null, fornecedor: (p.fornecedor as string | null) ?? null,
    }));
  } else {
    if (r.error && r.error.code !== "PGRST202" && r.error.code !== "42883") throw new Error(r.error.message || "Não foi possível ler as encomendas a fornecedor.");
    const tabela = sb.from("purchase_orders" as never) as unknown as { select: (c: string) => Consulta };
    const pq = await tabela.select("id, order_number, status, expected_delivery, suppliers(name)")
      .eq("organization_id", org).eq("source_type", "contract").eq("source_id", contractId).is("deleted_at", null);
    if (pq.error) throw new Error(pq.error.message);
    pos = (pq.data ?? []).map((p) => ({
      id: String(p.id), order_number: (p.order_number as string | null) ?? null, status: String(p.status ?? ""),
      expected_delivery: (p.expected_delivery as string | null) ?? null, fornecedor: (p.suppliers as { name?: string } | null)?.name ?? null,
    }));
  }
  return resumoDaBase((data ?? { order_number: null, lines: [] }) as DocEc, pos);
}

/** As encomendas emitidas de vários negócios (ref → contrato). Um erro num não impede os outros: volta na lista de erros. */
export async function lerEncomendasReais(sb: SupabaseClient, org: string, pares: readonly { ref: string; contrato: string }[]): Promise<{ mapa: Map<string, ResumoEcNeg>; erros: string[] }> {
  const mapa = new Map<string, ResumoEcNeg>(), erros: string[] = [];
  for (const p of pares) {
    try { mapa.set(p.ref, await lerEncomendaReal(sb, org, p.contrato)); } catch (e) { erros.push(`${p.ref}: ${(e as Error).message}`); }
  }
  return { mapa, erros };
}
