// Encomendas a fornecedor dentro da moldura do novo Inventário (V.enc do artefacto): barra, chips, cartões.
// O PurchaseOrders.tsx inteiro (5000 linhas, dezenas de leituras) não se monta aqui: testa-se o PoCartoes com
// props, as ações reais (PoRowActions) com as permissões simuladas, e a ramificação PoCabecalho (fora / dentro).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

const perms = vi.hoisted(() => ({ codes: new Set<string>() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    loading: false,
    hasPermission: (c: string) => perms.codes.has(c),
    hasAnyPermission: (l: string[]) => l.some((c) => perms.codes.has(c)),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { PoRowActions } from "../PoRowActions";
import {
  PoBarraEmbebida,
  PoCabecalho,
  PoCartoes,
  poEtapa,
  poPagamentoTexto,
  poPilula,
  poPortalLinha,
  type PoCartao,
} from "../PoCartoes";
import type { PoShipment } from "../poPortalShipments";
import type { PoStatusFilter } from "@/components/inventory/ui/inventoryLinks";

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);
beforeEach(() => {
  perms.codes = new Set();
});

const CONTAGENS: Record<PoStatusFilter, number> = {
  all: 3, pending: 1, ordered: 1, partially_received: 0, received: 1, cancelled: 0, late: 1, portal: 0,
};

const cartao = (over: Partial<PoCartao> = {}): PoCartao => ({
  id: "po1",
  numero: "PO-2026-0001",
  fornecedor: "Placo Ibérica",
  automatica: true,
  estado: "ordered",
  rotuloEstado: "Encomendado",
  eliminada: false,
  diasAtraso: 4,
  etapa: 1,
  origem: { rotulo: "CT-2026-0042 · Ana Silva", dica: "Contrato CT-2026-0042 — Ana Silva", ligacao: "/client-orders?open=ct42" },
  dataEncomenda: "10/11/2026",
  entrega: "20/11/2026",
  portal: null,
  valor: "1 234,50 €",
  pagamento: "30 dias · vence 20/12/2026",
  ...over,
});

const LISTA: PoCartao[] = [
  cartao(),
  cartao({ id: "po2", numero: "PO-2026-0002", fornecedor: "Knauf", automatica: false, estado: "pending", diasAtraso: null, etapa: 0, origem: null, pagamento: null, valor: "80,00 €" }),
  cartao({ id: "po3", numero: "PO-2026-0003", fornecedor: "Weber", automatica: false, estado: "received", diasAtraso: null, etapa: 6, valor: "10,00 €" }),
];

function montar(props: Partial<Parameters<typeof PoCartoes>[0]> = {}) {
  const handlers = {
    abrir: vi.fn(),
    aoFiltrarEstado: vi.fn(),
    limpar: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onRestore: vi.fn(),
  };
  const acoes = (id: string) => {
    const c = (props.cartoes ?? LISTA).find((x) => x.id === id)!;
    return (
      <PoRowActions
        order={{ id: c.id, order_number: c.numero, status: c.estado }}
        deleted={c.eliminada}
        onOpen={handlers.onOpen} onApproveSend={() => {}} onReceive={() => {}} onPdf={() => {}}
        onCancelRemainder={() => {}} onRevert={() => {}} onEdit={() => {}}
        onDelete={handlers.onDelete} onRestore={handlers.onRestore}
      />
    );
  };
  function Onde() {
    const loc = useLocation();
    return <output data-testid="rota">{loc.pathname + loc.search}</output>;
  }
  render(
    <MemoryRouter initialEntries={["/inventario"]}>
    <Onde />
    <Routes><Route path="*" element={null} /></Routes>
    <TooltipProvider>
      <PoCartoes
        cartoes={LISTA}
        grupos={null}
        estado="all"
        aoFiltrarEstado={handlers.aoFiltrarEstado}
        contagens={CONTAGENS}
        abrir={handlers.abrir}
        acoes={acoes}
        valorPorReceber="3 488,50 €"
        nota={<>“Recebida” nunca se escolhe à mão</>}
        temFiltros={false}
        limpar={handlers.limpar}
        textos={{ semResultados: "Sem resultados para os filtros", semEncomendas: "Ainda não há encomendas", limpar: "Limpar filtros" }}
        {...props}
      />
    </TooltipProvider>
    </MemoryRouter>,
  );
  return handlers;
}

describe("poS / poAt com os dados reais", () => {
  it("pílula: por aprovar, atrasada (a pulsar), parte, a caminho, recebida, cancelada", () => {
    expect(poPilula({ estado: "pending", diasAtraso: null, rotuloEstado: "" })).toMatchObject({ texto: "Por aprovar", tom: "violet" });
    expect(poPilula({ estado: "ordered", diasAtraso: 3, rotuloEstado: "" })).toMatchObject({ texto: "Atrasada 3 dias", tom: "bad", pulsar: true });
    expect(poPilula({ estado: "ordered", diasAtraso: 1, rotuloEstado: "" }).texto).toBe("Atrasada 1 dia");
    expect(poPilula({ estado: "partially_received", diasAtraso: null, rotuloEstado: "" })).toMatchObject({ texto: "Chegou uma parte", tom: "warn" });
    expect(poPilula({ estado: "ordered", diasAtraso: null, rotuloEstado: "" })).toMatchObject({ texto: "A caminho", tom: "info" });
    expect(poPilula({ estado: "received", diasAtraso: null, rotuloEstado: "" })).toMatchObject({ texto: "Recebida", tom: "ok" });
    expect(poPilula({ estado: "cancelled", diasAtraso: null, rotuloEstado: "Cancelado" })).toMatchObject({ texto: "Cancelado", tom: "neutral" });
  });

  it("etapa: rascunho → recebida pela publicação, guia e estado", () => {
    expect(poEtapa("pending", null, false)).toBe(0);
    expect(poEtapa("ordered", "sent", false)).toBe(1);
    expect(poEtapa("ordered", "viewed", false)).toBe(2);
    expect(poEtapa("ordered", "confirmed", false)).toBe(3);
    expect(poEtapa("ordered", "confirmed", true)).toBe(4);
    expect(poEtapa("partially_received", null, false)).toBe(5);
    expect(poEtapa("received", null, false)).toBe(6);
    expect(poEtapa("cancelled", null, false)).toBe(-1);
  });
});

describe("PoCartoes (dentro da moldura)", () => {
  it("cada cartão mostra fornecedor, nº · Automática, pílula, destino, valor e pagamento", () => {
    montar();
    const [c1, c2] = screen.getAllByTestId("po-cartao");
    expect(within(c1).getByText("Placo Ibérica")).toBeInTheDocument();
    expect(within(c1).getByText(/PO-2026-0001 · Automática/)).toBeInTheDocument();
    expect(within(c1).getByText("Atrasada 4 dias")).toBeInTheDocument();
    expect(within(c1).getByRole("link", { name: "CT-2026-0042 · Ana Silva" })).toBeInTheDocument();
    expect(within(c1).getByText("Encomenda 10/11/2026 · entrega 20/11/2026")).toBeInTheDocument();
    expect(within(c1).getByText("1 234,50 €")).toBeInTheDocument();
    expect(within(c1).getByText("Pagamento: 30 dias · vence 20/12/2026")).toBeInTheDocument();
    expect(within(c1).getByRole("img", { name: "Etapa: Encomendada" })).toBeInTheDocument();
    // Sem cliente e sem prazo no fornecedor.
    expect(within(c2).getByText("Por aprovar")).toBeInTheDocument();
    expect(within(c2).getByText("Para stock")).toBeInTheDocument();
    expect(within(c2).queryByRole("link")).toBeNull();
    expect(within(c2).getByText("Pagamento: Sem prazo definido no fornecedor")).toBeInTheDocument();
    expect(screen.getByTestId("po-valor-por-receber")).toHaveTextContent("3 488,50 €");
    expect(screen.getByText("3 encomenda(s)")).toBeInTheDocument();
  });

  it("pagamento: prazo e vencimento, só o vencimento, só o prazo, nenhum", () => {
    expect(poPagamentoTexto(30, "20/12/2026")).toBe("30 dias · vence 20/12/2026");
    expect(poPagamentoTexto(null, "20/12/2026")).toBe("vence 20/12/2026");
    expect(poPagamentoTexto(undefined, "20/12/2026")).toBe("vence 20/12/2026");
    expect(poPagamentoTexto(30, null)).toBe("30 dias");
    expect(poPagamentoTexto(null, null)).toBeNull();
    montar({ cartoes: [cartao({ pagamento: poPagamentoTexto(null, "05/01/2027") })] });
    const c = screen.getByTestId("po-cartao");
    expect(within(c).getByText("Pagamento: vence 05/01/2027")).toBeInTheDocument();
    expect(within(c).queryByText(/Sem prazo definido/)).toBeNull();
  });

  it("data da encomenda sem entrega prevista", () => {
    montar({ cartoes: [cartao({ entrega: null, diasAtraso: null })] });
    expect(within(screen.getByTestId("po-cartao")).getByText("Encomenda 10/11/2026")).toBeInTheDocument();
  });

  it("origem: «Nº · Cliente» liga à Encomenda Cliente sem abrir o cartão; por resolver mostra «—» sem ligação", () => {
    const h = montar({ cartoes: [cartao()] });
    const link = within(screen.getByTestId("po-cartao")).getByRole("link", { name: "CT-2026-0042 · Ana Silva" });
    expect(link).toHaveAttribute("href", "/client-orders?open=ct42");
    expect(link).toHaveAttribute("title", "Contrato CT-2026-0042 — Ana Silva");
    expect(link.className).toMatch(/relative/);
    expect(link.className).toMatch(/z-10/);
    fireEvent.click(link);
    expect(h.abrir).not.toHaveBeenCalled();
    expect(screen.getByTestId("rota")).toHaveTextContent("/client-orders?open=ct42");
    cleanup();
    montar({ cartoes: [cartao({ origem: { rotulo: "—", dica: "", ligacao: null } })] });
    const c = screen.getByTestId("po-cartao");
    expect(within(c).getByText("Para —")).toBeInTheDocument();
    expect(within(c).queryByRole("link")).toBeNull();
  });

  it("portal / guia: o mesmo texto da coluna Estado (guia expedida tem prioridade; retirada não mostra nada)", () => {
    const pub = (over: Record<string, unknown>) =>
      ({ purchase_order_id: "po1", status: "sent", revision: 1, viewed_at: null, confirmed_at: null, promised_date: null, ...over }) as never;
    const guia = { noteNumber: "GR-2026/77", count: 1, partial: false, shippedAt: "2026-11-18T10:00:00Z" } as unknown as PoShipment;
    expect(poPortalLinha(pub({ status: "confirmed" }), guia)?.texto).toBe("Expedida · GR-2026/77");
    expect(poPortalLinha(undefined, { ...guia, partial: true, count: 3 } as PoShipment)?.texto).toBe("Parcialmente expedida · GR-2026/77 +2");
    expect(poPortalLinha(pub({ status: "confirmed", promised_date: "2026-12-03" }), null)?.texto).toBe("Confirmada · entrega 03/12");
    expect(poPortalLinha(pub({ status: "viewed" }), null)?.texto).toBe("No portal · vista");
    expect(poPortalLinha(pub({}), null)?.texto).toBe("No portal · por ver");
    expect(poPortalLinha(pub({ status: "withdrawn" }), null)).toBeNull();
    expect(poPortalLinha(undefined, null)).toBeNull();

    montar({
      cartoes: [
        cartao({ portal: poPortalLinha(undefined, guia) }),
        cartao({ id: "po2", numero: "PO-2026-0002", portal: poPortalLinha(pub({}), null) }),
        cartao({ id: "po3", numero: "PO-2026-0003", portal: null }),
      ],
    });
    const [c1, c2, c3] = screen.getAllByTestId("po-cartao");
    const l1 = within(c1).getByTestId("po-cartao-portal");
    expect(l1).toHaveTextContent("Portal: Expedida · GR-2026/77");
    expect(l1.getAttribute("title")).toMatch(/^Expedida pelo fornecedor em/);
    expect(within(c2).getByTestId("po-cartao-portal")).toHaveTextContent(/^No portal · por ver$/);
    expect(within(c3).queryByTestId("po-cartao-portal")).toBeNull();
  });

  it("clicar no cartão chama o mesmo abrir da página; sem abrir (eliminadas / sem permissão) não há botão", () => {
    const h = montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir PO-2026-0002 · Knauf" }));
    expect(h.abrir).toHaveBeenCalledWith("po2");
    cleanup();
    montar({ abrir: null });
    expect(screen.queryByRole("button", { name: /^Abrir PO-/ })).toBeNull();
  });

  it("o ⋯ tem o menu de PoRowActions com os mesmos gates e não abre o cartão", async () => {
    perms.codes = new Set(["purchase_orders.edit"]); // sem purchase_orders.delete
    const h = montar();
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais ações para PO-2026-0003" }), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /^Abrir detalhe/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^PDF da encomenda/ })).toBeInTheDocument();
    const eliminar = within(menu).getByRole("menuitem", { name: /^Eliminar/ });
    expect(eliminar).toHaveAttribute("aria-disabled", "true");
    expect(eliminar).toHaveTextContent("Sem permissão");
    // Recebida: editar bloqueado pelo estado, como na tabela.
    expect(within(menu).getByRole("menuitem", { name: /^Editar/ })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Abrir detalhe/ }));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it("na vista de eliminados o cartão não abre e a ação é Restaurar (com purchase_orders.delete)", () => {
    perms.codes = new Set(["purchase_orders.delete"]);
    const h = montar({ cartoes: [cartao({ eliminada: true })], abrir: null });
    expect(screen.getByText("Eliminada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Restaurar/ }));
    expect(h.onRestore).toHaveBeenCalledTimes(1);
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it("os chips têm contagem, o ativo fica marcado e filtram pelo mesmo estado (?status=)", () => {
    const h = montar({ estado: "pending" });
    const grupo = screen.getByRole("group", { name: "Estado" });
    const chips = within(grupo).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual([
      "Todas 3", "Pendente 1", "Atrasadas 1", "Encomendado 1", "Parcialmente recebida 0", "Recebida 1", "Cancelada 0", "No portal 0",
    ]);
    expect(within(grupo).getByRole("button", { name: /^Pendente/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(grupo).getByRole("button", { name: /^Atrasadas/ }));
    expect(h.aoFiltrarEstado).toHaveBeenCalledWith("late");
    expect(screen.getByRole("button", { name: "Sobre os estados" })).toHaveAccessibleDescription(/Recebida” nunca se escolhe à mão/);
  });

  it("agrupar por fornecedor: secções com o nome do fornecedor", () => {
    montar({ grupos: [{ chave: "s1", nome: "Knauf", cartoes: [LISTA[1]] }, { chave: "s2", nome: "Weber", cartoes: [LISTA[2]] }] });
    expect(within(screen.getByRole("region", { name: "Knauf" })).getAllByTestId("po-cartao")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: /Weber/ })).toBeInTheDocument();
  });

  it("estados vazios: sem encomendas / sem resultados com Limpar filtros", () => {
    montar({ cartoes: [] });
    expect(screen.getByText("Ainda não há encomendas")).toBeInTheDocument();
    cleanup();
    const h = montar({ cartoes: [], temFiltros: true });
    expect(screen.getByText("Sem resultados para os filtros")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(h.limpar).toHaveBeenCalled();
  });
});

describe("Barra e ramificação (PoCabecalho)", () => {
  const barra = (over: Partial<Parameters<typeof PoBarraEmbebida>[0]> = {}) => ({
    pesquisa: "",
    aoPesquisar: vi.fn(),
    vista: "cartoes" as const,
    aoMudarVista: vi.fn(),
    filtros: <p>Filtros avançados aqui</p>,
    filtrosAtivos: 0,
    ...over,
  });
  const acoes: ReactNode = (
    <>
      <button type="button">FAQ</button>
      <button type="button">Exportar</button>
      <button type="button">+ Nova encomenda</button>
    </>
  );

  it("fora da moldura: o cabeçalho clássico com título, descrição e as ações; sem barra nem alternador", () => {
    render(<PoCabecalho embebido={false} barra={barra()} title="Encomendas a fornecedor" description="Rascunhos…" actions={acoes} />);
    expect(screen.getByRole("heading", { name: "Encomendas a fornecedor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Vista" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Filtros" })).toBeNull();
  });

  it("dentro: sem título; pesquisa, Filtros, as mesmas ações e Cartões/Tabela", () => {
    const b = barra();
    render(<PoCabecalho embebido barra={b} title="Encomendas a fornecedor" description="Rascunhos…" actions={acoes} />);
    expect(screen.queryByRole("heading", { name: "Encomendas a fornecedor" })).toBeNull();
    expect(screen.getByRole("button", { name: "+ Nova encomenda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "FAQ" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar encomendas" }), { target: { value: "placo" } });
    expect(b.aoPesquisar).toHaveBeenCalledWith("placo");
    expect(screen.getByRole("button", { name: "Cartões" })).toHaveAttribute("aria-pressed", "true");
  });

  it("«Filtros» abre o painel dos filtros avançados", () => {
    render(<PoBarraEmbebida {...barra({ filtrosAtivos: 2 })} />);
    expect(screen.queryByText("Filtros avançados aqui")).toBeNull();
    const btn = screen.getByRole("button", { name: /^Filtros/ });
    expect(btn).toHaveTextContent("2");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("region", { name: "Filtros" })).getByText("Filtros avançados aqui")).toBeInTheDocument();
  });

  it("«Tabela» pede a tabela clássica; nessa vista a barra fica só com as ações (a pesquisa é a do cartão clássico)", () => {
    const b = barra();
    const { rerender } = render(<PoBarraEmbebida {...b} acoes={acoes} />);
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(b.aoMudarVista).toHaveBeenCalledWith("tabela");
    rerender(<PoBarraEmbebida {...b} vista="tabela" acoes={acoes} />);
    expect(screen.getByRole("button", { name: "Tabela" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Exportar" })).toBeInTheDocument();
  });
});
