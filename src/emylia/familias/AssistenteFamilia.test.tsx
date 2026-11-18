// O assistente de 3 passos: escolher produtos, atributos (eixos, exclusões), resumo e guardar (só em memória, via onGuardar).
// Também: o foco (A4), o indicador de passos (A5), os botões aria-disabled com o motivo (A6) e o passo 1 que conserva a pesquisa ao recuar (A13).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { AssistenteFamilia } from "./AssistenteFamilia";
import { derivarFamilia, itensDosEscolhidos, type FamiliaGuardada } from "./derivarFamilia";
import { criarCacheAtributos } from "./usarAtributosEscolhidos";
import { DEFS, K_LEVE, attrs, linha, paginaDe, produto } from "./fixturesFamilias";

const ORG = "11111111-1111-4111-a111-111111111111";
const lerPagina = vi.fn(), lerMarcas = vi.fn(), lerAtributos = vi.fn();
vi.mock("../real/produtosPaginados", async (orig) => ({
  ...(await orig<typeof import("../real/produtosPaginados")>()),
  lerProdutosPagina: (...a: unknown[]) => lerPagina(...a),
  lerMarcasDoFiltro: (...a: unknown[]) => lerMarcas(...a),
  lerAtributosProduto: (...a: unknown[]) => lerAtributos(...a),
}));

const POR_ID: Record<string, AtributoProduto[]> = { a: attrs(50, "o-branco"), b: attrs(60, "o-branco"), c: attrs(60, "o-preto") };
beforeEach(() => {
  lerPagina.mockReset(); lerMarcas.mockReset(); lerAtributos.mockReset();
  lerPagina.mockResolvedValue(paginaDe([linha("a", "Lava-loiça Velar 50", { pvp: 150 }), linha("b", "Lava-loiça Velar 60", { pvp: 180 }), linha("c", "Lava-loiça Velar 60 preta", { pvp: 190 })]));
  lerMarcas.mockResolvedValue({ ok: true, v: { marcas: [], semMarca: 0, total: 0 } });
  lerAtributos.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: POR_ID[id] ?? [] }));
});
afterEach(cleanup);

function montar(o: { editar?: FamiliaGuardada | null; familias?: FamiliaGuardada[] } = {}) {
  const fn = { onGuardar: vi.fn(), onCancelar: vi.fn() };
  const cache = criarCacheAtributos();
  render(<AssistenteFamilia org={ORG} K={K_LEVE} familias={o.familias ?? []} editar={o.editar ?? null} cacheAtributos={cache} {...fn} />);
  return fn;
}
const marcar = async (...nomes: RegExp[]) => {
  const lista = await screen.findByRole("list", { name: "Produtos do catálogo" });
  await waitFor(() => expect(within(lista).getAllByRole("checkbox").length).toBeGreaterThan(0));
  for (const n of nomes) fireEvent.click(within(lista).getByRole("checkbox", { name: n }));
};
const botao = (nome: string) => screen.getByRole("button", { name: nome });
/** Os botões do assistente usam aria-disabled (continuam focáveis e dizem porquê): «ativo» = sem aria-disabled=true. */
const ativo = (b: HTMLElement) => b.getAttribute("aria-disabled") !== "true";
const esperarAtivo = (nome: string) => waitFor(() => expect(ativo(botao(nome))).toBe(true));
const seguinte = () => fireEvent.click(botao("Seguinte"));
const estadoPasso = () => screen.getByRole("status", { name: "Passo atual" });
const titulo = (nome: string) => screen.getByRole("heading", { level: 3, name: nome });

