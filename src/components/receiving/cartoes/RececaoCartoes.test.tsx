// "Por receber" em cartões (moldura do novo Inventário): secções pela ordem do artefacto, dados de cada cartão,
// gate do "Receber", clique = o mesmo onOpenPo, alternador Cartões/Tabela, filtros e a barra (.bar + aviso).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
let divergentes: number | null = 0;
const todayHook = vi.fn();
vi.mock("@/hooks/useInventoryToday", () => ({
  useInventoryToday: (o: { enabled?: boolean }) => {
    todayHook(o);
    return { data: o.enabled ? { purchases: { delivery_notes_with_divergences: divergentes } } : null, isLoading: false, refetch: () => {} };
  },
}));

import {
  PorReceberCartoes,
  RececaoBarra,
  RececaoScanbox,
  SESSAO_AGRUPAR_REC,
  SESSAO_VISTA_REC,
  faltaTexto,
  paraTexto,
  portalEntregaTexto,
} from "./RececaoCartoes";
import { PorReceberList } from "../PorReceberList";
import { ReceivingReadBar } from "../ReceivingReadBar";
import { FILTROS_REC, textoFalta, type FiltrosRec, type ReceivablePo } from "../porReceber";

const HOJE = "2026-11-24";

const po = (o: Partial<ReceivablePo>): ReceivablePo => ({
  id: "x",
  orderNumber: "PO-X",
  status: "ordered",
  supplierId: "s1",
  supplierName: "Zeta",
  expectedDelivery: null,
  orderDate: null,
  contractId: null,
  origin: null,
  publication: null,
  emailSent: false,
  lines: [
    { id: "l", productId: "p", name: "Base", sku: null, quantity: 4, received: 0, open: 4, uomId: null, uomCode: null, unitsPerUom: 1, productUomCode: "un" },
  ],
  ...o,
});

// Ordem do array ≠ ordem esperada (o componente é que ordena).
const POS: ReceivablePo[] = [
  po({ id: "pend", orderNumber: "PO-0006", status: "pending", supplierName: "Placo" }),
  po({ id: "esp", orderNumber: "PO-0005", expectedDelivery: "2026-12-10", supplierName: "Sanitop" }),
  po({
    id: "conf",
    orderNumber: "PO-0004",
    expectedDelivery: "2026-12-02",
    supplierName: "Cerâmica Leiriense",
    publication: { status: "confirmed", viewedAt: null, confirmedAt: "2026-11-01T10:00:00Z", promisedDate: "2026-12-05" },
  }),
  po({
    id: "exp",
    orderNumber: "PO-0003",
    expectedDelivery: "2026-12-01",
    supplierName: "Hidro Centro",
    shipped: { noteId: "n1", noteNumber: "GR 44", shippedAt: "2026-11-23T09:00:00Z", hasFile: false, count: 1 },
  }),
  po({
    id: "hoje",
    orderNumber: "PO-0002",
    expectedDelivery: "2026-11-25",
    supplierName: "Sanitop",
    emailSent: true,
    contractId: "c9",
    origin: { originType: "direct_sale", number: "VD-2026-0012", clientName: "Carlos Neves" },
  }),
  po({
    id: "atr",
    orderNumber: "PO-0001",
    expectedDelivery: "2026-11-19",
    supplierName: "Hidro Centro",
    contractId: "c1",
    origin: { originType: "contract", number: "CC-2026-0041", clientName: "Maria Silva" },
    lines: [
      { id: "l1", productId: "p1", name: "Mosaico 60×60", sku: null, quantity: 30, received: 30, open: 0, uomId: "m2", uomCode: "m²", unitsPerUom: 1 },
      { id: "l2", productId: "p2", name: "Resguardo 120", sku: null, quantity: 2, received: 1, open: 1, uomId: null, uomCode: null, unitsPerUom: 1, productUomCode: "un" },
      { id: "l3", productId: "p3", name: "Sifão", sku: null, quantity: 2, received: 0, open: 2, uomId: "cx", uomCode: "cx", unitsPerUom: 6 },
    ],
  }),
];

const MOTIVO = "Sem permissão: requer receiving.receive, purchase_orders.receive e inventory.edit";

