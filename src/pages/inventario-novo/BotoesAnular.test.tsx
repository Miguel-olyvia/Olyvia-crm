// O ↶ Anular / ↷ Refazer do cabeçalho do novo Inventário: permissões, atalhos e o que cada passo faz.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MovimentoLivro } from "./anularInventario";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
let perms = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => perms.has(p)),
    loading: false,
  }),
}));

import { BotoesAnular, PERMISSOES_REVERTER_RECECAO, PERMISSOES_REVERTER_SAIDA } from "./BotoesAnular";

const mov = (x: Partial<MovimentoLivro> = {}): MovimentoLivro => ({
  id: "m-1", movement_type: "entrada", document_type: "compra", document_number: "PO-2026-0007", quantity: 6,
  product_id: "p-1", produto: "Torneira", warehouse_id: "w-1", armazem: "Central", reference_id: "poi-1",
  sale_source_type: null, sale_source_id: null, reversal_of_movement_id: null, created_at: "2026-11-24T10:00:00Z",
  rececao: { purchase_order_id: "po-7", purchase_order_item_id: "poi-1" }, anulado: false, ...x,
});
const venda = () => mov({ id: "m-2", movement_type: "saida", document_type: "venda", document_number: "EC-2026-0003", quantity: 2,
  reference_id: null, sale_source_type: "contract", sale_source_id: "ct-3", rececao: null, created_at: "2026-11-24T10:05:00Z" });

