// 23/11: o «Modelo 3D» do formulário de produto (criar e ficha): fechado não monta nada nem carrega o three; «Ver em 3D» abre o canvas (um só), fechar
// desmonta-o; sem modelo parecido avisa; se o 3D falhar, diz-o em texto. O Visualizador3D está simulado (jsdom não tem WebGL).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const ctl = vi.hoisted(() => ({ importado: false, falhar: false }));
vi.mock("./planta3d/Visualizador3D", () => {
  ctl.importado = true;
  return {
    default: (p: { espaco: { pecas: { largura: number; nome?: string; produtoId: string }[] }; modelos: Record<string, { mockup3d: { cor: string } }>; descricao: string }) => {
      if (ctl.falhar) throw new Error("sem WebGL");
      const peca = p.espaco.pecas[0];
      return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-largura={peca.largura} data-nome={peca.nome} data-cor={p.modelos[peca.produtoId].mockup3d.cor} />;
    },
  };
});

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
  it("fechado: o botão «Ver em 3D» está recolhido e não há canvas nem o three carregado", () => {
    render(secao());
    const b = screen.getByRole("button", { name: "Ver em 3D" });
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(ctl.importado).toBe(false);
    expect(screen.getByText(/Só para ver/)).toBeInTheDocument();
  });
  it("abrir monta um só canvas; fechar desmonta-o", async () => {
    render(secao());
    abrir();
    expect(await screen.findByTestId("canvas3d")).toBeInTheDocument();
    expect(screen.getAllByTestId("canvas3d")).toHaveLength(1);
    const b = screen.getByRole("button", { name: "Fechar o 3D" });
    expect(b).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(b);
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(screen.getByRole("button", { name: "Ver em 3D" })).toHaveAttribute("aria-expanded", "false");
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
    const aviso = screen.getByText("Sem modelo 3D parecido: aparece uma caixa com as medidas.");
    expect(aviso).toHaveAttribute("role", "status");
  });
  it("desenho aproximado: o 3D aparece com uma nota própria, e não a da caixa", async () => {
    render(secao("Lava-loiça 1 cuba inox"));
    abrir();
    await screen.findByTestId("canvas3d");
    expect(screen.queryByText(/Sem modelo 3D parecido/)).toBeNull();
    expect(screen.getByText(/desenho aproximado/i)).toHaveAttribute("role", "status");
  });
  it("as medidas e a cor dos atributos chegam ao visualizador (mm passa a cm)", async () => {
    const attrs: AtributoProduto[] = [...MEDIDA, { atributoId: "a-cor", opcaoId: "o-verde", valor: "Verde" }];
    render(secao("Sanita suspensa Rimless", { attrs, defs: DEFS }));
    abrir();
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-largura")).toBe("0.6");
    expect(c.getAttribute("data-cor")).toBe("#00aa00");
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
  it("nome vazio não rebenta: abre com a caixa e o aviso", async () => {
    render(secao(""));
    abrir();
    await screen.findByTestId("canvas3d");
    expect(screen.getByText(/Sem modelo 3D parecido/)).toBeInTheDocument();
  });
});

describe("Previa3DProduto: se o 3D falhar, fica um texto e o resto não parte", () => {
  it("o visualizador a rebentar mostra «Não foi possível mostrar o 3D neste dispositivo»", async () => {
    ctl.falhar = true;
    render(<Previa3DProduto nome="Sanita suspensa Rimless" no={null} arvore={ARVORE} />);
    const t = await screen.findByText("Não foi possível mostrar o 3D neste dispositivo");
    expect(t).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("canvas3d")).toBeNull();
  });
  it("medidas e cor dadas por props chegam ao visualizador", async () => {
    render(<Previa3DProduto nome="Parafuso" no={null} arvore={ARVORE} medidas={{ larguraCm: 12, profundidadeCm: 12, alturaCm: 12 }} cor="#123456" />);
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-largura")).toBe("0.12");
    expect(c.getAttribute("data-cor")).toBe("#123456");
  });
});