function Harness(props: { canReceive?: boolean; onOpenPo?: (id: string) => void; f?: Partial<FiltrosRec>; tabelaReal?: boolean }) {
  const [f, setF] = useState<FiltrosRec>({ ...FILTROS_REC, ...props.f });
  return (
    <MemoryRouter>
      <PorReceberCartoes
        pos={POS}
        loading={false}
        error={null}
        noPermission={false}
        today={HOJE}
        f={f}
        setF={setF}
        canReceive={props.canReceive ?? true}
        receiveReason={MOTIVO}
        onOpenPo={props.onOpenPo ?? (() => {})}
        tabela={
          props.tabelaReal ? (
            <PorReceberList
              pos={POS}
              loading={false}
              error={null}
              noPermission={false}
              today={HOJE}
              f={f}
              setF={setF}
              canReceive={props.canReceive ?? true}
              onOpenPo={props.onOpenPo ?? (() => {})}
            />
          ) : (
            <div data-testid="tabela-classica">tabela</div>
          )
        }
      />
    </MemoryRouter>
  );
}

const cartao = (n: string) => screen.getAllByTestId("rec-cartao").find((c) => c.textContent?.includes(n)) as HTMLElement;

beforeAll(() => prepararRadixNoJsdom());
beforeEach(() => {
  window.sessionStorage.removeItem(SESSAO_VISTA_REC);
  window.sessionStorage.removeItem(SESSAO_AGRUPAR_REC);
});