describe("AssistenteFamilia: navegação", () => {
  it("abre no passo 1, com o foco no título do passo, e o «Seguinte» diz porque não avança", () => {
    montar();
    expect(estadoPasso()).toHaveTextContent("Passo 1 de 3 · Escolher produtos");
    expect(titulo("Escolher produtos")).toHaveFocus();
    expect(botao("Seguinte")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status", { name: "Motivo" })).toHaveTextContent("Para continuar: escolha pelo menos um produto do catálogo.");
    expect(botao("Seguinte")).toHaveAccessibleDescription("Para continuar: escolha pelo menos um produto do catálogo.");
    expect(botao("Anterior")).toHaveAttribute("aria-disabled", "true");
  });

  it("clicar num botão aria-disabled não avança", async () => {
    montar();
    await marcar();
    seguinte();
    expect(estadoPasso()).toHaveTextContent("Passo 1 de 3");
  });

  it("o contentor do motivo está sempre montado (vazio quando se pode avançar)", async () => {
    montar();
    expect(screen.getByRole("status", { name: "Motivo" })).not.toBeEmptyDOMElement();
    await marcar(/Velar 50/);
    expect(screen.getByRole("status", { name: "Motivo" })).toBeEmptyDOMElement();
    expect(ativo(botao("Seguinte"))).toBe(true);
  });

  it("os 3 passos são uma lista; o atual tem aria-current e o texto «Passo n: título (feito|atual)» está dentro do item (sem aria-label no li)", async () => {
    montar();
    const passos = within(screen.getByRole("list", { name: "Passos do configurador" })).getAllByRole("listitem");
    expect(passos).toHaveLength(3);
    expect(passos[0]).toHaveAttribute("aria-current", "step");
    expect(passos[0]).not.toHaveAttribute("aria-label");
    expect(passos[0]).toHaveTextContent("Passo 1: Escolher produtos (atual)");
    await marcar(/Velar 50/);
    seguinte();
    expect(passos[0]).toHaveTextContent("Passo 1: Escolher produtos (feito)");
    expect(passos[1]).toHaveTextContent("Passo 2: Atributos dos produtos (atual)");
    expect(passos[2]).toHaveTextContent("Passo 3: Resumo e pré-visualização");
    expect(passos[2]).not.toHaveTextContent("(atual)");
  });

  it("escolher, avançar para os atributos (lidos com a organização) e depois para o resumo", async () => {
    montar();
    await marcar(/Velar 50/, /Velar 60$/, /Velar 60 preta/);
    seguinte();
    expect(estadoPasso()).toHaveTextContent("Passo 2 de 3 · Atributos dos produtos");
    await waitFor(() => expect(lerAtributos).toHaveBeenCalledTimes(3));
    expect(lerAtributos).toHaveBeenCalledWith(ORG, "a");
    await waitFor(() => expect(screen.getByRole("status", { name: "Resumo da atribuição" })).toHaveTextContent("3 produtos geram 3 variantes"));
    await esperarAtivo("Seguinte");
    seguinte();
    expect(estadoPasso()).toHaveTextContent("Passo 3 de 3 · Resumo e pré-visualização");
    expect(screen.getByRole("table", { name: "Variantes geradas" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pré-visualização da família" })).toBeInTheDocument();
  });

  it("o foco vai ao título do passo quando se muda de passo", async () => {
    montar();
    await marcar(/Velar 50/);
    seguinte();
    await waitFor(() => expect(titulo("Atributos dos produtos")).toHaveFocus());
  });

  it("enquanto os atributos se leem, «Seguinte» está aria-disabled e o motivo diz que está a ler", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    lerAtributos.mockImplementation(() => new Promise((r) => { soltar = r; }));
    montar();
    await marcar(/Velar 50/);
    seguinte();
    expect(botao("Seguinte")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status", { name: "Motivo" })).toHaveTextContent(/A ler os atributos de 1 produto/);
    soltar({ ok: true, v: POR_ID.a });
    await esperarAtivo("Seguinte");
  });

  it("um erro de leitura bloqueia o «Seguinte» até se tentar de novo ou excluir o produto", async () => {
    lerAtributos.mockImplementation(async (_o: string, id: string) => (id === "b" ? { ok: false, erro: "Sem permissão." } : { ok: true, v: POR_ID[id] ?? [] }));
    montar();
    await marcar(/Velar 50/, /Velar 60$/);
    seguinte();
    await screen.findByText(/Não foi possível ler os atributos: Sem permissão\./);
    expect(botao("Seguinte")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status", { name: "Motivo" })).toHaveTextContent(/Para continuar: .*Velar 60/);
    lerAtributos.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: POR_ID[id] ?? [] }));
    fireEvent.click(botao("Tentar de novo: Lava-loiça Velar 60"));
    await esperarAtivo("Seguinte");
  });

  it("«Anterior» volta ao passo anterior sem perder a escolha, nem a pesquisa, os filtros e a página do passo 1 (que não se leem outra vez)", async () => {
    montar();
    await marcar(/Velar 50/);
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "velar" } });
    await waitFor(() => expect(lerPagina).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ q: "velar" }), 1), { timeout: 3000 });
    const pedidos = lerPagina.mock.calls.length;
    seguinte();
    expect(screen.queryByRole("searchbox", { name: "Procurar produto" })).toBeNull();
    fireEvent.click(botao("Anterior"));
    expect(estadoPasso()).toHaveTextContent("Passo 1 de 3");
    expect(screen.getByRole("searchbox", { name: "Procurar produto" })).toHaveValue("velar");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("1 escolhido");
    expect(lerPagina.mock.calls.length).toBe(pedidos);
  });

  it("«Cancelar» chama onCancelar sem guardar", () => {
    const { onCancelar, onGuardar } = montar();
    fireEvent.click(botao("Cancelar"));
    expect(onCancelar).toHaveBeenCalled();
    expect(onGuardar).not.toHaveBeenCalled();
  });
});

