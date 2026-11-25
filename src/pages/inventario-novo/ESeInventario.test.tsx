// O "E se…?" do novo Inventário: mostra o antes e o depois, e só lê (nenhuma RPC de escrita, nenhum insert/update/delete).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReceivablePo } from "@/components/receiving/porReceber";
import type { ClientOrderDocumentLine } from "@/components/client-orders/clientOrderExit";

// O falso Supabase: cada tabela devolve o que o teste pôs; os métodos de escrita existem para se provar que nunca se chamam.
const tabelas: Record<string, unknown[]> = {};
const escritas: string[] = [];
const rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};
const rpc = vi.fn(async (nome: string, args: Record<string, unknown>) => {
  const f = rpcs[nome];
  return f ? { data: f(args), error: null } : { data: null, error: { message: `rpc ${nome} não esperada` } };
});
vi.mock("@/integrations/supabase/client", () => {
  const from = (t: string) => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit", "in", "gte", "range"]) chain[k] = () => chain;
    for (const k of ["insert", "update", "delete", "upsert"]) chain[k] = () => { escritas.push(`${t}.${k}`); return chain; };
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tabelas[t] ?? [], error: null }).then(ok);
    return chain;
  };
  return { supabase: { from, rpc: (n: string, a: Record<string, unknown>) => rpc(n, a) } };
});

import { ESeInventario, contasRececao, contasSaida } from "./ESeInventario";

const po = (x: Partial<ReceivablePo> = {}): ReceivablePo => ({
  id: "po-7", orderNumber: "PO-2026-0007", status: "ordered", supplierId: "s-1", supplierName: "Roca",
  expectedDelivery: "2026-11-20", orderDate: "2026-11-10", contractId: "ct-1",
  origin: { originType: "contract", number: "EC-2026-0003", clientName: "Ana Silva" }, publication: null, emailSent: true,
  lines: [
    { id: "poi-1", productId: "p-1", name: "Torneira", sku: null, quantity: 4, received: 0, open: 4, uomId: null, uomCode: "un", unitsPerUom: 1 },
    { id: "poi-2", productId: "p-2", name: "Azulejo", sku: null, quantity: 2, received: 2, open: 0, uomId: null, uomCode: "cx", unitsPerUom: 10 },
    { id: "poi-3", productId: "p-3", name: "Sifão", sku: null, quantity: 3, received: 1, open: 2, uomId: null, uomCode: "cx", unitsPerUom: 5 },
  ],
  ...x,
});

const ESCRITA = /confirm|revert|receive|release|update|insert|delete|create|save|cancel|request/i;

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  for (const k of Object.keys(rpcs)) delete rpcs[k];
  escritas.length = 0;
  rpc.mockClear();
});
afterEach(cleanup);

describe("contasRececao", () => {
  it("só as linhas em falta; depois = agora + o que vai para stock; o que vai para a EC fica reservado", () => {
    const L = contasRececao(po(), new Map([["p-1", 3], ["p-3", 0]]), new Map([
      ["poi-1", { purchase_order_item_id: "poi-1", units_to_order: 4, units_to_stock: 0, contract_order_number: "EC-2026-0003" }],
      ["poi-3", { purchase_order_item_id: "poi-3", units_to_order: 2, units_to_stock: 8 }],
    ]));
    expect(L).toEqual([
      { id: "poi-1", nome: "Torneira", entra: 4, agora: 3, depois: 3, paraEc: 4, ec: "EC-2026-0003" },
      { id: "poi-3", nome: "Sifão", entra: 10, agora: 0, depois: 8, paraEc: 2, ec: "EC-2026-0003" },
    ]);
  });
  it("PO para stock: tudo entra no stock; PO de cliente sem a repartição: não se adivinha o depois", () => {
    expect(contasRececao(po({ contractId: null, origin: null }), new Map([["p-1", 3]]), null)[0]).toMatchObject({ agora: 3, depois: 7, paraEc: 0 });
    expect(contasRececao(po(), new Map([["p-1", 3]]), null)[0]).toMatchObject({ agora: 3, depois: null });
  });
});

describe("contasSaida", () => {
  const l = (x: Partial<ClientOrderDocumentLine>): ClientOrderDocumentLine => ({
    quote_line_id: "q", item_type: "product", product_id: "p-1", product_name: "Torneira", product_sku: null, service_id: null,
    service_name: null, service_sku: null, quantity: 3, line_status: "stock_disponivel_confirmar", stock_movement_id: null,
    purchase_order_id: null, purchase_order_number: null, available_warehouses: null, ...x,
  });
  it("de que armazém sai cada produto e o stock que fica; o que falta fica à espera", () => {
    const r = contasSaida([
      l({ qty_reserved: 3, suggested_warehouse_id: "w-2", available_warehouses: [
        { warehouse_id: "w-1", warehouse_name: "Central", quantity: 3, physical_quantity: 9 },
        { warehouse_id: "w-2", warehouse_name: "Porto", quantity: 3, physical_quantity: 5 },
      ] }),
      l({ quote_line_id: "q2", product_id: "p-2", product_name: "Sifão", qty_reserved: 2, available_warehouses: [{ warehouse_id: "w-1", warehouse_name: "Central", quantity: 1, physical_quantity: 1 }] }),
      l({ quote_line_id: "q3", product_id: "p-3", product_name: "Base de duche", line_status: "a_aguardar_encomenda" }),
    ], () => true);
    expect(r.produtos).toEqual([
      { productId: "p-1", nome: "Torneira", quantidade: 3, de: [{ armazem: "Porto", sai: 3, agora: 5, depois: 2 }] },
      { productId: "p-2", nome: "Sifão", quantidade: 2, de: null, porque: "Nenhum armazém cobre 2: fica pendente." },
    ]);
    expect(r.aEspera).toEqual(["Base de duche"]);
  });
});