describe("PorReceberCartoes", () => {
  it("as secções seguem a ordem do artefacto (urgência primeiro) com a pílula no título", () => {
    render(<Harness />);
    const sec = screen.getAllByTestId("rec-seccao");
    expect(sec.map((s) => within(s).getByRole("heading").textContent)).toEqual([
      "Atrasadas1 encomenda",
      "Chega hoje / amanhã1 encomenda",
      "Expedidas · a caminho1 encomenda",
      "Confirmadas pelo fornecedor1 encomenda",
      "À espera do fornecedor1 encomenda",
      "Por enviar ao fornecedor1 encomenda",
    ]);
    expect(sec.map((s) => within(s).getAllByTestId("rec-cartao").map((c) => c.getAttribute("data-po")))).toEqual([
      ["atr"],
      ["hoje"],
      ["exp"],
      ["conf"],
      ["esp"],
      ["pend"],
    ]);
  });

  it("cada cartão mostra o fornecedor, o nº em mono, Para/Portal/entrega e o que falta", () => {
    render(<Harness />);
    const a = cartao("PO-0001");
    expect(within(a).getByText("Hidro Centro").className).toContain("font-bold");
    expect(within(a).getByText("PO-0001").className).toContain("font-mono");
    expect(within(a).getByTestId("rec-cartao-para").textContent).toBe(
      "Para: Maria Silva (CC-2026-0041) · Sem envio registado · entrega 19/11",
    );
    // A origem abre a Encomenda Cliente (por cima do botão do cartão).
    const ec = within(a).getByRole("link", { name: "Maria Silva (CC-2026-0041)" });
    expect(ec.getAttribute("href")).toContain("open=c1");
    expect(ec.className).toContain("z-10");
    expect(within(a).getByTestId("rec-cartao-falta").textContent).toBe("Falta: 1 un Resguardo 120, 2 cx (= 6 un) Sifão");

    const s = cartao("PO-0006");
    expect(within(s).getByTestId("rec-cartao-para").textContent).toBe(
      "Para: Stock · Por enviar ao fornecedor · sem data de entrega",
    );
    expect(within(cartao("PO-0004")).getByTestId("rec-cartao-para").textContent).toBe(
      "Para: Stock · Portal: Confirmada p/ 05/12 · entrega 05/12",
    );
    expect(within(cartao("PO-0003")).getByText(/Expedida · /)).toBeTruthy();
    expect(paraTexto(POS[4])).toBe("Carlos Neves (VD-2026-0012)");
    expect(faltaTexto(POS[0])).toBe("4 un Base");
  });

  it("Portal: só com publicação ativa; fora do portal fica o selo (email, sem envio…) e a entrega", () => {
    const pub = { status: "viewed" as const, viewedAt: "2026-11-20T10:00:00Z", confirmedAt: null, promisedDate: null };
    expect(portalEntregaTexto(po({ publication: pub, expectedDelivery: "2026-12-01" }))).toBe("Portal: No portal · vista 20/11 · entrega 01/12");
    expect(portalEntregaTexto(po({ publication: { ...pub, status: "withdrawn" }, expectedDelivery: "2026-12-01" }))).toMatch(/^(?!Portal:).+ · entrega 01\/12$/);
    expect(portalEntregaTexto(po({ status: "pending", publication: pub }))).toMatch(/^(?!Portal:).+ · sem data de entrega$/);
    expect(portalEntregaTexto(po({ emailSent: true, expectedDelivery: "2026-12-01" }))).toMatch(/email.* · entrega 01\/12$/i);
  });

  it("Falta: a unidade segue a regra do lineIntegerOnly (sem uom_id vale a unidade do produto)", () => {
    const l = POS[0].lines[0];
    // uomCode velho na linha sem uom_id: não conta, conta a do produto.
    expect(faltaTexto(po({ lines: [{ ...l, uomId: null, uomCode: "cx", unitsPerUom: 1, productUomCode: "m2" }] }))).toBe("4 m2 Base");
    // Com uom_id: a da linha (embalagem).
    expect(faltaTexto(po({ lines: [{ ...l, uomId: "u-cx", uomCode: "cx", unitsPerUom: 12, productUomCode: "un" }] }))).toBe(
      "4 cx (= 12 un) Base",
    );
    // Sem unidade do produto lida: "un.".
    expect(faltaTexto(po({ lines: [{ ...l, uomId: null, uomCode: "kg", unitsPerUom: 1, productUomCode: undefined }] }))).toBe("4 un. Base");
  });

  it("Falta: numa PO de 10 linhas mostra as 3 primeiras e +N linhas (o mesmo total do textoFalta)", () => {
    const base = POS[0].lines[0];
    const dez = po({
      id: "dez",
      orderNumber: "PO-0010",
      lines: Array.from({ length: 10 }, (_, i) => ({ ...base, id: `d${i}`, productId: `p${i}`, name: `Artigo ${i + 1}`, open: i + 1 })),
    });
    expect(textoFalta(dez)).toContain("10 linhas");
    expect(faltaTexto(dez)).toBe("1 un Artigo 1, 2 un Artigo 2, 3 un Artigo 3 +7 linhas");
    // Linhas já recebidas não contam para o +N.
    const nove = { ...dez, lines: dez.lines.map((x, i) => (i === 9 ? { ...x, open: 0 } : x)) };
    expect(faltaTexto(nove)).toBe("1 un Artigo 1, 2 un Artigo 2, 3 un Artigo 3 +6 linhas");
    expect(faltaTexto({ ...dez, lines: dez.lines.slice(0, 4) })).toMatch(/Artigo 3 \+1 linha$/);
    expect(faltaTexto({ ...dez, lines: dez.lines.slice(0, 3) })).not.toContain("+");
    // No cartão.
    render(
      <MemoryRouter>
        <PorReceberCartoes
          pos={[dez]}
          loading={false}
          error={null}
          noPermission={false}
          today={HOJE}
          f={FILTROS_REC}
          setF={() => {}}
          canReceive
          onOpenPo={() => {}}
          tabela={null}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("rec-cartao-falta").textContent).toBe("Falta: 1 un Artigo 1, 2 un Artigo 2, 3 un Artigo 3 +7 linhas");
  });

  it("o nº da PO seleciona-se e um clique simples continua a abrir", () => {
    const onOpenPo = vi.fn();
    render(<Harness onOpenPo={onOpenPo} />);
    const num = within(cartao("PO-0001")).getByTestId("rec-cartao-numero");
    expect(num.className).toContain("select-text");
    expect(num.className).toContain("pointer-events-auto");
    fireEvent.click(num);
    expect(onOpenPo).toHaveBeenCalledWith("atr");
    // Com o nº selecionado: não abre (é para copiar).
    onOpenPo.mockClear();
    const r = document.createRange();
    r.selectNodeContents(num);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(r);
    fireEvent.click(num);
    expect(onOpenPo).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
  });

  it("sem o receiveGate, clicar no nº não abre", () => {
    const onOpenPo = vi.fn();
    render(<Harness canReceive={false} onOpenPo={onOpenPo} />);
    fireEvent.click(within(cartao("PO-0001")).getByTestId("rec-cartao-numero"));
    expect(onOpenPo).not.toHaveBeenCalled();
  });

  it("clicar no cartão e em Receber chama o mesmo onOpenPo", () => {
    const onOpenPo = vi.fn();
    render(<Harness onOpenPo={onOpenPo} />);
    const a = cartao("PO-0001");
    fireEvent.click(within(a).getByRole("button", { name: "Abrir PO-0001 · Hidro Centro" }));
    fireEvent.click(within(a).getByRole("button", { name: "Receber PO-0001" }));
    expect(onOpenPo.mock.calls).toEqual([["atr"], ["atr"]]);
    // O botão Receber é irmão do conteúdo e fica por cima do botão esticado.
    expect(within(a).getByRole("button", { name: "Receber PO-0001" }).parentElement?.className).toContain("z-10");
  });

  it("sem o receiveGate: Receber bloqueado com o mesmo motivo e o cartão não abre", () => {
    const onOpenPo = vi.fn();
    render(<Harness canReceive={false} onOpenPo={onOpenPo} />);
    expect(screen.queryAllByTestId("rec-cartao-abrir")).toHaveLength(0);
    const b = within(cartao("PO-0001")).getByRole("button", { name: "Receber PO-0001" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(b);
    expect(onOpenPo).not.toHaveBeenCalled();
    // O motivo está no DOM (aria-describedby), não só num title.
    const desc = document.getElementById(b.getAttribute("aria-describedby") ?? "");
    expect(desc?.textContent).toBe(MOTIVO);
    expect(within(cartao("PO-0001")).getByText("Modo consulta")).toBeTruthy();
  });

  it("Tabela mostra a lista clássica e Cartões volta", () => {
    render(<Harness />);
    expect(screen.queryByTestId("tabela-classica")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(screen.getByTestId("tabela-classica")).toBeTruthy();
    expect(screen.queryAllByTestId("rec-cartao")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Tabela" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
    expect(screen.queryByTestId("tabela-classica")).toBeNull();
    expect(screen.getAllByTestId("rec-cartao")).toHaveLength(6);
  });

  it("a vista escolhida fica na sessão (volta Tabela ao remontar)", () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(window.sessionStorage.getItem(SESSAO_VISTA_REC)).toBe("tabela");
    unmount();
    render(<Harness />);
    expect(screen.getByTestId("tabela-classica")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tabela" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sem sessionStorage (lança) continua a funcionar só em memória", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      render(<Harness />);
      fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
      expect(screen.getByTestId("tabela-classica")).toBeTruthy();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("o Agrupar da tabela não se perde ao trocar de vista nem ao remontar", () => {
    const { unmount } = render(<Harness tabelaReal />);
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    const sel = () => screen.getByLabelText("Agrupar") as HTMLSelectElement;
    expect(sel().value).toBe("nao");
    fireEvent.change(sel(), { target: { value: "forn" } });
    expect(sel().value).toBe("forn");
    expect(screen.getByRole("region", { name: "Hidro Centro" })).toBeTruthy();
    expect(window.sessionStorage.getItem(SESSAO_AGRUPAR_REC)).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(sel().value).toBe("forn");
    unmount();
    render(<Harness tabelaReal />);
    expect(sel().value).toBe("forn");
    fireEvent.change(sel(), { target: { value: "nao" } });
    expect(window.sessionStorage.getItem(SESSAO_AGRUPAR_REC)).toBe("0");
    expect(screen.queryByRole("region", { name: "Hidro Centro" })).toBeNull();
  });

  it("os filtros fornecedor e cliente/obra ficam acessíveis (e abrem sozinhos com ?ec=)", () => {
    render(<Harness f={{ cli: "c1" }} />);
    // Aberto porque já há um filtro (o ?ec= do negócio põe f.cli).
    const cli = screen.getByLabelText("Cliente/obra") as HTMLSelectElement;
    expect(cli.value).toBe("c1");
    expect(screen.getAllByTestId("rec-cartao").map((c) => c.getAttribute("data-po"))).toEqual(["atr"]);
    fireEvent.change(cli, { target: { value: "" } });
    expect(screen.getAllByTestId("rec-cartao")).toHaveLength(6);
    const sup = screen.getByLabelText("Fornecedor") as HTMLSelectElement;
    fireEvent.change(sup, { target: { value: "s1" } });
    expect(screen.getAllByTestId("rec-cartao")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: /Atrasadas/ }));
    expect(screen.getAllByTestId("rec-cartao").map((c) => c.getAttribute("data-po"))).toEqual(["atr"]);
  });

  it("o filtro da leitura aparece e tira-se", () => {
    render(<Harness f={{ ids: ["hoje"], lido: "0002" }} />);
    expect(screen.getByText(/Leitura «0002»: 1 encomenda/)).toBeTruthy();
    expect(screen.getAllByTestId("rec-cartao")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tirar filtro" }));
    expect(screen.getAllByTestId("rec-cartao")).toHaveLength(6);
  });
});

describe("RececaoBarra e RececaoScanbox", () => {
  const props = () => ({
    novaGuia: { motivo: null as string | null, abrir: vi.fn() },
    receberEncomenda: { ligacao: "/purchase-orders?status=ordered", motivo: null as string | null },
    aoLerArtigo: vi.fn(),
    pesquisa: "",
    aoPesquisar: vi.fn(),
    podeVerGuias: true,
    aoVerDivergentes: vi.fn(),
  });

  it("ações da barra, pesquisa e aviso das guias com divergências", () => {
    divergentes = 1;
    const p = props();
    render(
      <MemoryRouter>
        <RececaoBarra {...p} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nova guia" }));
    expect(p.novaGuia.abrir).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Receber numa encomenda" }).getAttribute("href")).toBe("/purchase-orders?status=ordered");
    fireEvent.click(screen.getByRole("button", { name: "Ler artigo a artigo" }));
    expect(p.aoLerArtigo).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar encomendas por receber" }), { target: { value: "Sanitop" } });
    expect(p.aoPesquisar).toHaveBeenCalledWith("Sanitop");
    const aviso = screen.getByTestId("rec-aviso-divergencias");
    expect(aviso.textContent).toContain("1 guia aberta com divergências");
    fireEvent.click(within(aviso).getByRole("button", { name: "Abrir a guia" }));
    expect(p.aoVerDivergentes).toHaveBeenCalledTimes(1);
  });

  it("sem permissão: Nova guia e Receber numa encomenda bloqueados com motivo; sem guias não há aviso", () => {
    divergentes = 3;
    const p = props();
    p.novaGuia.motivo = "Sem permissão: requer receiving.manage_delivery_notes";
    p.receberEncomenda.motivo = "Sem permissão: requer purchase_orders.view";
    p.podeVerGuias = false;
    render(
      <MemoryRouter>
        <RececaoBarra {...p} />
      </MemoryRouter>,
    );
    const nova = screen.getByRole("button", { name: "Nova guia" });
    expect(nova.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(nova);
    expect(p.novaGuia.abrir).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Receber numa encomenda" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByTestId("rec-aviso-divergencias")).toBeNull();
    expect(todayHook).toHaveBeenLastCalledWith({ enabled: false });
  });

  it("a scanbox só veste o ReceivingReadBar real (pelo data-rececao-leitor) e mostra a pista", () => {
    render(
      <RececaoScanbox>
        <ReceivingReadBar pos={[]} resolve={async () => ({ t: "nada" })} onOpenPo={() => {}} onFilter={() => {}} onArticleMode={() => {}} />
      </RececaoScanbox>,
    );
    const box = screen.getByTestId("rec-scanbox");
    expect(box.querySelectorAll("input")).toHaveLength(1);
    // O atributo estável está no div que tem o campo (é a esse que o CSS se prende).
    const leitor = box.querySelector("[data-rececao-leitor]");
    expect(leitor?.querySelector("input#rec-ler")).toBeTruthy();
    const css = box.querySelector("style")?.textContent ?? "";
    expect(css).toContain("[data-rec-scanbox] [data-rececao-leitor]{");
    expect(css).toContain("dashed hsl(var(--primary))");
    expect(css).not.toContain("first-of-type");
    expect(screen.getByTestId("rec-scanbox-pista").textContent).toBe("Ler código ou escrever nº PO / guia / SKU");
    // O rótulo do campo continua lá para os leitores de ecrã.
    expect(screen.getByLabelText("Ler ou escrever: nº PO, guia, fornecedor, EAN/SKU")).toBe(box.querySelector("#rec-ler"));
  });
});