describe("AssistenteFamilia: atributos e exclusões", () => {
  it("um erro do núcleo (combinação repetida) bloqueia o «Seguinte» com o motivo; escolher outro eixo desbloqueia", async () => {
    montar();
    await marcar(/Velar 50/, /Velar 60$/, /Velar 60 preta/);
    seguinte();
    await esperarAtivo("Seguinte");
    fireEvent.click(screen.getByRole("radio", { name: "Nenhum (sem bolinhas)" }));
    expect(botao("Seguinte")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status", { name: "Motivo" })).toHaveTextContent(/Para continuar: Os produtos .* têm os mesmos valores/);
    fireEvent.click(screen.getByRole("radio", { name: "Cor" }));
    expect(ativo(botao("Seguinte"))).toBe(true);
  });

  it("excluir um produto tira-o da família e o foco vai ao «Excluir» do vizinho", async () => {
    montar();
    await marcar(/Velar 50/, /Velar 60$/);
    seguinte();
    await waitFor(() => expect(botao("Excluir Lava-loiça Velar 50 da família")).toBeInTheDocument());
    fireEvent.click(botao("Excluir Lava-loiça Velar 50 da família"));
    await waitFor(() => expect(botao("Excluir Lava-loiça Velar 60 da família")).toHaveFocus());
  });

  it("excluir o último vizinho (o de baixo) leva o foco ao anterior", async () => {
    montar();
    await marcar(/Velar 50/, /Velar 60$/);
    seguinte();
    await waitFor(() => expect(botao("Excluir Lava-loiça Velar 60 da família")).toBeInTheDocument());
    fireEvent.click(botao("Excluir Lava-loiça Velar 60 da família"));
    await waitFor(() => expect(botao("Excluir Lava-loiça Velar 50 da família")).toHaveFocus());
  });

  it("excluir o único produto volta ao passo 1, com o foco no título", async () => {
    montar();
    await marcar(/Velar 50/);
    seguinte();
    await waitFor(() => expect(botao("Excluir Lava-loiça Velar 50 da família")).toBeInTheDocument());
    fireEvent.click(botao("Excluir Lava-loiça Velar 50 da família"));
    expect(estadoPasso()).toHaveTextContent("Passo 1 de 3");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("Nenhum produto escolhido");
    await waitFor(() => expect(titulo("Escolher produtos")).toHaveFocus());
  });
});

describe("AssistenteFamilia: foco no passo 1 ao remover e limpar", () => {
  it("«Remover … dos escolhidos» leva o foco ao «Remover» do vizinho", async () => {
    montar();
    await marcar(/Velar 50/, /Velar 60$/);
    fireEvent.click(botao("Remover Lava-loiça Velar 50 dos escolhidos"));
    await waitFor(() => expect(botao("Remover Lava-loiça Velar 60 dos escolhidos")).toHaveFocus());
  });

  it("remover o último escolhido leva o foco ao título do passo", async () => {
    montar();
    await marcar(/Velar 50/);
    fireEvent.click(botao("Remover Lava-loiça Velar 50 dos escolhidos"));
    await waitFor(() => expect(titulo("Escolher produtos")).toHaveFocus());
  });

  it("«Limpar seleção» leva o foco ao título do passo", async () => {
    montar();
    await marcar(/Velar 50/, /Velar 60$/);
    fireEvent.click(botao("Limpar seleção"));
    await waitFor(() => expect(titulo("Escolher produtos")).toHaveFocus());
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("Nenhum produto escolhido");
  });
});

describe("AssistenteFamilia: guardar", () => {
  const ate3 = async () => {
    const fn = montar();
    await marcar(/Velar 50/, /Velar 60$/, /Velar 60 preta/);
    seguinte();
    await esperarAtivo("Seguinte");
    seguinte();
    return fn;
  };

  it("«Guardar na sessão» entrega a família derivada e os produtos (objetos) escolhidos", async () => {
    const { onGuardar } = await ate3();
    fireEvent.click(botao("Guardar na sessão"));
    expect(onGuardar).toHaveBeenCalledTimes(1);
    const g: FamiliaGuardada = onGuardar.mock.calls[0][0];
    expect(g.familia).toMatchObject({ id: "fam:lava-loica-velar", nome: "Lava-loiça Velar", categoria: "Louças", eixos: { cor: "Cor", medida: ["Medida"] } });
    expect(g.familia.variantes).toHaveLength(3);
    expect(g.produtos.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("com erros que bloqueiam, «Guardar» fica aria-disabled, não guarda ao clicar e o motivo diz porquê", async () => {
    const z = produto("z", "Lava-loiça Velar 70");
    const existente: FamiliaGuardada = { familia: derivarFamilia(itensDosEscolhidos([z], new Map([["z", attrs(70, "o-branco")]]), DEFS, () => undefined), null).familia, produtos: [z] };
    const fn = montar({ familias: [existente] });
    await marcar(/Velar 50/, /Velar 60$/, /Velar 60 preta/);
    seguinte();
    await esperarAtivo("Seguinte");
    seguinte();
    expect(botao("Guardar na sessão")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status", { name: "Motivo" })).toHaveTextContent(/Para guardar: Já existe uma família com o identificador/);
    fireEvent.click(botao("Guardar na sessão"));
    expect(fn.onGuardar).not.toHaveBeenCalled();
  });

  it("editar: abre com os produtos e os eixos da família, e o seu identificador não conta como repetido", async () => {
    const ps = [produto("a", "Lava-loiça Velar 50", { pvp: 150 }), produto("b", "Lava-loiça Velar 60", { pvp: 180 })];
    const lidos = new Map<string, AtributoProduto[]>([["a", POR_ID.a], ["b", POR_ID.b]]);
    const existente: FamiliaGuardada = { familia: derivarFamilia(itensDosEscolhidos(ps, lidos, DEFS, () => "Louças"), null).familia, produtos: ps };
    const { onGuardar } = montar({ editar: existente, familias: [existente] });
    expect(await screen.findByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("2 escolhidos");
    seguinte();
    await esperarAtivo("Seguinte");
    seguinte();
    fireEvent.click(botao("Guardar na sessão"));
    expect(onGuardar).toHaveBeenCalled();
    expect(onGuardar.mock.calls[0][0].familia.id).toBe(existente.familia.id);
  });
});
