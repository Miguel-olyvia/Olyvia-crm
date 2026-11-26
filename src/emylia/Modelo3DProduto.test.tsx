// 23/11: o «Modelo 3D» do formulário de produto (criar e ficha): fechado não monta nada; «Ver em 3D» abre o canvas (um só), fechar desmonta-o; sem modelo parecido
// avisa; se o 3D falhar (ou a conta do modelo rebentar), diz-o em texto e deixa tentar outra vez. O Visualizador3D está simulado (jsdom não tem WebGL): o que
// ele desenha só se verifica ao vivo; a lógica da cena (previaProduto3d.test.ts) corre sem mocks. Que o three só carrega ao abrir: Modelo3DLazy.test.tsx.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const ctl = vi.hoisted(() => ({ falhar: false }));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { espaco: { pecas: { largura: number; profundidade: number; nome?: string; produtoId: string }[] }; modelos: Record<string, { mockup3d: { cor: string } }>; descricao: string; rolarPagina?: boolean }) => {
    if (ctl.falhar) throw new Error("sem WebGL");
    const peca = p.espaco.pecas[0];
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-largura={peca.largura} data-profundidade={peca.profundidade} data-nome={peca.nome} data-cor={p.modelos[peca.produtoId].mockup3d.cor} data-rolar={String(p.rolarPagina)} />;
  },
}));

import { Modelo3DProduto } from "./Modelo3DProduto";
import { Previa3DProduto } from "./Previa3DProduto";

const ARVORE = [{ id: "c1", n: "Casa de banho", pai: null }, { id: "s1", n: "Sanitas", pai: "c1" }];
const MEDIDA: AtributoProduto[] = [{ atributoId: "a-med", medida: { tipo: "3D", largura: 600, comprimento: 450, espessura: 800, unidade: "mm" } }];
const DEFS: AtributoDef[] = [
  { id: "a-med", codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] },
  { id: "a-cor", codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: "o-verde", valor: "Verde", nome: "Verde", hex: "#00aa00", ordem: 1 }] },
];

beforeEach(() => { ctl.falhar = false; vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const secao = (nome = "Sanita suspensa Rimless", extra: Partial<Parameters<typeof Modelo3DProduto>[0]> = {}) =>
  <Modelo3DProduto nome={nome} sub={null} no={null} arvore={ARVORE} {...extra} />;
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));

