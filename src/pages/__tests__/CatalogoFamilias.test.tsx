// A página «Famílias» do módulo Produtos (/catalogo/produtos/familias): separadores no topo, famílias GRAVADAS NA BASE (20270125100000) pelas funções
// cat_*familia* (familiasDados, aqui simulado), assistente de 3 passos com «Guardar», apagar com confirmação e só de leitura sem products.edit.
// Lê só o catálogo LEVE (referências + atributos) e pesquisa os produtos no servidor: nunca o catálogo inteiro, e nunca escreve por `from`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { A_COR, A_MED, K_LEVE, attrs, linha, paginaDe } from "@/emylia/familias/fixturesFamilias";

const org = vi.hoisted(() => ({ id: "org-1" as string | null, loading: false }));
const perms = vi.hoisted(() => ({ editar: true }));
const rpc = vi.hoisted(() => vi.fn(async () => { throw new Error("a página de famílias só chama a base pelos clientes"); }));
const from = vi.hoisted(() => vi.fn(() => { throw new Error("a página de famílias não escreve por from"); }));
const leve = vi.hoisted(() => vi.fn());
const pagina = vi.hoisted(() => vi.fn());
const marcas = vi.hoisted(() => vi.fn());
const atributos = vi.hoisted(() => vi.fn());
const dados = vi.hoisted(() => ({ lerFamilias: vi.fn(), lerFamilia: vi.fn(), guardarFamilia: vi.fn(), apagarFamilia: vi.fn(), familiasDosProdutos: vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: org.id ? { id: org.id } : null, isLoading: org.loading }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt", setLanguage: () => undefined }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (c: string) => (c === "products.edit" ? perms.editar : true), loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
vi.mock("@/emylia/real/produtosLeves", () => ({ lerCatalogoLeve: (...a: unknown[]) => leve(...a) }));
vi.mock("@/emylia/real/produtosPaginados", async (orig) => ({
  ...(await orig<typeof import("@/emylia/real/produtosPaginados")>()),
  lerProdutosPagina: (...a: unknown[]) => pagina(...a), lerMarcasDoFiltro: (...a: unknown[]) => marcas(...a), lerAtributosProduto: (...a: unknown[]) => atributos(...a),
}));
vi.mock("@/emylia/familias/familiasDados", async (orig) => ({ ...(await orig<typeof import("@/emylia/familias/familiasDados")>()), ...dados }));

import CatalogoFamilias from "../CatalogoFamilias";

const Sitio = () => <p data-testid="sitio">{useLocation().pathname}</p>;
const arvore = () => (
  <MemoryRouter initialEntries={["/catalogo/produtos/familias"]}>
    <Routes><Route path="/catalogo/produtos/familias" element={<CatalogoFamilias />} /><Route path="*" element={<Sitio />} /></Routes>
  </MemoryRouter>
);
const montar = () => render(arvore());
const POR_ID: Record<string, ReturnType<typeof attrs>> = { a: attrs(50, "o-branco"), b: attrs(60, "o-branco") };
const VELAR = [linha("a", "Lava-loiça Velar 50", { pvp: 150 }), linha("b", "Lava-loiça Velar 60", { pvp: 180 })];
const F1 = { id: "f1", nome: "Lava-loiça Velar", nProdutos: 2, versao: "2026-11-20T10:00:00.123456+00:00" };
const LIDA = { id: "f1", nome: "Lava-loiça Velar", versao: F1.versao, veValores: true, eixos: [{ atributoId: A_COR, papel: "cor" }, { atributoId: A_MED, papel: "medida" }], linhas: VELAR };

beforeEach(() => {
  perms.editar = true;
  rpc.mockClear(); from.mockClear(); leve.mockReset(); pagina.mockReset(); marcas.mockReset(); atributos.mockReset();
  Object.values(dados).forEach((f) => f.mockReset());
  leve.mockResolvedValue({ ok: true, v: { K: K_LEVE, margens: { min: 28, alvo: 35 }, erroAtributos: null } });
  pagina.mockResolvedValue(paginaDe(VELAR));
  marcas.mockResolvedValue({ ok: true, v: { marcas: [], semMarca: 0, total: 0 } });
  atributos.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: POR_ID[id] ?? [] }));
  dados.lerFamilias.mockResolvedValue({ ok: true, v: [] });
  dados.familiasDosProdutos.mockResolvedValue({ ok: true, v: new Map() });
  dados.lerFamilia.mockResolvedValue({ ok: true, v: LIDA });
  dados.guardarFamilia.mockResolvedValue({ ok: true, v: { id: "f1", nome: "Lava-loiça Velar", versao: F1.versao } });
  dados.apagarFamilia.mockResolvedValue({ ok: true, v: { ok: true } });
});
afterEach(() => { cleanup(); org.id = "org-1"; org.loading = false; });

