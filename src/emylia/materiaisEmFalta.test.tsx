// 19/11 (auditoria, lote 2, ponto 1): os materiais sem fornecedor preferido (ou com a unidade do fornecedor incompatível) já não
// prendem a obra com uma mensagem que engana. O mesmo critério do pedido ao fornecedor na encomenda real, na prontidão e no passo
// Materiais da obra, que tem o botão «Pedir o que falta ao fornecedor» (a RPC do Inventário) para quem tem a permissão.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { seed, type Estado, type Negocio, TECS } from "./motor";
import { FINANCEIRO, emFalta } from "./campos";
import { esquecerInventario } from "./inventario/loja";
import { linhasDaObra } from "./encomendasAjuste";
import { MateriaisObra } from "./MateriaisObra";
import { definirPermissoesReais, podePedirFalta } from "./permissoes";
import { Montar } from "./v2/testeV2";
import { definirEncomendasReais, definirPedidorFalta, estadoDaLinha, pedirFaltaReal, resumoDaBase, textoPedido, type LinhaDocEc } from "./real/encomendaReal";
import { estadoLinhaNegocio, faltaMateriais } from "./inventario/ponteNegocios";
import { faltaMateriaisReal, limparProntidoes, prontidaoDe } from "./inventario/prontidaoReal";
import { lerProntidoes } from "./real/inventarioReal";

const linha = (o: Partial<LinhaDocEc>): LinhaDocEc => ({
  quote_line_id: "ql", item_type: "product", product_id: "p", product_name: "Revestimento", product_sku: "RV", quantity: 2, unidade: "m2", line_status: null,
  purchase_order_id: null, qty_needed: 2, qty_reserved: 0, qty_ordered: 0, qty_received: 0, qty_missing: 0, qty_served: 0, has_preferred_supplier: true, ...o,
});

