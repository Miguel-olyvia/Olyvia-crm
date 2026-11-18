// A página «Famílias» do módulo Produtos (/catalogo/produtos/familias): separadores no topo, famílias só em memória (num armazém por organização: sobrevivem a mudar de
// separador e perdem-se ao recarregar), assistente de 3 passos. Lê só o catálogo LEVE (referências + atributos) e pesquisa os produtos no servidor: nunca o catálogo inteiro,
// e nunca escreve (nem rpc nem from).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { K_LEVE, attrs, linha, paginaDe } from "@/emylia/familias/fixturesFamilias";

const org = vi.hoisted(() => ({ id: "org-1" as string | null, loading: false }));
const rpc = vi.hoisted(() => vi.fn(async () => { throw new Error("a página de famílias não lê o catálogo inteiro"); }));
const from = vi.hoisted(() => vi.fn(() => { throw new Error("a página de famílias não escreve na base"); }));
const leve = vi.hoisted(() => vi.fn());
const pagina = vi.hoisted(() => vi.fn());
const marcas = vi.hoisted(() => vi.fn());
const atributos = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: org.id ? { id: org.id } : null, isLoading: org.loading }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
vi.mock("@/emylia/real/produtosLeves", () => ({ lerCatalogoLeve: (...a: unknown[]) => leve(...a) }));
vi.mock("@/emylia/real/produtosPaginados", async (orig) => ({
  ...(await orig<typeof import("@/emylia/real/produtosPaginados")>()),
  lerProdutosPagina: (...a: unknown[]) => pagina(...a), lerMarcasDoFiltro: (...a: unknown[]) => marcas(...a), lerAtributosProduto: (...a: unknown[]) => atributos(...a),
}));

import CatalogoFamilias from "../CatalogoFamilias";
import { esvaziarArmazemFamilias } from "@/emylia/familias/armazemFamilias";

const Sitio = () => <p data-testid="sitio">{useLocation().pathname}</p>;
const arvore = () => (
  <MemoryRouter initialEntries={["/catalogo/produtos/familias"]}>
    <Routes><Route path="/catalogo/produtos/familias" element={<CatalogoFamilias />} /><Route path="*" element={<Sitio />} /></Routes>
  </MemoryRouter>
);
const montar = () => render(arvore());
const POR_ID: Record<string, ReturnType<typeof attrs>> = { a: attrs(50, "o-branco"), b: attrs(60, "o-branco"), c: attrs(30, "o-branco"), d: attrs(40, "o-branco") };
const VELAR = [linha("a", "Lava-loiça Velar 50", { pvp: 150 }), linha("b", "Lava-loiça Velar 60", { pvp: 180 })];
const TORNEIRA = [linha("c", "Torneira Roca 30", { pvp: 90 }), linha("d", "Torneira Roca 40", { pvp: 100 })];

beforeEach(() => {
  esvaziarArmazemFamilias();
  rpc.mockClear(); from.mockClear(); leve.mockReset(); pagina.mockReset(); marcas.mockReset(); atributos.mockReset();
  leve.mockResolvedValue({ ok: true, v: { K: K_LEVE, margens: { min: 28, alvo: 35 }, erroAtributos: null } });
  pagina.mockResolvedValue(paginaDe(VELAR));
  marcas.mockResolvedValue({ ok: true, v: { marcas: [], semMarca: 0, total: 0 } });
  atributos.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: POR_ID[id] ?? [] }));
});
afterEach(() => { cleanup(); org.id = "org-1"; org.loading = false; esvaziarArmazemFamilias(); });

const NOTA = "As famílias ficam só até recarregar a página; mudar de separador não as perde.";
const botao = (nome: string) => screen.getByRole("button", { name: nome });
async function criarFamilia(rows = VELAR, nomes: [RegExp, RegExp] = [/Velar 50/, /Velar 60/]) {
  pagina.mockResolvedValue(paginaDe(rows));
  fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
  const lista = await screen.findByRole("list", { name: "Produtos do catálogo" });
  await waitFor(() => expect(within(lista).getAllByRole("checkbox")).toHaveLength(2));
  for (const n of nomes) fireEvent.click(within(lista).getByRole("checkbox", { name: n }));
  fireEvent.click(botao("Seguinte"));
  await waitFor(() => expect(botao("Seguinte")).not.toHaveAttribute("aria-disabled", "true"));
  fireEvent.click(botao("Seguinte"));
  fireEvent.click(botao("Guardar na sessão"));
}

