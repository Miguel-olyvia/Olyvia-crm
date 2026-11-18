// O cartão de pré-visualização: bolinhas de cor com o hex da opção (nome acessível), seletor de medida, e o SKU e o preço do produto da variante escolhida.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { CartaoFamiliaPreview } from "./CartaoFamiliaPreview";
import { derivarFamilia, itensDosEscolhidos } from "./derivarFamilia";
import { DEFS, attrs, produto } from "./fixturesFamilias";

afterEach(cleanup);
// 50 Branco, 50 Preto, 60 Branco (não há 60 Preto), 60 Pedra (sem hex)
const P = [produto("p50b", "Velar 50 branca", { pvp: 100 }), produto("p50p", "Velar 50 preta", { pvp: 110 }), produto("p60b", "Velar 60 branca", { pvp: 130 }), produto("p60x", "Velar 60 pedra", { pvp: 140 })];
const LIDOS = new Map<string, AtributoProduto[]>([["p50b", attrs(50, "o-branco")], ["p50p", attrs(50, "o-preto")], ["p60b", attrs(60, "o-branco")], ["p60x", attrs(60, "o-pedra")]]);
const familia = (ids = P) => derivarFamilia(itensDosEscolhidos(ids, LIDOS, DEFS, () => "Louças"), null).familia;
const cor = (nome: string | RegExp) => screen.getByRole("radio", { name: nome });
const medida = (nome: string) => screen.getByRole("radio", { name: nome });

describe("CartaoFamiliaPreview", () => {
  it("mostra o nome, a marca e começa na primeira variante: SKU e preço do produto dela", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    expect(screen.getByRole("heading", { name: /Velar/ })).toBeInTheDocument();
    const cartao = screen.getByRole("group", { name: "Pré-visualização da família" });
    expect(cartao).toHaveTextContent("SKU-p50b");
    expect(cartao).toHaveTextContent("100,00 €");
    expect(cartao).toHaveTextContent("Velar 50 branca");
    expect(medida("Largura 50 cm")).toBeChecked();
    expect(cor("Branco")).toBeChecked();
  });

  it("as bolinhas têm o hex da opção e o nome como nome acessível; sem hex não se inventa cor", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    expect(cor("Branco")).toHaveStyle({ backgroundColor: "#F5F5F0" });
    expect(cor("Preto")).toHaveStyle({ backgroundColor: "#000000" });
    const pedra = screen.getByRole("radio", { name: /Pedra/ });
    expect(pedra).toHaveAccessibleName("Pedra (sem cor definida)");
    expect(pedra.getAttribute("style") ?? "").not.toMatch(/background/);
  });

  it("escolher a cor muda o SKU e o preço para os do produto dessa variante", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    fireEvent.click(cor("Preto"));
    const cartao = screen.getByRole("group", { name: "Pré-visualização da família" });
    expect(cartao).toHaveTextContent("SKU-p50p");
    expect(cartao).toHaveTextContent("110,00 €");
  });

  it("escolher a medida muda o produto; se a cor já não existe nessa medida, passa à primeira que existe", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    fireEvent.click(cor("Preto"));
    fireEvent.click(medida("Largura 60 cm"));
    expect(cor("Branco")).toBeChecked();
    expect(screen.getByRole("group", { name: "Pré-visualização da família" })).toHaveTextContent("SKU-p60b");
  });

  it("as cores que não existem na medida escolhida ficam aria-disabled (focáveis), com a razão", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    fireEvent.click(medida("Largura 60 cm"));
    expect(cor("Preto")).toHaveAttribute("aria-disabled", "true");
    expect(cor("Preto")).toHaveAccessibleDescription("Esta cor não existe nesta medida.");
    expect(cor("Preto")).toHaveAttribute("title", "Preto: esta cor não existe nesta medida.");
    expect(cor("Branco")).not.toHaveAttribute("aria-disabled", "true");
  });


  it("a cor dupla leva os dois hex (duas metades) e o nome", () => {
    const f = derivarFamilia(itensDosEscolhidos([P[0]], new Map([["p50b", attrs(50, "o-bp")]]), DEFS, () => undefined), null).familia;
    render(<CartaoFamiliaPreview familia={f} />);
    const b = screen.getByRole("radio", { name: "Branco/Preto" });
    // duas metades, pela ordem dos hex da opção
    const metades = Array.from(b.querySelectorAll("span[style]"));
    expect(metades).toHaveLength(2);
    expect(metades[0]).toHaveStyle({ backgroundColor: "#F5F5F0" });
    expect(metades[1]).toHaveStyle({ backgroundColor: "#000000" });
  });

  it("sem atributo de cor não há bolinhas (só a medida)", () => {
    const f = derivarFamilia(itensDosEscolhidos([P[0], P[2]], LIDOS, DEFS, () => undefined), { cor: null, medida: ["Medida"] }).familia;
    render(<CartaoFamiliaPreview familia={f} />);
    expect(screen.queryByRole("radiogroup", { name: "Cor" })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("uma família de um só produto mostra-o sem escolhas a fazer", () => {
    render(<CartaoFamiliaPreview familia={familia([P[0]])} />);
    expect(screen.getByRole("group", { name: "Pré-visualização da família" })).toHaveTextContent("SKU-p50b");
  });

  it("os seletores são grupos com nome (o do atributo escolhido) e a navegação por setas escolhe", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    expect(screen.getByRole("radiogroup", { name: "Cor" })).toBeInTheDocument();
    const grupo = screen.getByRole("radiogroup", { name: "Medida" });
    expect(within(grupo).getAllByRole("radio")).toHaveLength(2);
    fireEvent.keyDown(medida("Largura 50 cm"), { key: "ArrowRight" });
    expect(medida("Largura 60 cm")).toBeChecked();
  });

  it("clicar numa cor indisponível não a escolhe", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    fireEvent.click(medida("Largura 60 cm"));
    fireEvent.click(cor("Preto"));
    expect(cor("Preto")).not.toBeChecked();
    expect(cor("Branco")).toBeChecked();
  });

  it("as setas saltam as cores indisponíveis", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    fireEvent.click(medida("Largura 60 cm"));
    fireEvent.keyDown(cor("Branco"), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: /Pedra/ })).toBeChecked();
  });

  it("a bolinha escolhida leva um visto (não só a cor), e só ela", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    expect(cor("Branco")).toHaveTextContent("✓");
    expect(cor("Preto")).not.toHaveTextContent("✓");
    fireEvent.click(cor("Preto"));
    expect(cor("Preto")).toHaveTextContent("✓");
    expect(cor("Branco")).not.toHaveTextContent("✓");
  });

  it("com o foco numa bolinha, o nome dessa cor aparece à vista; ao sair volta o da escolhida", () => {
    render(<CartaoFamiliaPreview familia={familia()} />);
    fireEvent.focus(cor("Preto"));
    expect(screen.getByText("Preto", { selector: "p span" })).toBeInTheDocument();
    fireEvent.blur(cor("Preto"));
    expect(screen.getByText("Branco", { selector: "p span" })).toBeInTheDocument();
  });
});
