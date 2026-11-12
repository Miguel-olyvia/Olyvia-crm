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
const juntarFamilia = (id: string) => {
  fireEvent.change(screen.getByLabelText("Família"), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: /^Juntar a família/ }));
};
const partes = () => screen.queryAllByRole("listitem").filter((li) => li.closest("ul")?.getAttribute("aria-label") === "Partes da composição");

describe("PainelComposicaoLivre", () => {
  it("avisa que é só no ecrã e começa vazio, sem poder pôr na planta", () => {
    montar();
    expect(screen.getByText("Protótipo: composição só no ecrã, não é guardada na base")).toBeInTheDocument();
    expect(partes()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Pôr a composição na planta/ })).toBeDisabled();
  });

  it("junta famílias, mostra nome, SKU e preço, e soma o total", () => {
    montar();
    juntarFamilia(lava.id); juntarFamilia(torn.id);
    expect(partes()).toHaveLength(2);
    const v = resolverVariante(lava);
    expect(within(partes()[0]).getByText(new RegExp(v.sku))).toBeInTheDocument();
    expect(screen.getByText(`Total: ${eur2(resolverVariante(lava).preco + resolverVariante(torn).preco)}`)).toBeInTheDocument();
  });

  it("remove uma parte e o total acompanha", () => {
    montar();
    juntarFamilia(lava.id); juntarFamilia(torn.id);
    fireEvent.click(within(partes()[0]).getByRole("button", { name: /^Remover/ }));
    expect(partes()).toHaveLength(1);
    expect(screen.getByText(`Total: ${eur2(resolverVariante(torn).preco)}`)).toBeInTheDocument();
  });

  it("um produto do catálogo sem preço fica visível como «sem preço» e não some do total", () => {
    montar();
    juntarFamilia(lava.id);
    const nome = produtos.find((m) => !m.fam && m.tipo !== "porta" && m.tipo !== "janela")!.nome;
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto do catálogo" }), { target: { value: nome } });
    fireEvent.click(screen.getAllByRole("button", { name: /^Juntar produto/ })[0]);
    expect(partes()).toHaveLength(2);
    expect(within(partes()[1]).getByText("sem preço")).toBeInTheDocument();
    expect(screen.getByText(/1 sem preço/)).toBeInTheDocument();
    expect(screen.getByText(`Total: ${eur2(resolverVariante(lava).preco)}`)).toBeInTheDocument();
  });

  it("«Pôr a composição na planta» chama o callback com as partes, por ordem", () => {
    const onPor = montar();
    juntarFamilia(lava.id); juntarFamilia(torn.id);
    fireEvent.click(screen.getByRole("button", { name: /Pôr a composição na planta/ }));
    expect(onPor).toHaveBeenCalledTimes(1);
    const arg = onPor.mock.calls[0][0] as { modelo: { fam?: { familiaId: string } } }[];
    expect(arg.map((p) => p.modelo.fam?.familiaId)).toEqual([lava.id, torn.id]);
  });

  it("escolher outro acabamento muda a variante da parte juntada", () => {
    montar();
    const alvo = FAMILIAS.find((f) => f.categoria === "torneiras" && f.htmlModelo && f.acabamentos.length > 1)!;
    fireEvent.change(screen.getByLabelText("Família"), { target: { value: alvo.id } });
    const ac = alvo.acabamentos[1];
    fireEvent.change(screen.getByLabelText("Acabamento"), { target: { value: ac.id } });
    fireEvent.click(screen.getByRole("button", { name: /^Juntar a família/ }));
    expect(within(partes()[0]).getByText(new RegExp(resolverVariante(alvo, undefined, ac.id).sku))).toBeInTheDocument();
  });
});
