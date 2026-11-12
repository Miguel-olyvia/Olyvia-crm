import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { comDemonstracao, produtosParaEspaco } from "./catalogo3d";
import { FAMILIAS, resolverVariante } from "./familias";
import { PainelComposicaoLivre } from "./PainelComposicaoLivre";

afterEach(cleanup);
const K = catalogo0();
const produtos = produtosParaEspaco(comDemonstracao(K.produtos, K.arvore), K.arvore, "cozinha", { max: 100000 });
const lava = FAMILIAS.find((f) => f.categoria === "lavaloicas" && f.htmlModelo)!;
const torn = FAMILIAS.find((f) => f.categoria === "torneiras" && f.htmlModelo)!;
const eur2 = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" }).replace(/\s/g, " "); // o texto do ecrã chega normalizado (o espaço duro vira espaço)
const montar = () => { const onPor = vi.fn(); render(<PainelComposicaoLivre produtos={produtos} onPor={onPor} />); return onPor; };
const ROTULO: Record<string, string> = { lavaloicas: "Lava-loiças", torneiras: "Torneiras", placas: "Placas" };
const seguinte = () => screen.getByRole("button", { name: "Seguinte" });
const anterior = () => screen.getByRole("button", { name: "Anterior" });
const barra = () => screen.getByText(/^Passo \d de 4 · /).textContent;
/** Passo 1 (escolhe o grupo) → 2 (escolhe a família e junta) → fica no passo 3. */
const juntarFamilia = (f: { id: string; categoria: string }) => {
  fireEvent.click(screen.getByRole("button", { name: ROTULO[f.categoria] }));
  fireEvent.click(seguinte());
  fireEvent.change(screen.getByLabelText("Família"), { target: { value: f.id } });
  fireEvent.click(screen.getByRole("button", { name: /^Juntar a família/ }));
};
const partes = () => screen.queryAllByRole("listitem").filter((li) => li.closest("ul")?.getAttribute("aria-label") === "Partes da composição");
const nomeSemPreco = () => produtos.find((m) => !m.fam && m.tipo !== "porta" && m.tipo !== "janela")!.nome;

