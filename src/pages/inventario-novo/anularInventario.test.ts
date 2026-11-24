// O Anular / Refazer do novo Inventário: o que se oferece para cada movimento da sessão, sempre pelas reversões que já existem.
import { describe, expect, it, vi } from "vitest";
import type { ClientOrderDocumentLine } from "@/components/client-orders/clientOrderExit";
import {
  NAO_SE_ANULA,
  oQueAnular,
  oQueRefazer,
  parcelasDaSaida,
  passosDoLivro,
  reverterSaida,
  teclaAnular,
  tipoDoMovimento,
  type MovimentoLivro,
} from "./anularInventario";

const mov = (x: Partial<MovimentoLivro> = {}): MovimentoLivro => ({
  id: "m-1",
  movement_type: "entrada",
  document_type: "compra",
  document_number: "PO-2026-0007",
  quantity: 6,
  product_id: "p-1",
  produto: "Torneira",
  warehouse_id: "w-1",
  armazem: "Central",
  reference_id: "poi-1",
  sale_source_type: null,
  sale_source_id: null,
  reversal_of_movement_id: null,
  created_at: "2026-11-24T10:00:00Z",
  rececao: { purchase_order_id: "po-7", purchase_order_item_id: "poi-1" },
  anulado: false,
  ...x,
});

const compra = () => mov();
const venda = (x: Partial<MovimentoLivro> = {}) => mov({
  id: "m-2", movement_type: "saida", document_type: "venda", document_number: "EC-2026-0003",
  reference_id: null, sale_source_type: "contract", sale_source_id: "ct-3", rececao: null, quantity: 2, ...x,
});
const ajuste = () => mov({ id: "m-3", movement_type: "ajuste_negativo", document_type: "ajuste", rececao: null, reference_id: null });

const linhaEc = (x: Partial<ClientOrderDocumentLine> = {}): ClientOrderDocumentLine => ({
  quote_line_id: "ql-1", item_type: "product", product_id: "p-1", product_name: "Torneira", product_sku: null,
  service_id: null, service_name: null, service_sku: null, quantity: 2, line_status: "servido_por_stock",
  stock_movement_id: null, purchase_order_id: null, purchase_order_number: null, available_warehouses: null,
  stock_exit_movement_id: "m-2", qty_served: 2, ...x,
});

describe("oQueAnular", () => {
  it("compra (receção de PO) → deep link para o «Reverter receção» das Encomendas, com a linha (item)", () => {
    expect(tipoDoMovimento(compra())).toBe("rececao");
    expect(oQueAnular(compra(), { podeReverterSaida: true })).toEqual({ tipo: "link", to: "/inventory/novo/encomendas?open=po-7&item=poi-1" });
    // sem a linha, só a PO
    expect(oQueAnular(mov({ rececao: { purchase_order_id: "po-7", purchase_order_item_id: null } }), { podeReverterSaida: true }))
      .toEqual({ tipo: "link", to: "/inventory/novo/encomendas?open=po-7" });
  });

  it("venda reversível (isStockExitRevertible) com a permissão → reverter aqui, depois de confirmar", () => {
    const o = oQueAnular(venda(), { podeReverterSaida: true, linhasEc: [linhaEc()] });
    expect(o).toEqual({ tipo: "reverter", contractId: "ct-3", movementId: "m-2", pergunta: "Reverter a saída de Torneira?", irmas: ["m-2"] });
  });

  it("saída repartida (parcelas irmãs no livro) → «Reverter toda a saída (N parcelas)», com todas as irmãs", () => {
    const irma = venda({ id: "m-2b", warehouse_id: "w-2", quantity: 1 });
    const movs = [
      venda(), irma,
      venda({ id: "m-2c", anulado: true }), // já estornada: não conta
      venda({ id: "m-x", product_id: "p-9" }), // outro produto
      venda({ id: "m-y", document_number: "EC-2026-0099" }), // outra saída
    ];
    expect(parcelasDaSaida(venda(), movs).map((m) => m.id)).toEqual(["m-2", "m-2b"]);
    const o = oQueAnular(venda(), { podeReverterSaida: true, linhasEc: [linhaEc()], movimentos: movs });
    expect(o).toEqual({ tipo: "reverter", contractId: "ct-3", movementId: "m-2", pergunta: "Reverter toda a saída de Torneira (2 parcelas)?", irmas: ["m-2", "m-2b"] });
  });

  it("venda reversível chama rpc_revert_client_order_stock_exit com os mesmos parâmetros do ClientOrders.tsx", async () => {
    const o = oQueAnular(venda(), { podeReverterSaida: true, linhasEc: [linhaEc()] });
    if (o.tipo !== "reverter") throw new Error("devia reverter");
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    await reverterSaida({ rpc }, o.contractId, o.movementId);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rpc_revert_client_order_stock_exit", { p_contract_id: "ct-3", p_movement_id: "m-2" });
  });

  it("o erro da RPC sobe (o diálogo mostra-o)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Sem permissão" } });
    await expect(reverterSaida({ rpc }, "ct-3", "m-2")).rejects.toEqual({ message: "Sem permissão" });
  });

  it("venda não reversível → só o deep link para a EC nas Saídas (nunca a RPC)", () => {
    const link = { tipo: "link", to: "/inventory/novo/saidas?open=ct-3" };
    // a linha não é reversível (parcial sem nada servido)
    expect(oQueAnular(venda(), { podeReverterSaida: true, linhasEc: [linhaEc({ line_status: "parcial", qty_served: 0 })] })).toEqual(link);
    // nenhuma linha com este movimento (ex.: saída repartida, outro movimento)
    expect(oQueAnular(venda(), { podeReverterSaida: true, linhasEc: [linhaEc({ stock_exit_movement_id: "outro" })] })).toEqual(link);
    // não se conseguiu ler a EC
    expect(oQueAnular(venda(), { podeReverterSaida: true, linhasEc: null })).toEqual(link);
    // sem a permissão do ecrã (confirmExitGate)
    expect(oQueAnular(venda(), { podeReverterSaida: false, linhasEc: [linhaEc()] })).toEqual(link);
    // já revertida
    expect(oQueAnular(venda({ anulado: true }), { podeReverterSaida: true, linhasEc: [linhaEc()] })).toEqual(link);
  });

  it("ajuste → «não se anula aqui», sem ação", () => {
    const o = oQueAnular(ajuste(), { podeReverterSaida: true });
    expect(o.tipo).toBe("nao");
    if (o.tipo === "nao") expect(o.porque).toMatch(/^Não se anula aqui/);
    expect(oQueRefazer(ajuste())).toBeNull();
    expect(oQueAnular(mov({ movement_type: "devolucao_fornecedor", rececao: null }), { podeReverterSaida: true })).toEqual({ tipo: "nao", porque: NAO_SE_ANULA });
    // uma entrada «compra» manual (sem receção de PO) também não
    expect(tipoDoMovimento(mov({ rececao: null }))).toBe("outro");
  });
});