afterEach(() => { cleanup(); definirEncomendasReais(null); definirPedidorFalta(null); definirPermissoesReais(null); limparProntidoes(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

describe("a encomenda real: a causa de cada linha presa", () => {
  it("unidade do fornecedor incompatível: presa (com fornecedor preferido), com a causa; o que se pode pedir fica em «pedir»", () => {
    const presa = linha({ quote_line_id: "a", qty_missing: 3, request_block_reason: "incompatible_supplier_uom" });
    expect(estadoDaLinha(presa)).toBe("nosup");
    const r = resumoDaBase({ order_number: "EC-1", lines: [
      presa,
      linha({ quote_line_id: "b", product_name: "Cola", qty_missing: 2, request_block_reason: "no_preferred_supplier", has_preferred_supplier: false }),
      linha({ quote_line_id: "c", product_name: "Base de duche", qty_missing: 1.5, request_block_reason: null }),
    ] }, []);
    expect(r.linhas.map((l) => [l.n, l.st, l.causa ?? null, l.pedir ?? 0])).toEqual([
      ["Revestimento", "nosup", "incompatible_supplier_uom", 0],
      ["Cola", "nosup", "no_preferred_supplier", 0],
      ["Base de duche", "missing", null, 1.5],
    ]);
    // a obra diz o que fazer a cada uma, e onde (o Catálogo); o que se pode pedir, com o botão novo
    expect(faltaMateriais(r)).toEqual([
      "escolher o fornecedor preferido de 1 material no Catálogo",
      "corrigir a unidade do fornecedor de 1 material no Catálogo (é incompatível com a do produto)",
      "pedir ao fornecedor ou reservar no armazém o que falta de 1 material («Pedir o que falta ao fornecedor»)",
    ]);
    expect(estadoLinhaNegocio(r.linhas[0]).t).toBe("sem fornecedor");
  });

  it("a base sem a migration (sem request_block_reason): como antes, pelo has_preferred_supplier", () => {
    expect(estadoDaLinha(linha({ qty_missing: 2, has_preferred_supplier: false }))).toBe("nosup");
    expect(estadoDaLinha(linha({ qty_missing: 2 }))).toBe("missing");
    const r = resumoDaBase({ order_number: "EC-1", lines: [linha({ qty_missing: 2 })] }, []);
    expect(r.linhas[0].pedir).toBe(2);
  });
});

describe("a prontidão com as causas (rpc_client_order_missing_causes)", () => {
  it("só manda pedir o que se pode pedir; o resto diz porquê e onde se resolve", async () => {
    const rpc = vi.fn(async (fn: string) => fn === "rpc_client_order_list_readiness"
      ? { data: [{ contract_id: "c-1", lines_ready: 0, units_in_stock_reserved: 0, units_on_po: 0, units_missing: 5, units_served: 0, units_needed: 5 }], error: null }
      : { data: [{ contract_id: "c-1", units_missing: 5, units_requestable: 2, lines_no_supplier: 1, lines_incompatible_uom: 1 }], error: null });
    await lerProntidoes({ rpc } as unknown as SupabaseClient, "org", ["c-1"]);
    expect(rpc).toHaveBeenCalledWith("rpc_client_order_missing_causes", { p_organization_id: "org", p_contract_ids: ["c-1"] });
    const p = prontidaoDe("c-1")!;
    expect(p).toMatchObject({ emFalta: 5, aPedir: 2, semFornecedor: 1, unidadeIncompativel: 1 });
    expect(faltaMateriaisReal(p)).toEqual([
      "encomendar ao fornecedor 2 unidades («Pedir o que falta ao fornecedor»)",
      "escolher o fornecedor preferido de 1 material no Catálogo (sem ele, o que falta não se pode pedir)",
      "corrigir a unidade do fornecedor de 1 material no Catálogo (é incompatível com a do produto)",
    ]);
  });

  it("tudo preso: não manda «Pedir o que falta»", async () => {
    const rpc = vi.fn(async (fn: string) => fn === "rpc_client_order_list_readiness"
      ? { data: [{ contract_id: "c-2", units_missing: 3, units_needed: 3 }], error: null }
      : { data: [{ contract_id: "c-2", units_missing: 3, units_requestable: 0, lines_no_supplier: 2, lines_incompatible_uom: 0 }], error: null });
    await lerProntidoes({ rpc } as unknown as SupabaseClient, "org", ["c-2"]);
    const F = faltaMateriaisReal(prontidaoDe("c-2"));
    expect(F.join(" ")).not.toMatch(/Pedir o que falta/);
    expect(F).toEqual(["escolher o fornecedor preferido de 2 materiais no Catálogo (sem ele, o que falta não se pode pedir)"]);
  });

  it("sem a função na base (erro), fica a prontidão de antes", async () => {
    const rpc = vi.fn(async (fn: string) => fn === "rpc_client_order_list_readiness"
      ? { data: [{ contract_id: "c-3", units_missing: 1, units_needed: 1 }], error: null }
      : { data: null, error: { code: "PGRST202", message: "não existe" } });
    await lerProntidoes({ rpc } as unknown as SupabaseClient, "org", ["c-3"]);
    expect(prontidaoDe("c-3")?.aPedir).toBeUndefined();
    expect(faltaMateriaisReal(prontidaoDe("c-3"))[0]).toBe("encomendar ao fornecedor 1 unidade («Pedir o que falta ao fornecedor», nas Encomendas de cliente)");
  });
});

describe("pedir o que falta ao fornecedor", () => {
  it("chama a RPC do Inventário e diz o resultado em palavras", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true, purchase_orders_created: 1, items_created: 2, skipped_no_supplier: 1, skipped_other: 1, errors: 0 }, error: null });
    const r = await pedirFaltaReal({ rpc } as unknown as SupabaseClient, "c-1");
    expect(rpc).toHaveBeenCalledWith("rpc_request_missing_from_supplier", { p_contract_id: "c-1" });
    expect(textoPedido(r)).toEqual({ msg: "Pedido ao fornecedor", kind: "ok",
      sub: "2 materiais pedidos em 1 encomenda nova, por aprovar nas Compras. Ficaram de fora: 1 material sem fornecedor preferido, 1 material com a unidade do fornecedor incompatível." });
    expect(textoPedido({ criadas: 0, linhas: 0, semFornecedor: 2, outras: 0, erros: 0 }).kind).toBe("bad");
  });
  it("a mensagem de erro da base volta tal como vem", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Sem permissão para pedir material ao fornecedor. Falta: Criar encomendas" } });
    await expect(pedirFaltaReal({ rpc } as unknown as SupabaseClient, "c-1")).rejects.toThrow(/Sem permissão para pedir material/);
  });
  it("quem pode: com conta real, purchase_orders.create E client_orders.view; sem conta real, Compras e armazém", () => {
    expect(podePedirFalta("armazem", false)).toBe(true);
    expect(podePedirFalta("comercial", false)).toBe(false);
    definirPermissoesReais({ codigos: new Set(["purchase_orders.create", "client_orders.view"]), simular: false });
    expect(podePedirFalta("comercial", false)).toBe(true);
    definirPermissoesReais({ codigos: new Set(["client_orders.view"]), simular: false });
    expect(podePedirFalta("armazem", false)).toBe(false);
  });
});