function Onde() {
  const l = useLocation();
  return <p data-testid="onde">{l.pathname + l.search}</p>;
}
function montar(movimentos: MovimentoLivro[], extra?: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const recarregar = vi.fn();
  const arvore = (movs: MovimentoLivro[]) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/inventory/novo/hoje"]}>
        <Routes><Route path="*" element={<><BotoesAnular orgId="org-1" movimentos={movs} recarregar={recarregar} />{extra}<Onde /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(arvore(movimentos));
  return { recarregar, reler: (movs: MovimentoLivro[]) => r.rerender(arvore(movs)) };
}
const docEc = (ids: string[] = ["m-2"]) => ({
  data: { lines: ids.map((id) => ({ quote_line_id: "q", item_type: "product", product_id: "p-1", product_name: "Torneira", line_status: "servido_por_stock", stock_exit_movement_id: id, qty_served: 2, quantity: 2 })) },
  error: null,
});
const botaoAnular = () => screen.getByRole("button", { name: /^(Anular|Não se anula|Nada para anular)/ });
const ctrlZ = (alvo: Element | Window = window, x: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(alvo, { key: "z", ctrlKey: true, ...x });

beforeEach(() => { perms = new Set([...PERMISSOES_REVERTER_RECECAO, ...PERMISSOES_REVERTER_SAIDA, "purchase_orders.view"]); rpc.mockReset(); });
afterEach(cleanup);

describe("<BotoesAnular>", () => {
  it("sem permissão, fica desligado com o motivo", () => {
    perms = new Set();
    montar([mov()]);
    expect(botaoAnular()).toBeDisabled();
    expect(screen.getByRole("button", { name: /^(Refazer|Nada para refazer)/ })).toBeDisabled();
    const grupo = botaoAnular().closest("fieldset") as HTMLElement;
    expect(grupo).toHaveAccessibleDescription(/Sem permissão/);
    expect(screen.getByRole("button", { name: "Porque está bloqueado: Anular e refazer" })).toBeInTheDocument();
    // e o atalho também não faz nada
    ctrlZ();
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("Ctrl+Z numa caixa de texto não faz nada; fora dela, anula a receção pelo «Reverter receção» clássico", () => {
    montar([mov()], <input aria-label="Pesquisar" />);
    ctrlZ(screen.getByLabelText("Pesquisar"));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
    ctrlZ(document.body);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/encomendas?open=po-7&item=poi-1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("com um diálogo aberto o Ctrl+Z não faz nada", () => {
    montar([mov()], <div role="dialog" data-state="open">folha</div>);
    ctrlZ(document.body);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("um ajuste fica fora da pilha: nada para anular, só a nota", () => {
    montar([mov({ id: "a", movement_type: "ajuste_negativo", document_type: "ajuste", rececao: null })]);
    expect(botaoAnular()).toHaveAccessibleName(/^Nada para anular/);
    expect(screen.getByTestId("fora-da-pilha")).toHaveTextContent("1 movimento que não se anula aqui");
    ctrlZ(document.body);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("saída e depois um ajuste: o Ctrl+Z oferece anular a saída (o ajuste não tranca a pilha)", async () => {
    rpc.mockImplementation(async () => docEc());
    montar([venda(), mov({ id: "aj", movement_type: "ajuste_positivo", document_type: "ajuste", rececao: null, created_at: "2026-11-24T10:06:00Z" })]);
    expect(botaoAnular()).toHaveAccessibleName(/^Anular: Saída de 2 Torneira/);
    ctrlZ(document.body);
    expect(await screen.findByRole("alertdialog", { name: "Reverter a saída de Torneira?" })).toBeInTheDocument();
  });

  it("duplo Ctrl+Z: uma só leitura da EC e um só diálogo", async () => {
    let soltar: (v: unknown) => void = () => {};
    rpc.mockImplementation(() => new Promise((ok) => { soltar = ok; }));
    montar([venda()]);
    ctrlZ(document.body);
    ctrlZ(document.body);
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => { soltar(docEc()); });
    expect(await screen.findAllByRole("alertdialog")).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("com a lista dos passos aberta o Ctrl+Z não faz nada", () => {
    montar([mov()]);
    fireEvent.click(screen.getByRole("button", { name: /^Os passos/ }));
    expect(screen.getByRole("dialog", { name: "Os passos" })).toBeInTheDocument();
    ctrlZ(document.body);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("saída repartida: «Reverter toda a saída (2 parcelas)» e, depois de reler, nenhum toast «Anulado» por cima do «Saída revertida»", async () => {
    rpc.mockImplementation(async (nome: string) => nome === "rpc_get_client_order_document" ? docEc() : { data: { ok: true }, error: null });
    const irma = (): MovimentoLivro => ({ ...venda(), id: "m-2b", warehouse_id: "w-2", quantity: 1 });
    const { reler } = montar([venda(), irma()]);
    fireEvent.click(botaoAnular());
    expect(await screen.findByRole("alertdialog", { name: "Reverter toda a saída de Torneira (2 parcelas)?" })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reverter toda a saída (2 parcelas)" })); });
    expect(rpc).toHaveBeenCalledWith("rpc_revert_client_order_stock_exit", { p_contract_id: "ct-3", p_movement_id: "m-2" }); // o da linha da EC, como o ecrã clássico
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByTestId("toast-escuro")).toHaveTextContent(/^Saída revertida/);
    // o livro relê: as duas parcelas aparecem anuladas
    reler([{ ...venda(), anulado: true }, { ...irma(), anulado: true }]);
    expect(screen.getByTestId("toast-escuro")).toHaveTextContent(/^Saída revertida/);
    expect(screen.queryByText(/^Anulado:/)).toBeNull();
  });

  it("saída reversível: confirma e chama rpc_revert_client_order_stock_exit com os parâmetros do ecrã; o toast escuro oferece Refazer", async () => {
    rpc.mockImplementation(async (nome: string) => nome === "rpc_get_client_order_document"
      ? { data: { lines: [{ quote_line_id: "q", item_type: "product", product_id: "p-1", product_name: "Torneira", line_status: "servido_por_stock", stock_exit_movement_id: "m-2", qty_served: 2, quantity: 2 }] }, error: null }
      : { data: { ok: true }, error: null });
    const { recarregar } = montar([venda()]);
    fireEvent.click(botaoAnular());
    expect(await screen.findByRole("alertdialog", { name: "Reverter a saída de Torneira?" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("rpc_get_client_order_document", { p_contract_id: "ct-3" });
    expect(rpc).not.toHaveBeenCalledWith("rpc_revert_client_order_stock_exit", expect.anything());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reverter saída" })); });
    expect(rpc).toHaveBeenCalledWith("rpc_revert_client_order_stock_exit", { p_contract_id: "ct-3", p_movement_id: "m-2" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(recarregar).toHaveBeenCalled();
    const toast = screen.getByTestId("toast-escuro");
    expect(toast).toHaveTextContent("Saída revertida: Saída de 2 Torneira (EC-2026-0003)");
    expect(screen.getByRole("status")).toContainElement(toast);
    // Refazer só reabre a ação clássica
    fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/saidas?open=ct-3");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("saída sem a permissão do ecrã: o passo não se anula (cadeado com o motivo), nunca a RPC", () => {
    perms = new Set([...PERMISSOES_REVERTER_RECECAO]);
    montar([venda()]);
    expect(botaoAnular()).toHaveAccessibleName(/^Não se anula: Saída/);
    fireEvent.click(botaoAnular());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("um passo anulado: Ctrl+Shift+Z / Ctrl+Y reabrem a Receção, nunca refazem sozinhos", () => {
    montar([mov({ anulado: true })]);
    ctrlZ(document.body, { shiftKey: true, key: "Z" });
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/rececao?po=po-7");
    expect(rpc).not.toHaveBeenCalled();
  });
});