const botao = (nome: string) => screen.getByRole("button", { name: nome });
/** Abre o assistente novo, escolhe os dois produtos e chega ao passo 3. */
async function ateAoResumo() {
  fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
  const lista = await screen.findByRole("list", { name: "Produtos do catálogo" });
  await waitFor(() => expect(within(lista).getAllByRole("checkbox")).toHaveLength(2));
  fireEvent.click(within(lista).getByRole("checkbox", { name: /Velar 50/ }));
  fireEvent.click(within(lista).getByRole("checkbox", { name: /Velar 60/ }));
  fireEvent.click(botao("Seguinte"));
  await waitFor(() => expect(botao("Seguinte")).not.toHaveAttribute("aria-disabled", "true"));
  fireEvent.click(botao("Seguinte"));
}
/** A lista passa a ter a família depois de guardar (a página relê-a). */
const depoisDeGravarHa = (familias: unknown[]) => dados.guardarFamilia.mockImplementation(async () => {
  dados.lerFamilias.mockResolvedValue({ ok: true, v: familias });
  return { ok: true, v: { id: "f1", nome: "Lava-loiça Velar", versao: F1.versao } };
});

describe("CatalogoFamilias: estrutura", () => {
  it("tem o título, os 8 separadores de Produtos com «Famílias» selecionado, e o painel ligado ao separador", async () => {
    montar();
    await screen.findByRole("button", { name: "Nova família" });
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Lista", "Categorias", "Subcategorias", "Modelos", "Marcas", "Atributos", "Referência (SKU)", "Famílias"]);
    const tab = screen.getByRole("tab", { name: "Famílias" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("já não diz que as famílias ficam só até recarregar a página", async () => {
    montar();
    await screen.findByRole("button", { name: "Nova família" });
    expect(screen.queryByText(/até recarregar a página/)).toBeNull();
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
    expect(dados.lerFamilias).not.toHaveBeenCalled();
  });
});

describe("CatalogoFamilias: a lista vem da base", () => {
  it("lê as famílias da organização e mostra o nome e «N produtos»", async () => {
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1, { id: "f2", nome: "Torneira Roca", nProdutos: 1, versao: "v" }] });
    montar();
    const lista = await screen.findByRole("list", { name: "Famílias" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("Lava-loiça Velar");
    expect(itens[0]).toHaveTextContent("2 produtos");
    expect(itens[1]).toHaveTextContent("1 produto");
    expect(dados.lerFamilias).toHaveBeenCalledWith("org-1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem famílias diz-o", async () => {
    montar();
    expect(await screen.findByText("Ainda não há famílias.")).toBeInTheDocument();
  });

  it("se a lista falha, mostra o erro com «Tentar de novo», que volta a ler", async () => {
    dados.lerFamilias.mockResolvedValueOnce({ ok: false, erro: "Ainda não disponível nesta base" });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível ler as famílias: Ainda não disponível nesta base");
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    fireEvent.click(botao("Tentar de novo"));
    expect(await screen.findByRole("list", { name: "Famílias" })).toBeInTheDocument();
  });
});

describe("CatalogoFamilias: criar e guardar na base", () => {
  it("«Guardar» grava na base (nome, eixos por id, produtos), relê a lista, anuncia e devolve o foco ao «Editar»", async () => {
    depoisDeGravarHa([F1]);
    montar();
    await ateAoResumo();
    expect(screen.queryByRole("button", { name: "Guardar na sessão" })).toBeNull();
    fireEvent.click(botao("Guardar"));
    await waitFor(() => expect(dados.guardarFamilia).toHaveBeenCalledTimes(1));
    expect(dados.guardarFamilia).toHaveBeenCalledWith("org-1", {
      id: null, nome: "Lava-loiça Velar", eixos: [{ atributoId: A_COR, papel: "cor" }, { atributoId: A_MED, papel: "medida" }], produtos: ["a", "b"], versao: null,
    });
    const lista = await screen.findByRole("list", { name: "Famílias" });
    expect(within(lista).getByRole("listitem")).toHaveTextContent("Lava-loiça Velar");
    expect(screen.getByRole("status", { name: "Avisos" })).toHaveTextContent("Família «Lava-loiça Velar» guardada.");
    await waitFor(() => expect(botao("Editar Lava-loiça Velar")).toHaveFocus());
  });

  it("enquanto grava fica aria-busy e um segundo clique não grava outra vez", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    dados.guardarFamilia.mockImplementation(() => new Promise((r) => { acabar = r; }));
    montar();
    await ateAoResumo();
    fireEvent.click(botao("Guardar"));
    fireEvent.click(botao("Guardar"));
    expect(botao("Guardar")).toHaveAttribute("aria-busy", "true");
    expect(dados.guardarFamilia).toHaveBeenCalledTimes(1);
    await act(async () => { acabar({ ok: true, v: { id: "f1", nome: "Lava-loiça Velar", versao: "v" } }); });
  });

  it("um produto já noutra família (CT004): o erro aparece em alerta no passo 3 e o assistente fica aberto com o que se escolheu", async () => {
    dados.guardarFamilia.mockResolvedValue({ ok: false, erro: "O produto «Lava-loiça Velar 50» já está na família «Outra».", codigo: "CT004" });
    montar();
    await ateAoResumo();
    fireEvent.click(botao("Guardar"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível guardar: O produto «Lava-loiça Velar 50» já está na família «Outra».");
    expect(screen.getByRole("status", { name: "Passo atual" })).toHaveTextContent("Passo 3 de 3");
    expect(botao("Guardar")).not.toHaveAttribute("aria-busy", "true");
  });

  it("os produtos que a base diz estarem noutra família aparecem marcados", async () => {
    dados.familiasDosProdutos.mockResolvedValue({ ok: true, v: new Map([["a", { familiaId: "f9", nome: "Outra" }]]) });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
    const lista = await screen.findByRole("list", { name: "Produtos do catálogo" });
    await waitFor(() => expect(within(lista).getAllByRole("listitem")[0]).toHaveTextContent("já está noutra família"));
    expect(within(lista).getAllByRole("listitem")[1]).not.toHaveTextContent("já está noutra família");
    expect(dados.familiasDosProdutos).toHaveBeenCalledWith("org-1", ["a", "b"]);
  });

  it("Cancelar o assistente volta à lista sem gravar e devolve o foco a «Nova família»", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Nova família" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(botao("Nova família")).toHaveFocus());
    expect(dados.guardarFamilia).not.toHaveBeenCalled();
  });
});

describe("CatalogoFamilias: editar", () => {
  it("«Editar» lê a família na base, reabre com os produtos e grava com o id e a versão", async () => {
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar Lava-loiça Velar" }));
    expect(await screen.findByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("2 escolhidos");
    expect(dados.lerFamilia).toHaveBeenCalledWith("org-1", "f1");
    expect(screen.getByRole("heading", { level: 2, name: "Editar família: Lava-loiça Velar" })).toBeInTheDocument();
    fireEvent.click(botao("Seguinte"));
    await waitFor(() => expect(botao("Seguinte")).not.toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(botao("Seguinte"));
    fireEvent.click(botao("Guardar"));
    await waitFor(() => expect(dados.guardarFamilia).toHaveBeenCalledWith("org-1", expect.objectContaining({ id: "f1", versao: F1.versao, produtos: ["a", "b"] })));
  });

  it("alterada por outra pessoa (CT004): o erro aparece e o assistente fica aberto", async () => {
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    dados.guardarFamilia.mockResolvedValue({ ok: false, erro: "A família foi alterada por outra pessoa: reabra-a.", codigo: "CT004" });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar Lava-loiça Velar" }));
    await screen.findByRole("status", { name: "Produtos escolhidos" });
    fireEvent.click(botao("Seguinte"));
    await waitFor(() => expect(botao("Seguinte")).not.toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(botao("Seguinte"));
    fireEvent.click(botao("Guardar"));
    expect(await screen.findByRole("alert")).toHaveTextContent("A família foi alterada por outra pessoa: reabra-a.");
  });

  it("se a família não abre, diz porquê e fica na lista", async () => {
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    dados.lerFamilia.mockResolvedValue({ ok: false, erro: "Família não encontrada.", codigo: "CT003" });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar Lava-loiça Velar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível abrir a família: Família não encontrada.");
    expect(screen.queryByRole("status", { name: "Passo atual" })).toBeNull();
  });
});

describe("CatalogoFamilias: apagar com confirmação", () => {
  it("«Apagar» pede confirmação (os produtos não são apagados); cancelar não apaga", async () => {
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Apagar Lava-loiça Velar" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("Apagar a família «Lava-loiça Velar»?");
    expect(dialogo).toHaveTextContent("Os produtos não são apagados");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(dados.apagarFamilia).not.toHaveBeenCalled();
  });

  it("confirmar apaga na base, relê a lista e anuncia", async () => {
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    dados.apagarFamilia.mockImplementation(async () => { dados.lerFamilias.mockResolvedValue({ ok: true, v: [] }); return { ok: true, v: { ok: true } }; });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Apagar Lava-loiça Velar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Apagar família" }));
    await waitFor(() => expect(dados.apagarFamilia).toHaveBeenCalledWith("org-1", "f1"));
    expect(await screen.findByText("Ainda não há famílias.")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Avisos" })).toHaveTextContent("Família «Lava-loiça Velar» apagada.");
  });

  it("se apagar falha, diz porquê e a família fica", async () => {
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    dados.apagarFamilia.mockResolvedValue({ ok: false, erro: "Sem permissão (products.edit).", codigo: "CT001" });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Apagar Lava-loiça Velar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Apagar família" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível apagar a família: Sem permissão (products.edit).");
    expect(screen.getByRole("list", { name: "Famílias" })).toBeInTheDocument();
  });
});

describe("CatalogoFamilias: só de leitura sem products.edit", () => {
  it("mostra a lista e a nota, sem «Nova família», «Editar» nem «Apagar»", async () => {
    perms.editar = false;
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [F1] });
    montar();
    const lista = await screen.findByRole("list", { name: "Famílias" });
    expect(within(lista).getByRole("listitem")).toHaveTextContent("Lava-loiça Velar");
    expect(screen.getByText(/Só de leitura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova família" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Apagar/ })).toBeNull();
  });
});

describe("CatalogoFamilias: a mudança de organização", () => {
  it("mudar de organização relê as famílias e o catálogo da nova", async () => {
    const r = montar();
    await screen.findByRole("button", { name: "Nova família" });
    org.id = "org-2";
    r.rerender(arvore());
    await waitFor(() => expect(dados.lerFamilias).toHaveBeenLastCalledWith("org-2"));
    expect(leve).toHaveBeenLastCalledWith("org-2");
  });
});
