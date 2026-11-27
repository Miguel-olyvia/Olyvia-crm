// 27/11 (Rúben: «um botão para dar "ok" aos materiais de uma obra»): o botão de teste recebe as encomendas a fornecedor da obra sem as
// enviar e dá entrada do que falta; o que não pode (sem fornecedor ligado) diz-se.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emFaltaDe, garantirMateriaisTeste, ligacaoPara, textoGarantir, type LinhaEc } from "./materiaisTeste";

const linha = (o: Partial<LinhaEc>): LinhaEc => ({ product_id: "p1", product_name: "Base", product_sku: "DB1", item_type: "product", purchase_order_id: null, qty_missing: 0, ...o });

/** Uma base falsa: as tabelas devolvem o que se lhes dá; as RPC ficam registadas. */
function base(docs: LinhaEc[][], tabelas: Record<string, unknown[]>) {
  let leitura = 0;
  const inseridos: { t: string; v: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (fn: string, _a: Record<string, unknown>) => {
    if (fn === "rpc_get_client_order_document") return { data: { lines: docs[Math.min(leitura++, docs.length - 1)], ec_warehouse_id: "w1" }, error: null };
    return { data: {}, error: null };
  });
  const consulta = (t: string) => {
    const q = { select: () => q, eq: () => q, ilike: () => q, in: () => q, is: () => q, order: () => q, limit: () => q,
      insert: (v: Record<string, unknown>) => { inseridos.push({ t, v }); return { select: async () => ({ data: [{ id: "nova" }], error: null }) }; },
      then: (ok: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: tabelas[t] ?? [], error: null }).then(ok) };
    return q;
  };
  return { sb: { rpc, from: consulta } as unknown as SupabaseClient, rpc, inseridos };
}

describe("dar os materiais como garantidos (teste)", () => {
  it("recebe as encomendas a fornecedor abertas da obra (sem as enviar) e dá entrada do que falta com o fornecedor ligado", async () => {
    const { sb, rpc } = base(
      [[linha({ qty_missing: 0 })], [linha({ product_id: "p2", product_sku: "DBR", qty_missing: 1 })], []],
      {
        purchase_orders: [{ id: "po1", order_number: "PO-1", status: "pending" }, { id: "po2", order_number: "PO-2", status: "received" }],
        purchase_order_items: [{ id: "i1", quantity: 3, received_quantity: 1 }],
        item_suppliers: [{ id: "s2", product_id: "p2", is_preferred: false }],
      },
    );
    const r = await garantirMateriaisTeste(sb, "org", "c1");
    expect(rpc).toHaveBeenCalledWith("rpc_receive_purchase_order_lines", expect.objectContaining({ p_purchase_order_id: "po1", p_warehouse_id: "w1", p_lines: [{ purchase_order_item_id: "i1", quantity: 2 }] }));
    expect(rpc).not.toHaveBeenCalledWith("rpc_po_send_to_supplier", expect.anything());
    expect(rpc).toHaveBeenCalledWith("rpc_register_stock_entry", expect.objectContaining({ p_product_id: "p2", p_qty: 1, p_item_supplier_id: "s2", p_warehouse_id: "w1" }));
    expect(r).toEqual({ recebidas: ["PO-1"], entradas: ["DBR · Base"], deFora: [] });
    expect(textoGarantir(r).kind).toBe("ok");
  });
  it("sem nenhum fornecedor ligado, liga-se ao Fornecedor Demo (não preferido) e dá-se entrada", async () => {
    const falta = [linha({ product_id: "p9", product_sku: "DBR0255", product_name: "Resguardo", qty_missing: 1 })];
    const { sb, rpc, inseridos } = base([falta, falta, []], { purchase_orders: [], item_suppliers: [], suppliers: [{ id: "demo" }] });
    const r = await garantirMateriaisTeste(sb, "org", "c1", "bu-1");
    expect(inseridos).toEqual([{ t: "item_suppliers", v: expect.objectContaining({ product_id: "p9", supplier_id: "demo", is_preferred: false, created_by: "bu-1" }) }]);
    expect(rpc).toHaveBeenCalledWith("rpc_register_stock_entry", expect.objectContaining({ p_product_id: "p9", p_item_supplier_id: "nova" }));
    expect(r.deFora).toEqual([]);
  });
  it("sem nenhum fornecedor ligado e sem o Fornecedor Demo, o produto fica de fora e diz-se porquê", async () => {
    const falta = [linha({ product_id: "p9", product_sku: "DBR0255", product_name: "Resguardo", qty_missing: 1 })];
    const { sb, rpc } = base([falta, falta, falta], { purchase_orders: [], item_suppliers: [] });
    const r = await garantirMateriaisTeste(sb, "org", "c1");
    expect(rpc).not.toHaveBeenCalledWith("rpc_register_stock_entry", expect.anything());
    expect(r.deFora).toEqual([{ produto: "DBR0255 · Resguardo", motivo: "sem nenhum fornecedor ligado no Catálogo e sem o «Fornecedor Demo» na organização" }]);
    const t = textoGarantir(r);
    expect(t.kind).toBe("bad");
    expect(t.sub).toMatch(/Nada foi enviado a fornecedores/);
  });
  it("a ligação preferida ganha; o que falta conta só produtos", () => {
    expect(ligacaoPara("p", [{ id: "a", product_id: "p", is_preferred: false }, { id: "b", product_id: "p", is_preferred: true }])).toBe("b");
    expect(ligacaoPara("x", [])).toBeNull();
    expect(emFaltaDe([linha({ qty_missing: 2 }), linha({ item_type: "service", qty_missing: 1 }), linha({ qty_missing: 0 })])).toHaveLength(1);
  });
});