describe("oQueRefazer", () => {
  it("nunca corre sozinho: reabre a ação clássica", () => {
    expect(oQueRefazer(compra())).toEqual({ to: "/inventory/novo/rececao?po=po-7" });
    expect(oQueRefazer(venda())).toEqual({ to: "/inventory/novo/saidas?open=ct-3" });
  });
});

describe("passosDoLivro", () => {
  const sim = { allowed: true };
  it("feitos primeiro (do mais antigo), anulados depois (o mais recente primeiro); os estornos e os «outro» não são passos", () => {
    const movs = [
      venda({ id: "v", created_at: "2026-11-24T10:05:00Z" }),
      compra(),
      ajuste(),
      mov({ id: "c2", created_at: "2026-11-24T10:01:00Z", anulado: true }),
      mov({ id: "est", movement_type: "ajuste_negativo", reversal_of_movement_id: "c2", created_at: "2026-11-24T10:06:00Z", rececao: null }),
    ];
    const { L, pos, foraDaPilha } = passosDoLivro(movs, { rececao: sim, saida: sim });
    expect(L.map((p) => p.mov.id)).toEqual(["m-1", "v", "c2"]);
    expect(pos).toBe(2);
    expect(L.map((p) => p.pode)).toEqual([true, true, true]);
    expect(foraDaPilha).toBe(1); // o ajuste
    expect(new Set(L.map((p) => p.n)).size).toBe(3);
  });
  it("uma saída seguida de um ajuste: o ajuste não tranca a pilha, o Anular desfaz a saída", () => {
    const movs = [venda({ created_at: "2026-11-24T10:05:00Z" }), mov({ id: "aj", movement_type: "ajuste_positivo", document_type: "ajuste", rececao: null, created_at: "2026-11-24T10:06:00Z" })];
    const { L, pos, foraDaPilha } = passosDoLivro(movs, { rececao: sim, saida: sim });
    expect(L[pos - 1]).toMatchObject({ pode: true, mov: { id: "m-2" } });
    expect(foraDaPilha).toBe(1);
  });
  it("sem a permissão da reversão, o passo não se anula e diz porquê", () => {
    const { L } = passosDoLivro([compra()], { rececao: { allowed: false, reason: "Sem permissão: falta X." }, saida: sim });
    expect(L[0]).toMatchObject({ pode: false, porque: "Sem permissão: falta X." });
  });
});

describe("teclaAnular", () => {
  const ev = (x: Partial<KeyboardEvent> & { target?: unknown }) =>
    ({ key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, target: document.body, ...x }) as KeyboardEvent;
  it("Ctrl+Z anula; Ctrl+Shift+Z e Ctrl+Y refazem; ⌘ também", () => {
    expect(teclaAnular(ev({}))).toBe("anular");
    expect(teclaAnular(ev({ key: "Z", shiftKey: true }))).toBe("refazer");
    expect(teclaAnular(ev({ key: "y" }))).toBe("refazer");
    expect(teclaAnular(ev({ ctrlKey: false, metaKey: true }))).toBe("anular");
    expect(teclaAnular(ev({ ctrlKey: false }))).toBeNull();
    expect(teclaAnular(ev({ altKey: true }))).toBeNull();
    expect(teclaAnular(ev({ key: "x" }))).toBeNull();
  });
  it("numa caixa de texto não faz nada", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    document.body.append(input, area);
    expect(teclaAnular(ev({ target: input }))).toBeNull();
    expect(teclaAnular(ev({ target: area, key: "y" }))).toBeNull();
    input.remove(); area.remove();
  });
  it("com uma folha ou diálogo aberto não faz nada", () => {
    const d = document.createElement("div");
    d.setAttribute("role", "dialog");
    d.setAttribute("data-state", "open");
    document.body.append(d);
    expect(teclaAnular(ev({}))).toBeNull();
    d.setAttribute("data-state", "closed");
    expect(teclaAnular(ev({}))).toBe("anular");
    d.remove();
  });
});