describe("PainelComposicaoLivre (assistente por passos)", () => {
  it("avisa que é só no ecrã e começa no passo 1, com um único passo visível", () => {
    montar();
    expect(screen.getByText("Protótipo: composição só no ecrã, não é guardada na base")).toBeInTheDocument();
    expect(barra()).toBe("Passo 1 de 4 · Escolher o produto");
    expect(screen.getByRole("heading", { name: "Escolher o produto" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.queryByLabelText("Família")).toBeNull();
    expect(screen.queryByRole("list", { name: "Partes da composição" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pôr a composição na planta/ })).toBeNull();
  });

  it("Seguinte fica desactivado com o motivo escrito enquanto não se escolhe nada, e Anterior também no passo 1", () => {
    montar();
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText("Escolha um produto")).toBeInTheDocument();
    expect(seguinte()).toHaveAccessibleDescription("Escolha um produto");
    expect(anterior()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Torneiras" }));
    expect(seguinte()).toBeEnabled();
    expect(screen.queryByText("Escolha um produto")).toBeNull();
  });

  it("percorre 1 → 2 → 3 → 4 com um só passo visível de cada vez", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Lava-loiças" }));
    fireEvent.click(seguinte());
    expect(barra()).toBe("Passo 2 de 4 · Medida e acabamento");
    expect(screen.getByLabelText("Acabamento")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText("Junte a variante para continuar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Juntar a família/ }));
    expect(barra()).toBe("Passo 3 de 4 · Rever a composição");
    expect(partes()).toHaveLength(1);
    expect(screen.queryByLabelText("Acabamento")).toBeNull();
    fireEvent.click(seguinte());
    expect(barra()).toBe("Passo 4 de 4 · Pôr na planta");
    expect(screen.getByText(/1 parte na composição/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Partes da composição" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Seguinte" })).toBeNull();
  });

  it("os 4 marcadores trazem texto e só o passo actual tem aria-current=step", () => {
    montar();
    const marcadores = within(screen.getByRole("list", { name: "Passos da composição" })).getAllByRole("listitem");
    expect(marcadores).toHaveLength(4);
    expect(marcadores.map((m) => m.getAttribute("aria-current"))).toEqual(["step", null, null, null]);
    expect(marcadores[0]).toHaveAccessibleName("Passo 1: Escolher o produto (atual)");
    fireEvent.click(screen.getByRole("button", { name: "Placas" }));
    fireEvent.click(seguinte());
    const depois = within(screen.getByRole("list", { name: "Passos da composição" })).getAllByRole("listitem");
    expect(depois.map((m) => m.getAttribute("aria-current"))).toEqual([null, "step", null, null]);
    expect(depois[0]).toHaveAccessibleName("Passo 1: Escolher o produto (feito)");
  });

  it("ao mudar de passo o foco vai para o título do passo e a barra anuncia-o (role=status)", () => {
    montar();
    expect(screen.getByRole("status")).toHaveTextContent("Passo 1 de 4 · Escolher o produto");
    fireEvent.click(screen.getByRole("button", { name: "Torneiras" }));
    fireEvent.click(seguinte());
    const titulo = screen.getByRole("heading", { name: "Medida e acabamento" });
    expect(titulo).toHaveAttribute("tabindex", "-1");
    expect(titulo).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Passo 2 de 4 · Medida e acabamento");
    fireEvent.click(anterior());
    expect(screen.getByRole("heading", { name: "Escolher o produto" })).toHaveFocus();
  });

  it("Anterior mantém o estado: o grupo, a família e o acabamento escolhidos, e as partes já juntadas", () => {
    montar();
    const alvo = FAMILIAS.find((f) => f.categoria === "torneiras" && f.htmlModelo && f.acabamentos.length > 1)!;
    fireEvent.click(screen.getByRole("button", { name: "Torneiras" }));
    fireEvent.click(seguinte());
    fireEvent.change(screen.getByLabelText("Família"), { target: { value: alvo.id } });
    fireEvent.change(screen.getByLabelText("Acabamento"), { target: { value: alvo.acabamentos[1].id } });
    fireEvent.click(anterior());
    expect(screen.getByRole("button", { name: "Torneiras" })).toHaveAttribute("aria-pressed", "true");
    expect(seguinte()).toBeEnabled();
    fireEvent.click(seguinte());
    expect((screen.getByLabelText("Família") as HTMLSelectElement).value).toBe(alvo.id);
    expect((screen.getByLabelText("Acabamento") as HTMLSelectElement).value).toBe(alvo.acabamentos[1].id);
    fireEvent.click(screen.getByRole("button", { name: /^Juntar a família/ }));
    fireEvent.click(anterior());
    fireEvent.click(anterior());
    fireEvent.click(seguinte());
    expect(seguinte()).toBeEnabled(); // já há uma parte: pode seguir sem juntar outra
    fireEvent.click(seguinte());
    expect(partes()).toHaveLength(1);
    expect(screen.getByText(`Total: ${eur2(resolverVariante(alvo, undefined, alvo.acabamentos[1].id).preco)}`)).toBeInTheDocument();
  });

  it("«Juntar mais um produto» volta ao passo 1 sem perder as partes", () => {
    montar();
    juntarFamilia(lava);
    fireEvent.click(screen.getByRole("button", { name: "Juntar mais um produto" }));
    expect(barra()).toBe("Passo 1 de 4 · Escolher o produto");
    expect(seguinte()).toBeDisabled();
    juntarFamilia(torn);
    expect(barra()).toBe("Passo 3 de 4 · Rever a composição");
    expect(partes()).toHaveLength(2);
  });

  it("no passo 3 mostra nome, SKU e preço, soma o total no rodapé e deixa remover", () => {
    montar();
    juntarFamilia(lava);
    fireEvent.click(screen.getByRole("button", { name: "Juntar mais um produto" }));
    juntarFamilia(torn);
    expect(partes()).toHaveLength(2);
    expect(within(partes()[0]).getByText(new RegExp(resolverVariante(lava).sku))).toBeInTheDocument();
    expect(screen.getByText(`Total: ${eur2(resolverVariante(lava).preco + resolverVariante(torn).preco)}`)).toBeInTheDocument();
    fireEvent.click(within(partes()[0]).getByRole("button", { name: /^Remover/ }));
    expect(partes()).toHaveLength(1);
    expect(screen.getByText(`Total: ${eur2(resolverVariante(torn).preco)}`)).toBeInTheDocument();
  });

  it("o total só aparece a partir do passo 3", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Lava-loiças" }));
    expect(screen.queryByText(/^Total:/)).toBeNull();
    fireEvent.click(seguinte());
    expect(screen.queryByText(/^Total:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Juntar a família/ }));
    expect(screen.getByText(/^Total:/)).toBeInTheDocument();
    fireEvent.click(seguinte());
    expect(screen.getByText(/^Total:/)).toBeInTheDocument();
  });

  it("removendo a última parte no passo 3, Seguinte fica desactivado com o motivo", () => {
    montar();
    juntarFamilia(lava);
    fireEvent.click(within(partes()[0]).getByRole("button", { name: /^Remover/ }));
    expect(partes()).toHaveLength(0);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText("Junte pelo menos um produto")).toBeInTheDocument();
  });

  it("um produto do catálogo (pesquisa, máx. 8) sem preço fica visível como «sem preço» e não some do total", () => {
    montar();
    juntarFamilia(lava);
    fireEvent.click(screen.getByRole("button", { name: "Juntar mais um produto" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto do catálogo" }), { target: { value: nomeSemPreco() } });
    expect(screen.getAllByRole("button", { name: /^Escolher produto/ }).length).toBeLessThanOrEqual(8);
    fireEvent.click(screen.getAllByRole("button", { name: /^Escolher produto/ })[0]);
    fireEvent.click(seguinte());
    expect(barra()).toBe("Passo 2 de 4 · Medida e acabamento");
    expect(screen.queryByLabelText("Acabamento")).toBeNull(); // só o resumo, sem selects
    fireEvent.click(screen.getByRole("button", { name: /^Juntar produto/ }));
    expect(barra()).toBe("Passo 3 de 4 · Rever a composição");
    expect(partes()).toHaveLength(2);
    expect(within(partes()[1]).getByText("sem preço")).toBeInTheDocument();
    expect(screen.getByText(/1 sem preço/)).toBeInTheDocument();
    expect(screen.getByText(`Total: ${eur2(resolverVariante(lava).preco)}`)).toBeInTheDocument();
  });

  it("a pesquisa sem resultados avisa", () => {
    montar();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzxxxqqq" } });
    expect(screen.getByText("Nenhum produto serve a pesquisa.")).toBeInTheDocument();
    expect(seguinte()).toBeDisabled();
  });

  it("o botão do passo 4 chama o callback com as partes, por ordem", () => {
    const onPor = montar();
    juntarFamilia(lava);
    fireEvent.click(screen.getByRole("button", { name: "Juntar mais um produto" }));
    juntarFamilia(torn);
    fireEvent.click(seguinte());
    expect(onPor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pôr a composição na planta" }));
    expect(onPor).toHaveBeenCalledTimes(1);
    const arg = onPor.mock.calls[0][0] as { modelo: { fam?: { familiaId: string } } }[];
    expect(arg.map((p) => p.modelo.fam?.familiaId)).toEqual([lava.id, torn.id]);
  });

  it("Escape não fecha nem salta o painel: só recua um passo e não borbulha", () => {
    const aoEscape = vi.fn();
    const onPor = vi.fn();
    render(<div onKeyDown={aoEscape}><PainelComposicaoLivre produtos={produtos} onPor={onPor} /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Lava-loiças" }));
    fireEvent.click(seguinte());
    fireEvent.keyDown(screen.getByLabelText("Acabamento"), { key: "Escape" });
    expect(aoEscape).not.toHaveBeenCalled();
    expect(barra()).toBe("Passo 1 de 4 · Escolher o produto");
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(barra()).toBe("Passo 1 de 4 · Escolher o produto");
    expect(onPor).not.toHaveBeenCalled();
  });

  it("escolher outro acabamento muda a variante da parte juntada", () => {
    montar();
    const alvo = FAMILIAS.find((f) => f.categoria === "torneiras" && f.htmlModelo && f.acabamentos.length > 1)!;
    fireEvent.click(screen.getByRole("button", { name: "Torneiras" }));
    fireEvent.click(seguinte());
    fireEvent.change(screen.getByLabelText("Família"), { target: { value: alvo.id } });
    const ac = alvo.acabamentos[1];
    fireEvent.change(screen.getByLabelText("Acabamento"), { target: { value: ac.id } });
    fireEvent.click(screen.getByRole("button", { name: /^Juntar a família/ }));
    expect(within(partes()[0]).getByText(new RegExp(resolverVariante(alvo, undefined, ac.id).sku))).toBeInTheDocument();
  });
});