describe("CatalogoFamilias: estrutura", () => {
  it("tem o título, os 8 separadores de Produtos com «Famílias» selecionado a seguir a «Referência (SKU)», e o painel ligado ao separador", async () => {
    montar();
    await screen.findByRole("button", { name: "Nova família" });
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Lista", "Categorias", "Subcategorias", "Modelos", "Marcas", "Atributos", "Referência (SKU)", "Famílias"]);
    const tab = screen.getByRole("tab", { name: "Famílias" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    const painel = screen.getByRole("tabpanel");
    expect(painel).toHaveAttribute("aria-labelledby", tab.id);
    expect(tab).toHaveAttribute("aria-controls", painel.id);
  });

  it("mostra a nota: as famílias ficam até recarregar a página e mudar de separador não as perde", async () => {
    montar();
    expect(await screen.findByText(NOTA)).toBeInTheDocument();
  });

  it("os outros separadores navegam para as suas rotas", async () => {
    montar();
    await screen.findByRole("button", { name: "Nova família" });
    fireEvent.click(screen.getByRole("tab", { name: "Referência (SKU)" }));
    expect(screen.getByTestId("sitio")).toHaveTextContent("/catalogo/produtos/referencia");
  });

  it("sem organização ativa, diz-o e não lê nada", () => {
    org.id = null;
    montar();
    expect(screen.getByText("Escolha uma organização para ver o Catálogo e custos.")).toBeInTheDocument();
    expect(leve).not.toHaveBeenCalled();
  });

  it("enquanto a organização carrega, mostra «A carregar…»", () => {
    org.loading = true;
    montar();
    expect(screen.getByText("A carregar…")).toBeInTheDocument();
  });
});

describe("CatalogoFamilias: leituras", () => {
  it("lê o catálogo LEVE da organização, uma vez, e nunca o inteiro (nenhuma chamada direta à base)", async () => {
    montar();
    await screen.findByRole("button", { name: "Nova família" });
    expect(leve).toHaveBeenCalledTimes(1);
    expect(leve).toHaveBeenCalledWith("org-1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("se o catálogo leve falha, mostra o erro em alerta com «Tentar de novo»", async () => {
    leve.mockResolvedValueOnce({ ok: false, erro: "Sem ligação." });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem ligação.");
    fireEvent.click(botao("Tentar de novo"));
    expect(await screen.findByRole("button", { name: "Nova família" })).toBeInTheDocument();
    expect(leve).toHaveBeenCalledTimes(2);
  });

  it("se os atributos não se leram (erroAtributos), avisa e não deixa criar famílias", async () => {
    leve.mockResolvedValue({ ok: true, v: { K: { ...K_LEVE, atributos: [] }, margens: { min: 28, alvo: 35 }, erroAtributos: "Não foi possível ler os atributos." } });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível ler os atributos.");
    expect(botao("Nova família")).toBeDisabled();
  });
});

describe("CatalogoFamilias: as famílias da sessão", () => {
  it("sem famílias diz-o; criar uma põe-na na lista, com os números e os botões Editar e Apagar", async () => {
    montar();
    expect(await screen.findByText("Ainda não há famílias nesta sessão.")).toBeInTheDocument();
    await criarFamilia();
    const lista = await screen.findByRole("list", { name: "Famílias criadas" });
    const item = within(lista).getByRole("listitem");
    expect(item).toHaveTextContent("Lava-loiça Velar");
    expect(item).toHaveTextContent("2 produtos geram 2 variantes");
    expect(within(item).getByRole("button", { name: "Editar Lava-loiça Velar" })).toBeInTheDocument();
    expect(screen.queryByText("Ainda não há famílias nesta sessão.")).toBeNull();
    expect(screen.getByText(NOTA)).toBeInTheDocument();
  });

  it("os produtos de uma família já criada aparecem marcados como «já está noutra família» ao criar outra", async () => {
    montar();
    await criarFamilia();
    await screen.findByRole("list", { name: "Famílias criadas" });
    pagina.mockResolvedValue(paginaDe(VELAR));
    fireEvent.click(botao("Nova família"));
    const lista = await screen.findByRole("list", { name: "Produtos do catálogo" });
    await waitFor(() => expect(within(lista).getAllByRole("listitem")[0]).toHaveTextContent("já está noutra família"));
  });

  it("Apagar tira a família da lista e anuncia-o", async () => {
    montar();
    await criarFamilia();
    fireEvent.click(await screen.findByRole("button", { name: "Apagar Lava-loiça Velar" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Famílias criadas" })).toBeNull());
    expect(screen.getByRole("status", { name: "Avisos" })).toHaveTextContent("Família «Lava-loiça Velar» apagada.");
    expect(screen.getByText("Ainda não há famílias nesta sessão.")).toBeInTheDocument();
  });

  it("Editar reabre o assistente com os produtos da família; guardar substitui-a (não duplica)", async () => {
    montar();
    await criarFamilia();
    fireEvent.click(await screen.findByRole("button", { name: "Editar Lava-loiça Velar" }));
    expect(await screen.findByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("2 escolhidos");
    fireEvent.click(botao("Seguinte"));
    await waitFor(() => expect(botao("Seguinte")).not.toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(botao("Seguinte"));
    fireEvent.click(botao("Guardar na sessão"));
    const lista = await screen.findByRole("list", { name: "Famílias criadas" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
  });

  it("Cancelar o assistente volta à lista sem criar nada", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Ainda não há famílias nesta sessão.")).toBeInTheDocument();
  });

  it("não escreve na base: nem rpc nem from são chamados (só as funções de leitura simuladas)", async () => {
    montar();
    await criarFamilia();
    await screen.findByRole("list", { name: "Famílias criadas" });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("CatalogoFamilias: o armazém por organização (R4) e a mudança de organização (R3)", () => {
  it("as famílias sobrevivem a desmontar e voltar a montar a página (mudar de separador e voltar)", async () => {
    const a = montar();
    await criarFamilia();
    await screen.findByRole("list", { name: "Famílias criadas" });
    a.unmount();
    montar();
    const lista = await screen.findByRole("list", { name: "Famílias criadas" });
    expect(within(lista).getByRole("listitem")).toHaveTextContent("Lava-loiça Velar");
  });

  it("cada organização tem as suas famílias: mudar de organização não leva as da outra, e voltar traz as suas", async () => {
    const r = montar();
    await criarFamilia();
    await screen.findByRole("list", { name: "Famílias criadas" });
    org.id = "org-2";
    r.rerender(arvore());
    expect(await screen.findByText("Ainda não há famílias nesta sessão.")).toBeInTheDocument();
    expect(leve).toHaveBeenLastCalledWith("org-2");
    org.id = "org-1";
    r.rerender(arvore());
    expect(await screen.findByRole("list", { name: "Famílias criadas" })).toBeInTheDocument();
  });

  it("mudar de organização com o assistente aberto fecha-o e não lança pedidos com os ids da organização antiga", async () => {
    const r = montar();
    fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
    const lista = await screen.findByRole("list", { name: "Produtos do catálogo" });
    await waitFor(() => expect(within(lista).getAllByRole("checkbox")).toHaveLength(2));
    fireEvent.click(within(lista).getByRole("checkbox", { name: /Velar 50/ }));
    fireEvent.click(botao("Seguinte"));
    await waitFor(() => expect(atributos).toHaveBeenCalled());
    org.id = "org-2";
    r.rerender(arvore());
    const antes = { p: pagina.mock.calls.length, a: atributos.mock.calls.length, m: marcas.mock.calls.length };
    expect(await screen.findByRole("button", { name: "Nova família" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Passo atual" })).toBeNull();
    await act(async () => { await new Promise((res) => setTimeout(res, 50)); });
    expect(pagina.mock.calls.slice(antes.p).every((c) => c[0] === "org-2")).toBe(true);
    expect(atributos.mock.calls.slice(antes.a).every((c) => c[0] === "org-2")).toBe(true);
    expect(marcas.mock.calls.slice(antes.m).every((c) => c[0] === "org-2")).toBe(true);
  });
});

describe("CatalogoFamilias: o foco (A4)", () => {
  it("«Nova família» leva o foco ao título do assistente", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Escolher produtos" })).toHaveFocus());
  });

  it("guardar devolve o foco ao «Editar» da família guardada", async () => {
    montar();
    await criarFamilia();
    await waitFor(() => expect(botao("Editar Lava-loiça Velar")).toHaveFocus());
  });

  it("cancelar uma família nova devolve o foco a «Nova família»", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(botao("Nova família")).toHaveFocus());
  });

  it("cancelar a edição de uma família devolve o foco ao «Editar» dela", async () => {
    montar();
    await criarFamilia();
    fireEvent.click(await screen.findByRole("button", { name: "Editar Lava-loiça Velar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(botao("Editar Lava-loiça Velar")).toHaveFocus());
  });

  it("apagar a única família leva o foco a «Nova família»", async () => {
    montar();
    await criarFamilia();
    fireEvent.click(await screen.findByRole("button", { name: "Apagar Lava-loiça Velar" }));
    await waitFor(() => expect(botao("Nova família")).toHaveFocus());
  });

  it("apagar uma família com outra ao lado leva o foco ao «Apagar» da vizinha (a seguinte; senão a anterior)", async () => {
    montar();
    await criarFamilia();
    await screen.findByRole("list", { name: "Famílias criadas" });
    await criarFamilia(TORNEIRA, [/Roca 30/, /Roca 40/]);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Famílias criadas" })).getAllByRole("listitem")).toHaveLength(2));
    fireEvent.click(botao("Apagar Lava-loiça Velar"));
    await waitFor(() => expect(botao("Apagar Torneira Roca")).toHaveFocus());
    await criarFamilia(VELAR, [/Velar 50/, /Velar 60/]);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Famílias criadas" })).getAllByRole("listitem")).toHaveLength(2));
    fireEvent.click(botao("Apagar Lava-loiça Velar"));
    await waitFor(() => expect(botao("Apagar Torneira Roca")).toHaveFocus());
  });
});