describe("Modelo3DProduto: fechado por omissão, o 3D só arranca ao pedido", () => {
  it("fechado: o botão está recolhido e não há canvas", () => {
    render(secao());
    expect(screen.getByRole("button", { name: "Ver em 3D" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(screen.getByText(/Só para ver/)).toBeInTheDocument();
  });
  it("abrir monta um só canvas; voltar a clicar desmonta-o (o rótulo fica, muda o aria-expanded)", async () => {
    render(secao());
    abrir();
    expect(await screen.findByTestId("canvas3d")).toBeInTheDocument();
    expect(screen.getAllByTestId("canvas3d")).toHaveLength(1);
    const b = screen.getByRole("button", { name: "Ver em 3D" });
    expect(b).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(b);
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(screen.getByRole("button", { name: "Ver em 3D" })).toHaveAttribute("aria-expanded", "false");
  });
  it("o 3D deixa a roda do rato e o toque vertical para a página (é só uma pré-visualização num formulário longo)", async () => {
    render(secao());
    abrir();
    expect((await screen.findByTestId("canvas3d")).getAttribute("data-rolar")).toBe("true");
  });
  it("com modelo genérico não mostra o aviso de caixa", async () => {
    render(secao("Sanita suspensa Rimless"));
    abrir();
    await screen.findByTestId("canvas3d");
    expect(screen.queryByText(/Sem modelo 3D parecido/)).toBeNull();
  });
  it("sem modelo parecido mostra a caixa e o aviso visível (role=status)", async () => {
    render(secao("Parafuso"));
    abrir();
    await screen.findByTestId("canvas3d");
    expect(screen.getByText("Sem modelo 3D parecido: aparece uma caixa com as medidas.")).toHaveAttribute("role", "status");
  });
  it("desenho aproximado: o 3D aparece com uma nota própria, e não a da caixa", async () => {
    // 26/11: era «Lava-loiça 1 cuba inox», que na ficha passou ao genérico (só genéricos); o quadro não tem genérico
    render(secao("Quadro 60x40"));
    abrir();
    await screen.findByTestId("canvas3d");
    expect(screen.queryByText(/Sem modelo 3D parecido/)).toBeNull();
    expect(screen.getByText(/desenho aproximado/i)).toHaveAttribute("role", "status");
  });
  it("26/11: um modelo do catálogo 3D (HTML) escolhido no produto não se aplica na ficha, e o texto di-lo; um genérico escolhido não leva a nota", () => {
    const { unmount } = render(secao("Misturadoras Monocomando Extraivel ROUND", { modelo3d: "html_torneira_cozinha" }));
    expect(screen.getByTestId("modelo3d-origem")).toHaveTextContent(/usa só os modelos genéricos/);
    unmount();
    render(secao("Peça X", { modelo3d: "bide" }));
    expect(screen.getByTestId("modelo3d-origem")).not.toHaveTextContent(/usa só os modelos genéricos/);
  });
  it("as medidas e a cor dos atributos chegam ao visualizador (mm passa a cm)", async () => {
    const attrs: AtributoProduto[] = [...MEDIDA, { atributoId: "a-cor", opcaoId: "o-verde", valor: "Verde" }];
    render(secao("Sanita suspensa Rimless", { attrs, defs: DEFS }));
    abrir();
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-largura")).toBe("0.6");
    expect(c.getAttribute("data-cor")).toBe("#00aa00");
  });
  it("a medida reparte-se pelo tipo: numa banheira 70 × 170 a largura é 170 e a profundidade 70", async () => {
    const attrs: AtributoProduto[] = [{ atributoId: "a-med", medida: { tipo: "2D", largura: 70, comprimento: 170, espessura: null, unidade: "cm" } }];
    render(secao("Banheira Oval", { attrs, defs: DEFS }));
    abrir();
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-largura")).toBe("1.7");
    expect(c.getAttribute("data-profundidade")).toBe("0.7");
  });
  it("tem um texto alternativo com as medidas (para quem não vê o 3D)", async () => {
    render(secao("Sanita suspensa Rimless", { attrs: MEDIDA, defs: DEFS }));
    abrir();
    expect(await screen.findByRole("img", { name: /Sanita suspensa Rimless: 60 por 45 por 80 cm/ })).toBeInTheDocument();
  });
  it("ao escrever o nome o 3D espera um instante antes de se refazer", async () => {
    const { rerender } = render(secao("Sanita suspensa Rimless"));
    abrir();
    expect((await screen.findByTestId("canvas3d")).getAttribute("data-nome")).toBe("Sanita suspensa Rimless");
    rerender(secao("Sanita suspensa Rimless Pro"));
    expect(screen.getByTestId("canvas3d").getAttribute("data-nome")).toBe("Sanita suspensa Rimless");
    await waitFor(() => expect(screen.getByTestId("canvas3d").getAttribute("data-nome")).toBe("Sanita suspensa Rimless Pro"), { timeout: 2000 });
  });
  it("ao escrever as medidas (e ao escolher a cor) o 3D também espera, em vez de se refazer a cada dígito", async () => {
    const medida = (largura: number): AtributoProduto[] => [{ atributoId: "a-med", medida: { tipo: "2D", largura, comprimento: 45, espessura: null, unidade: "cm" } }];
    const { rerender } = render(secao("Sanita suspensa Rimless", { attrs: medida(40), defs: DEFS }));
    abrir();
    expect((await screen.findByTestId("canvas3d")).getAttribute("data-largura")).toBe("0.4");
    rerender(secao("Sanita suspensa Rimless", { attrs: [...medida(41), { atributoId: "a-cor", opcaoId: "o-verde" }], defs: DEFS }));
    expect(screen.getByTestId("canvas3d").getAttribute("data-largura")).toBe("0.4");
    expect(screen.getByTestId("canvas3d").getAttribute("data-cor")).not.toBe("#00aa00");
    await waitFor(() => expect(screen.getByTestId("canvas3d").getAttribute("data-largura")).toBe("0.41"), { timeout: 2000 });
    expect(screen.getByTestId("canvas3d").getAttribute("data-cor")).toBe("#00aa00");
  });
  it("nome vazio não rebenta: abre com a caixa e o aviso", async () => {
    render(secao(""));
    abrir();
    await screen.findByTestId("canvas3d");
    expect(screen.getByText(/Sem modelo 3D parecido/)).toBeInTheDocument();
  });
});

describe("Previa3DProduto: se o 3D falhar, fica um texto e o resto não parte", () => {
  const MSG = "Não foi possível mostrar o 3D neste dispositivo";
  it("o visualizador a rebentar mostra o texto alternativo (role=status)", async () => {
    ctl.falhar = true;
    render(<Previa3DProduto nome="Sanita suspensa Rimless" no={null} arvore={ARVORE} />);
    expect(await screen.findByText(MSG)).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("canvas3d")).toBeNull();
  });
  it("a conta do modelo a rebentar (fora do visualizador) também fica no texto alternativo e não parte o formulário", async () => {
    render(<div><p>resto do formulário</p><Previa3DProduto nome={null as unknown as string} no={null} arvore={ARVORE} /></div>);
    expect(await screen.findByText(MSG)).toBeInTheDocument();
    expect(screen.getByText("resto do formulário")).toBeInTheDocument();
  });
  it("«Tentar outra vez» refaz o 3D (e o three, que ficou em cache a falhar)", async () => {
    ctl.falhar = true;
    render(<Previa3DProduto nome="Sanita suspensa Rimless" no={null} arvore={ARVORE} />);
    await screen.findByText(MSG);
    ctl.falhar = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(await screen.findByTestId("canvas3d")).toBeInTheDocument();
    expect(screen.queryByText(MSG)).toBeNull();
  });
  it("se continuar a falhar, o texto e o botão ficam", async () => {
    ctl.falhar = true;
    render(<Previa3DProduto nome="Sanita suspensa Rimless" no={null} arvore={ARVORE} />);
    await screen.findByText(MSG);
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(await screen.findByText(MSG)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar outra vez" })).toBeInTheDocument();
  });
  it("fechar e abrir outra vez depois de uma falha volta a tentar", async () => {
    ctl.falhar = true;
    render(secao());
    abrir();
    await screen.findByText(MSG);
    abrir(); // fecha
    ctl.falhar = false;
    abrir();
    expect(await screen.findByTestId("canvas3d")).toBeInTheDocument();
  });
  it("medida e cor dadas por props chegam ao visualizador", async () => {
    render(<Previa3DProduto nome="Parafuso" no={null} arvore={ARVORE} medida={{ largura: 12, comprimento: 12, espessura: 12 }} cor="#123456" />);
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-largura")).toBe("0.12");
    expect(c.getAttribute("data-cor")).toBe("#123456");
  });
});
