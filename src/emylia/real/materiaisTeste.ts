// 27/11 (Rúben: «temos de ter um botão para dar "ok" aos materiais de uma obra, porque senão para testar é muito difícil e leva muito tempo,
// mete isso no negócio step materiais»). Só no modo de teste do super admin (real/modoTeste.ts: a página liga-o quando a base diz que sim).
//
// «Dar os materiais como garantidos (teste)» põe os materiais da encomenda de cliente (EC) no armazém, pelos caminhos que a app já usa,
// SEM contactar fornecedores:
//  1. As encomendas a fornecedor da obra ainda abertas (pendentes, encomendadas ou recebidas em parte) RECEBEM-SE inteiras no armazém da EC
//     (rpc_receive_purchase_order_lines, o mesmo da Receção). Uma pendente não se aprova nem se envia: recebe-se logo, por isso nada vai
//     ao portal nem ao email do fornecedor. A base reserva o que entra para a EC (fn_po_receipt_allocation).
//  2. O que ainda falta (sem encomenda a fornecedor) ENTRA no armazém da EC por uma entrada de stock (rpc_register_stock_entry, a mesma
//     de «Registar movimento · Entrada»), com o fornecedor ligado ao produto (o preferido, senão outro ativo). A reserva da EC é por ordem
//     de assinatura (FIFO): o que entra fica para a EC.
//     O produto sem NENHUM fornecedor (a entrada de stock da base exige um) liga-se ao fornecedor de teste («Fornecedor Demo»), como NÃO
//     preferido: o pedido ao fornecedor do Catálogo fica como estava.
//  3. Fica de fora, e diz-se: o produto sem fornecedor quando a organização não tem o fornecedor de teste, e o que, depois de entrar, a
//     base reservou para uma encomenda de cliente mais antiga.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface LinhaEc {
  product_id: string | null; product_name: string | null; product_sku: string | null; item_type: string;
  purchase_order_id: string | null; qty_missing?: number | null; qty_ordered?: number | null; qty_received?: number | null;
}
export interface ResultadoGarantir {
  /** As encomendas a fornecedor recebidas (o número). */
  recebidas: string[];
  /** Os produtos que entraram por entrada de stock. */
  entradas: string[];
  /** O que ficou de fora e porquê. */
  deFora: { produto: string; motivo: string }[];
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const rpcDe = (sb: SupabaseClient): Rpc => (fn, args) => (sb as unknown as { rpc: Rpc }).rpc(fn, args);
const erro = (e: { message?: string } | null, o: string): Error => new Error(e?.message || o);
/** Uma consulta a uma tabela sem os tipos gerados (as colunas lidas estão escritas em cada uso). */
interface Consulta extends PromiseLike<{ data: unknown; error: { message?: string } | null }> {
  select(c: string): Consulta; eq(c: string, v: unknown): Consulta; ilike(c: string, v: string): Consulta; in(c: string, v: unknown[]): Consulta; is(c: string, v: null): Consulta;
  order(c: string): Consulta; limit(n: number): Consulta;
}
const tabela = (sb: SupabaseClient, t: string): Consulta => (sb as unknown as { from: (t: string) => Consulta }).from(t);
const nomeDe = (l: LinhaEc) => [l.product_sku, l.product_name].filter(Boolean).join(" · ") || "produto";

/** A EC: as linhas e o armazém dela. */
export async function lerDocumentoEc(sb: SupabaseClient, contrato: string): Promise<{ linhas: LinhaEc[]; armazem: string | null }> {
  const { data, error } = await rpcDe(sb)("rpc_get_client_order_document", { p_contract_id: contrato });
  if (error) throw erro(error, "Não foi possível ler a encomenda de cliente.");
  const d = (data ?? {}) as { lines?: LinhaEc[]; ec_warehouse_id?: string | null };
  return { linhas: Array.isArray(d.lines) ? d.lines : [], armazem: d.ec_warehouse_id ?? null };
}

/** O que falta por linha de produto (unidades base), já sem o que vem a caminho numa encomenda a fornecedor. */
export const emFaltaDe = (L: readonly LinhaEc[]): LinhaEc[] =>
  L.filter((l) => l.item_type === "product" && !!l.product_id && Number(l.qty_missing ?? 0) > 0);

/** Escolhe a ligação produto ↔ fornecedor para a entrada: a preferida; senão a primeira ativa. */
export function ligacaoPara(produto: string, L: readonly { id: string; product_id: string; is_preferred: boolean | null }[]): string | null {
  const doProduto = L.filter((x) => x.product_id === produto);
  return (doProduto.find((x) => x.is_preferred) ?? doProduto[0])?.id ?? null;
}

/** O fornecedor de teste da organização (o da demo da Mudelar, 18/11). */
export const FORNECEDOR_DE_TESTE = "Fornecedor Demo";

/** Liga o produto ao fornecedor de teste (não preferido: o Catálogo fica como estava para o pedido ao fornecedor). Devolve a ligação,
 *  ou o motivo por que não deu. 27/11 (no testarh: «sem o Fornecedor Demo»): faltava o created_by (obrigatório) e o erro perdia-se. */
async function ligarAoFornecedorDeTeste(sb: SupabaseClient, org: string, produto: string, autor: string | null): Promise<{ id: string } | { motivo: string }> {
  const f = await tabela(sb, "suppliers").select("id").eq("organization_id", org).ilike("name", FORNECEDOR_DE_TESTE).is("deleted_at", null).limit(1);
  const fornecedor = (f.data as { id: string }[] | null)?.[0]?.id;
  if (f.error) return { motivo: `não deu para ler o «${FORNECEDOR_DE_TESTE}»: ${f.error.message ?? "erro"}` };
  if (!fornecedor) return { motivo: `sem nenhum fornecedor ligado no Catálogo e sem o «${FORNECEDOR_DE_TESTE}» na organização` };
  if (!autor) return { motivo: "não se encontrou o perfil de quem está a usar a app" };
  const ins = await (sb as unknown as { from: (t: string) => { insert: (v: Record<string, unknown>) => { select: (c: string) => PromiseLike<{ data: { id: string }[] | null; error: { message?: string } | null }> } } })
    .from("item_suppliers").insert({ organization_id: org, item_type: "product", product_id: produto, supplier_id: fornecedor, is_preferred: false, is_active: true, created_by: autor }).select("id");
  if (ins.error || !ins.data?.[0]?.id) return { motivo: `não deu para ligar ao «${FORNECEDOR_DE_TESTE}»: ${ins.error?.message ?? "sem resposta"}` };
  return { id: ins.data[0].id };
}

/** O texto do aviso, em palavras. */
export function textoGarantir(r: ResultadoGarantir): { msg: string; sub: string; kind: "ok" | "bad" } {
  const partes: string[] = [];
  if (r.recebidas.length) partes.push(`Recebidas no armazém: ${r.recebidas.join(", ")}.`);
  if (r.entradas.length) partes.push(`Entrada de stock: ${r.entradas.length === 1 ? "1 produto" : `${r.entradas.length} produtos`}.`);
  if (r.deFora.length) partes.push(`Ficou de fora: ${r.deFora.map((x) => `${x.produto} (${x.motivo})`).join("; ")}.`);
  if (!partes.length) partes.push("Os materiais já estavam todos garantidos.");
  return { msg: r.deFora.length ? "Materiais garantidos em parte (teste)" : "Materiais garantidos (teste)", sub: `${partes.join(" ")} Nada foi enviado a fornecedores.`, kind: r.deFora.length ? "bad" : "ok" };
}

/** Põe os materiais da EC do contrato no armazém (ver o topo do ficheiro). */
export async function garantirMateriaisTeste(sb: SupabaseClient, org: string, contrato: string, autor: string | null = null): Promise<ResultadoGarantir> {
  const rpc = rpcDe(sb);
  const res: ResultadoGarantir = { recebidas: [], entradas: [], deFora: [] };
  const doc = await lerDocumentoEc(sb, contrato);
  let armazem = doc.armazem;
  if (!armazem) {
    // sem reserva nem sugestão da base: o primeiro armazém das encomendas de cliente da organização
    const w = await tabela(sb, "warehouses").select("id").eq("organization_id", org).is("deleted_at", null).order("created_at").limit(1);
    armazem = (w.data as { id: string }[] | null)?.[0]?.id ?? null;
  }
  if (!armazem) throw new Error("A encomenda de cliente não tem armazém e a organização não tem nenhum.");

  // 1. as encomendas a fornecedor da obra ainda abertas: recebem-se inteiras (sem aprovar nem enviar)
  const pos = await tabela(sb, "purchase_orders").select("id, order_number, status").eq("organization_id", org).eq("source_type", "contract").eq("source_id", contrato).is("deleted_at", null);
  if (pos.error) throw erro(pos.error, "Não foi possível ler as encomendas a fornecedor da obra.");
  for (const po of ((pos.data ?? []) as { id: string; order_number: string; status: string }[]).filter((p) => p.status !== "received" && p.status !== "cancelled")) {
    const it = await tabela(sb, "purchase_order_items").select("id, quantity, received_quantity").eq("purchase_order_id", po.id);
    if (it.error) throw erro(it.error, `Não foi possível ler as linhas da ${po.order_number}.`);
    const linhas = ((it.data ?? []) as { id: string; quantity: number; received_quantity: number | null }[]).map((x) => ({ purchase_order_item_id: x.id, quantity: Number(x.quantity) - Number(x.received_quantity ?? 0) })).filter((x) => x.quantity > 0);
    if (!linhas.length) continue;
    const { error } = await rpc("rpc_receive_purchase_order_lines", { p_purchase_order_id: po.id, p_warehouse_id: armazem, p_lines: linhas, p_actual_delivery_date: null });
    if (error) throw erro(error, `Não foi possível receber a ${po.order_number}.`);
    res.recebidas.push(po.order_number);
  }

  // 2. o que ainda falta: entrada de stock com o fornecedor ligado ao produto
  const falta = emFaltaDe((await lerDocumentoEc(sb, contrato)).linhas);
  if (falta.length) {
    const ids = [...new Set(falta.map((l) => l.product_id!))];
    const lig = await tabela(sb, "item_suppliers").select("id, product_id, is_preferred").eq("organization_id", org).in("product_id", ids).eq("is_active", true).is("deleted_at", null);
    if (lig.error) throw erro(lig.error, "Não foi possível ler os fornecedores dos produtos.");
    for (const l of falta) {
      let ligacao = ligacaoPara(l.product_id!, (lig.data ?? []) as { id: string; product_id: string; is_preferred: boolean | null }[]);
      // sem nenhum fornecedor: liga-se ao fornecedor de teste («Fornecedor Demo»), não preferido, só para a entrada poder acontecer
      if (!ligacao) {
        const r = await ligarAoFornecedorDeTeste(sb, org, l.product_id!, autor);
        if ("motivo" in r) { res.deFora.push({ produto: nomeDe(l), motivo: r.motivo }); continue; }
        ligacao = r.id;
      }
      const { error } = await rpc("rpc_register_stock_entry", {
        p_product_id: l.product_id, p_warehouse_id: armazem, p_qty: Math.ceil(Number(l.qty_missing)), p_item_supplier_id: ligacao,
        p_unit_cost: null, p_counterparty: "Modo de teste", p_notes: "Modo de teste: materiais da obra dados como garantidos (sem fornecedor)",
      });
      if (error) { res.deFora.push({ produto: nomeDe(l), motivo: error.message || "a entrada de stock falhou" }); continue; }
      res.entradas.push(nomeDe(l));
    }
  }

  // 3. o que, mesmo assim, não ficou reservado para esta EC (a reserva é por ordem de assinatura)
  const ainda = emFaltaDe((await lerDocumentoEc(sb, contrato)).linhas);
  for (const l of ainda) if (!res.deFora.some((x) => x.produto === nomeDe(l))) res.deFora.push({ produto: nomeDe(l), motivo: "reservado para uma encomenda de cliente mais antiga" });
  return res;
}