/** 1027 pago, plano aprovado: a encomenda de cliente emitida; a da base passa a ser a deste teste (resumoDaBase). */
function obraComEncomendaReal(linhas: (nomes: string[]) => LinhaDocEc[]) {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  for (let i = 0; i < 5; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  let A!: Parameters<Parameters<typeof Montar>[0]["children"]>[0]["A"];
  render(<Montar S={S}>{(ctx) => { A = ctx.A; return null; }}</Montar>);
  cleanup();
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id); A.role("operacoes");
  // lote 2 (obra): aceitar as medidas pede quem mede escolhido
  A.supervisorMedidas(d.id, TECS[0].id); (A.retificarMedidas(d.id), A.aprovarPlano(d.id));
  const ec = d.obra.ec!;
  expect(ec.ref).toBeTruthy();
  ec.contrato = "c-1027";
  const nomes = linhasDaObra(d).map((y) => y.x.n);
  definirEncomendasReais(new Map([[ec.ref!, resumoDaBase({ order_number: ec.n, lines: linhas(nomes) }, [])]]));
  return { S, d };
}

describe("o passo Materiais da obra", () => {
  it("cada linha presa diz a causa; o botão «Pedir o que falta ao fornecedor» chama quem pede com o contrato", async () => {
    const { S, d } = obraComEncomendaReal((n) => [
      linha({ quote_line_id: "a", product_name: n[0], qty_missing: 2, request_block_reason: "no_preferred_supplier", has_preferred_supplier: false }),
      linha({ quote_line_id: "b", product_name: n[1], qty_missing: 1, request_block_reason: "incompatible_supplier_uom" }),
      linha({ quote_line_id: "c", product_name: n[2], qty_missing: 4, request_block_reason: null }),
    ]);
    const pedir = vi.fn().mockResolvedValue(undefined);
    definirPedidorFalta(pedir);
    definirPermissoesReais({ codigos: new Set(["purchase_orders.create", "client_orders.view"]), simular: false });
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    expect(screen.getByText("sem fornecedor preferido: escolha um no Catálogo")).toBeTruthy();
    expect(screen.getByText("unidade do fornecedor incompatível")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pedir o que falta ao fornecedor" }));
    await waitFor(() => expect(pedir).toHaveBeenCalledWith("c-1027"));
  });

  it("sem nada que se possa pedir, não há botão: a linha presa diz onde se resolve", () => {
    const { S, d } = obraComEncomendaReal((n) => [
      linha({ quote_line_id: "a", product_name: n[0], qty_missing: 2, request_block_reason: "no_preferred_supplier", has_preferred_supplier: false }),
    ]);
    definirPedidorFalta(vi.fn());
    definirPermissoesReais({ codigos: new Set(["purchase_orders.create", "client_orders.view"]), simular: false });
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    expect(screen.queryByRole("button", { name: "Pedir o que falta ao fornecedor" })).toBeNull();
    expect(screen.getByText(/escolher o fornecedor preferido de 1 material no Catálogo/i)).toBeTruthy();
  });

  it("sem purchase_orders.create, não há botão", () => {
    const { S, d } = obraComEncomendaReal((n) => [linha({ quote_line_id: "c", product_name: n[0], qty_missing: 4, request_block_reason: null })]);
    definirPedidorFalta(vi.fn());
    definirPermissoesReais({ codigos: new Set(["client_orders.view"]), simular: false });
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    expect(screen.queryByRole("button", { name: "Pedir o que falta ao fornecedor" })).toBeNull();
  });
});
