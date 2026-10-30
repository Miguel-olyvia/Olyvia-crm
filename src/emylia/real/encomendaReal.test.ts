// A encomenda de cliente da base nos ecrãs da Emylia (28/10): os estados das linhas como na V1, as encomendas a fornecedor e que o resumo
// do negócio passa a ser o da base (e não o do Inventário do browser).
import { afterEach, describe, expect, it, vi } from "vitest";
import { definirEncomendasReais, estadoDaLinha, lerEncomendaReal, resumoDaBase, type LinhaDocEc } from "./encomendaReal";
import { estadoLinhaNegocio, resumoEcNegocio } from "../inventario/ponteNegocios";

const linha = (o: Partial<LinhaDocEc>): LinhaDocEc => ({
  quote_line_id: "ql", item_type: "product", product_id: "p", product_name: "Base de duche", product_sku: "BD80", quantity: 2, unidade: "un", line_status: null,
  purchase_order_id: null, qty_needed: 2, qty_reserved: 0, qty_ordered: 0, qty_received: 0, qty_missing: 0, qty_served: 0, has_preferred_supplier: true, ...o,
});

afterEach(() => definirEncomendasReais(null));

describe("estadoDaLinha", () => {
  it("servido, pronto a sair, recebido, à espera do fornecedor, sem fornecedor, parcial, em falta e serviço", () => {
    expect(estadoDaLinha(linha({ qty_served: 2 }))).toBe("served");
    expect(estadoDaLinha(linha({ qty_reserved: 2 }))).toBe("ready");
    expect(estadoDaLinha(linha({ qty_reserved: 2, qty_ordered: 2, qty_received: 2 }))).toBe("recvpo");
    expect(estadoDaLinha(linha({ qty_ordered: 2, qty_missing: 2 }))).toBe("waitpo");
    expect(estadoDaLinha(linha({ qty_missing: 2, has_preferred_supplier: false }))).toBe("nosup");
    expect(estadoDaLinha(linha({ qty_reserved: 1, qty_missing: 1 }))).toBe("partial");
    expect(estadoDaLinha(linha({ qty_missing: 2 }))).toBe("missing");
    expect(estadoDaLinha(linha({ item_type: "service" }))).toBe("service");
  });
});

describe("resumoDaBase", () => {
  it("só os produtos, com a encomenda a fornecedor da linha e os totais; pronta só com tudo garantido", () => {
    const r = resumoDaBase({ order_number: "EC-2026-0007", lines: [
      linha({ quote_line_id: "a", qty_reserved: 2 }),
      linha({ quote_line_id: "b", product_name: "Torneira", qty_ordered: 1, qty_missing: 1, qty_needed: 1, purchase_order_id: "po-1" }),
      linha({ quote_line_id: "c", item_type: "service", product_name: null }),
    ] }, [{ id: "po-1", order_number: "PO-2026-0031", status: "pending", expected_delivery: "2026-11-05T00:00:00Z", fornecedor: "Beta" }]);
    expect(r.id).toBe("EC-2026-0007");
    expect(r.linhas.map((l) => [l.n, l.st])).toEqual([["Base de duche", "ready"], ["Torneira", "waitpo"]]);
    // 30/10: com o id da base (uuid), por onde Compras e armazém a aprova
    expect(r.linhas[1].pos).toEqual([{ id: "PO-2026-0031", uuid: "po-1", forn: "Beta", estado: "pending", fase: "por aprovar", prometida: null, prevista: "2026-11-05" }]);
    expect(r.tot).toMatchObject({ linhas: 2, prontas: 1, aFornecedor: 1, semForn: 0 });
    expect(r.estado).toBe("waiting");
    expect(r.pronta).toBe(false);
    expect(estadoLinhaNegocio(r.linhas[1]).t).toBe("encomenda a fornecedor por aprovar");
  });

  it("o resumo do negócio passa a ser o da base; sem ele, o do Inventário do browser", () => {
    const r = resumoDaBase({ order_number: "EC-1", lines: [linha({ qty_served: 2 })] }, []);
    definirEncomendasReais(new Map([["CT 2026/1001", r]]));
    const db = { ecs: [] } as never;
    expect(resumoEcNegocio(db, "CT 2026/1001")).toBe(r);
    expect(resumoEcNegocio(db, "CT 2026/1002")).toBeNull();
    definirEncomendasReais(null);
    expect(resumoEcNegocio(db, "CT 2026/1001")).toBeNull();
  });
});

describe("lerEncomendaReal", () => {
  it("lê o documento do contrato e as encomendas a fornecedor dele, na organização", async () => {
    const filtros: [string, unknown][] = [];
    const q = { eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; }, is: async () => ({ data: [{ id: "po-1", order_number: "PO-1", status: "ordered", expected_delivery: null, suppliers: { name: "Beta" } }], error: null }) };
    const sb = {
      rpc: vi.fn(async () => ({ data: { order_number: "EC-9", lines: [linha({ qty_ordered: 2, purchase_order_id: "po-1" })] }, error: null })),
      from: vi.fn(() => ({ select: () => q })),
    };
    const r = await lerEncomendaReal(sb as never, "org-1", "ct-1");
    expect(sb.rpc).toHaveBeenCalledWith("rpc_get_client_order_document", { p_contract_id: "ct-1" });
    expect(filtros).toEqual([["organization_id", "org-1"], ["source_type", "contract"], ["source_id", "ct-1"]]);
    expect(r.linhas[0].pos[0]).toMatchObject({ id: "PO-1", forn: "Beta", fase: "no portal" });
  });

  // 30/10 (20270101360000): Compras e armazém só com o papel do RH não lê purchase_orders pelo RLS: lê-se pela base
  it("as encomendas a fornecedor vêm da base (neg_ler_encomendas_fornecedor), com o id para as aprovar; a tabela não se lê", async () => {
    const sb = {
      rpc: vi.fn(async (fn: string) => fn === "neg_ler_encomendas_fornecedor"
        ? { data: [{ id: "po-7", order_number: "PO-7", status: "pending", expected_delivery: null, fornecedor: "Gama" }], error: null }
        : { data: { order_number: "EC-9", lines: [linha({ qty_ordered: 2, purchase_order_id: "po-7" })] }, error: null }),
      from: vi.fn(() => { throw new Error("não devia ler a tabela"); }),
    };
    const r = await lerEncomendaReal(sb as never, "org-1", "ct-1");
    expect(sb.rpc).toHaveBeenCalledWith("neg_ler_encomendas_fornecedor", { p_org: "org-1", p_contrato: "ct-1" });
    expect(r.pos).toEqual([{ id: "PO-7", uuid: "po-7", forn: "Gama", estado: "pending", fase: "por aprovar", prometida: null, prevista: "" }]);
  });
});