describe("<ESeInventario> receção", () => {
  it("mostra o stock antes e depois e o que fica reservado para a EC, e só lê", async () => {
    tabelas.stocks = [{ product_id: "p-1", quantity: 2 }, { product_id: "p-1", quantity: 1 }, { product_id: "p-3", quantity: 4 }];
    rpcs.rpc_preview_po_receipt = () => ({ lines: [
      { purchase_order_item_id: "poi-1", units_to_order: 1, units_to_stock: 3, contract_order_number: "EC-2026-0003" },
      { purchase_order_item_id: "poi-3", units_to_order: 0, units_to_stock: 10 },
    ] });
    const ir = vi.fn();
    montar(<ESeInventario acao={{ tipo: "receber", po: po(), to: "/inventory/novo/rececao?po=po-7" }} orgId="org-1" podePrever bloqueio={null} ir={ir} />);
    const l1 = await screen.findByTestId("e-se-linha-poi-1");
    await within(l1).findByText(/reservadas/);
    expect(l1).toHaveTextContent("Torneira: stock 3 → 6 · 1 reservadas para EC-2026-0003");
    expect(screen.getByTestId("e-se-linha-poi-3")).toHaveTextContent("Sifão: stock 4 → 14");
    expect(screen.queryByTestId("e-se-linha-poi-2")).toBeNull(); // nada em falta
    // os parâmetros do PoReceivePanel (o que falta, na unidade da linha)
    expect(rpc).toHaveBeenCalledWith("rpc_preview_po_receipt", {
      p_purchase_order_id: "po-7",
      p_lines: [{ purchase_order_item_id: "poi-1", quantity: 4 }, { purchase_order_item_id: "poi-3", quantity: 2 }],
      p_warehouse_id: undefined,
    });
    expect(rpc.mock.calls.map((c) => c[0]).filter((n) => ESCRITA.test(n))).toEqual([]);
    expect(escritas).toEqual([]);
    // o botão só navega para o ecrã clássico
    fireEvent.click(screen.getByRole("button", { name: "Receber PO-2026-0007" }));
    expect(ir).toHaveBeenCalledWith("/inventory/novo/rececao?po=po-7");
    expect(escritas).toEqual([]);
  });

  it("sem as permissões de receção não pede a repartição (a RPC exige-as)", async () => {
    tabelas.stocks = [{ product_id: "p-1", quantity: 2 }];
    montar(<ESeInventario acao={{ tipo: "receber", po: po(), to: "/x" }} orgId="org-1" podePrever={false} bloqueio="Sem permissão: falta Receber." ir={vi.fn()} />);
    expect(await screen.findByText(/A repartição entre a EC e o stock vê-se na Receção/)).toBeInTheDocument();
    expect(await screen.findByTestId("e-se-linha-poi-1")).toHaveTextContent("Torneira: entra 4");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("<ESeInventario> saída", () => {
  it("mostra de que armazém sai e o stock que fica, e só lê", async () => {
    rpcs.rpc_client_order_list_readiness = () => [{ contract_id: "ct-1", is_ready: true }, { contract_id: "ct-2", is_ready: false }];
    rpcs.rpc_get_client_order_document = () => ({
      order_number: "EC-2026-0003", client_name: "Ana Silva",
      lines: [{
        quote_line_id: "q", item_type: "product", product_id: "p-1", product_name: "Torneira", product_sku: null, service_id: null,
        service_name: null, service_sku: null, quantity: 3, line_status: "stock_disponivel_confirmar", stock_movement_id: null,
        purchase_order_id: null, purchase_order_number: null, qty_reserved: 3,
        available_warehouses: [{ warehouse_id: "w-1", warehouse_name: "Central", quantity: 3, physical_quantity: 7 }],
      }],
    });
    const ir = vi.fn();
    montar(<ESeInventario acao={{ tipo: "saida", to: "/inventory/novo/saidas?ready=1" }} orgId="org-1" podePrever bloqueio={null} ir={ir} />);
    expect(await screen.findByTestId("e-se-produto-p-1")).toHaveTextContent("3 Torneira sai de Central: 3 · stock 7 → 4");
    expect(screen.getByText(/EC-2026-0003 · Ana Silva/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("rpc_get_client_order_document", { p_contract_id: "ct-1" });
    expect(rpc.mock.calls.map((c) => c[0]).filter((n) => ESCRITA.test(n))).toEqual([]);
    expect(escritas).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Abrir EC-2026-0003" }));
    expect(ir).toHaveBeenCalledWith("/inventory/novo/saidas?open=ct-1");
  });
});
