// O cartão de pré-visualização: bolinhas de cor com o hex da opção (nome acessível), seletor de medida, e o SKU e o preço do produto da variante escolhida.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";
import { CartaoFamiliaPreview } from "./CartaoFamiliaPreview";
import { derivarFamilia, itensDosEscolhidos } from "./derivarFamilia";
import { A_COR, A_MED, DEFS, attrs, produto } from "./fixturesFamilias";

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

  it("as faixas de medida são opções do seletor, com o texto da faixa, e escolher uma muda o SKU e o preço", () => {
    const faixa = (de: number, ate: number): AtributoProduto[] => [{ atributoId: A_MED, medida: { tipo: "2D", largura: { de, ate }, comprimento: 70, espessura: null, unidade: "cm" } }];
    const ps = [produto("f2", "Armário 31 a 40", { pvp: 210 }), produto("f1", "Armário 0 a 30", { pvp: 200 })];
    const lidos = new Map<string, AtributoProduto[]>([["f2", faixa(31, 40)], ["f1", faixa(0, 30)]]);
    const f = derivarFamilia(itensDosEscolhidos(ps, lidos, DEFS, () => undefined), { cor: null, medida: ["Medida"] }).familia;
    render(<CartaoFamiliaPreview familia={f} />);
    expect(medida("0–30 × 70 cm")).toBeChecked();
    fireEvent.click(medida("31–40 × 70 cm"));
    expect(screen.getByRole("group", { name: "Pré-visualização da família" })).toHaveTextContent("SKU-f2");
  });

  it("sem atributo de cor não há bolinhas (só a medida)", () => {
    const f = derivarFamilia(itensDosEscolhidos([P[0], P[2]], LIDOS, DEFS, () => undefined), { cor: null, medida: ["Medida"] }).familia;
    render(<CartaoFamiliaPreview familia={f} />);
    expect(screen.queryByRole("radiogroup", { name: "Cor" })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  describe("o eixo do papel «cor» sem nenhuma cor definida (ex.: «Medida» escolhida para as bolinhas)", () => {
    // a «Medida» como atributo das «bolinhas»: valores em texto («Largura 50 cm»), nenhum com hex
    const LARG = [50, 60, 70, 80];
    const ps = LARG.map((l) => produto(`m${l}`, `Espelho ${l}`, { pvp: l }));
    const lidos = new Map<string, AtributoProduto[]>(LARG.map((l) => [`m${l}`, attrs(l, null)]));
    const porMedida = () => derivarFamilia(itensDosEscolhidos(ps, lidos, DEFS, () => undefined), { cor: "Medida", medida: [] }).familia;

    it("desenha botões de texto com o nome de cada valor, sem bolinhas nem «?»", () => {
      render(<CartaoFamiliaPreview familia={porMedida()} />);
      const grupo = screen.getByRole("radiogroup", { name: "Medida" });
      const botoes = within(grupo).getAllByRole("radio");
      expect(botoes.map((b) => b.textContent?.replace("✓", ""))).toEqual(["Largura 50 cm", "Largura 60 cm", "Largura 70 cm", "Largura 80 cm"]);
      expect(within(grupo).getByRole("radio", { name: "Largura 50 cm" })).toBeChecked();
      expect(grupo).not.toHaveTextContent("?");
      expect(grupo.querySelectorAll("span[style]")).toHaveLength(0);
      botoes.forEach((b) => expect(b.className).toContain("min-h-11"));
      expect(screen.queryByRole("radio", { name: /sem cor definida/ })).toBeNull();
    });

    it("o título do eixo mantém-se e escolher um valor muda o produto, com visto só no escolhido", () => {
      render(<CartaoFamiliaPreview familia={porMedida()} />);
      const cartao = screen.getByRole("group", { name: "Pré-visualização da família" });
      expect(cartao).toHaveTextContent("Medida: Largura 50 cm");
      fireEvent.click(screen.getByRole("radio", { name: "Largura 70 cm" }));
      expect(cartao).toHaveTextContent("Medida: Largura 70 cm");
      expect(cartao).toHaveTextContent("SKU-m70");
      expect(screen.getByRole("radio", { name: "Largura 70 cm" })).toHaveTextContent("✓");
      expect(screen.getByRole("radio", { name: "Largura 50 cm" })).not.toHaveTextContent("✓");
    });

    it("as setas movem a escolha entre os botões de texto", () => {
      render(<CartaoFamiliaPreview familia={porMedida()} />);
      fireEvent.keyDown(screen.getByRole("radio", { name: "Largura 50 cm" }), { key: "ArrowRight" });
      expect(screen.getByRole("radio", { name: "Largura 60 cm" })).toBeChecked();
    });

    it("com pelo menos uma cor definida continuam as bolinhas (e a que não tem hex fica tracejada com «?»)", () => {
      render(<CartaoFamiliaPreview familia={familia()} />);
      expect(cor("Branco")).toHaveStyle({ backgroundColor: "#F5F5F0" });
      expect(screen.getByRole("radio", { name: /Pedra/ })).toHaveTextContent("?");
    });
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

describe("CartaoFamiliaPreview: a foto da opção (foto > hex > nada)", () => {
  const CAMINHO = "org/11111111-1111-4111-a111-111111111111.webp";
  const DEFS_FOTO: AtributoDef[] = DEFS.map((d) => (d.id === A_COR ? { ...d, temFoto: true, opcoes: d.opcoes.map((o) => (o.id === "o-branco" ? { ...o, foto: CAMINHO } : o)) } : d));
  const comFoto = () => derivarFamilia(itensDosEscolhidos(P, LIDOS, DEFS_FOTO, () => "Louças"), null).familia;

  it("o núcleo leva a foto da opção para a cor da família; as cores sem foto não ganham a chave", () => {
    const f = comFoto();
    expect(f.cores.find((c) => c.nome === "Branco")?.foto).toBe(CAMINHO);
    expect(f.cores.find((c) => c.nome === "Preto")).not.toHaveProperty("foto");
    expect(familia().cores.every((c) => !("foto" in c))).toBe(true);
  });
  it("a bolinha com foto mostra a imagem (decorativa); o nome acessível não muda e o hex fica por baixo", () => {
    render(<CartaoFamiliaPreview familia={comFoto()} />);
    const bolinha = cor("Branco");
    const img = bolinha.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("src")).toContain(`catalogo-opcoes/${CAMINHO}`);
    expect(bolinha).toHaveAccessibleName("Branco");
    expect(cor("Preto").querySelector("img")).toBeNull();
    expect(cor("Preto")).toHaveStyle({ backgroundColor: "#000000" });
  });
  it("se a foto falhar, volta ao hex (a bolinha continua a ser a cor)", () => {
    render(<CartaoFamiliaPreview familia={comFoto()} />);
    const bolinha = cor("Branco");
    fireEvent.error(bolinha.querySelector("img") as HTMLImageElement);
    expect(bolinha.querySelector("img")).toBeNull();
    expect(bolinha).toHaveStyle({ backgroundColor: "#F5F5F0" });
  });
  it("uma cor só com foto (sem hex) deixa de ser «sem cor definida»", () => {
    const defs: AtributoDef[] = DEFS.map((d) => (d.id === A_COR ? { ...d, opcoes: d.opcoes.map((o) => (o.id === "o-pedra" ? { ...o, foto: CAMINHO } : o)) } : d));
    render(<CartaoFamiliaPreview familia={derivarFamilia(itensDosEscolhidos(P, LIDOS, defs, () => "Louças"), null).familia} />);
    const pedra = screen.getByRole("radio", { name: "Pedra" });
    expect(pedra.querySelector("img")).not.toBeNull();
  });
});
