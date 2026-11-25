// 24/11: o zoom da pré-visualização 3D do produto: botões «Aproximar», «Afastar» e «Repor vista» (alvos de 44 px), a roda do rato só depois de clicar ou focar o 3D
// (e só com o rato lá dentro, para a página continuar a rolar), as teclas + e − com o foco, e a ajuda. O Visualizador3D está simulado (jsdom não tem WebGL): ele entrega
// os comandos e mostra o que recebeu; que a câmara se mexe de facto, e os limites, vê-se ao vivo (ver as capturas) e o cálculo dos limites está em previaProduto3d.test.ts.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cmd = vi.hoisted(() => ({ aproximar: vi.fn(), afastar: vi.fn(), repor: vi.fn() }));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; zoomRoda?: boolean; rolarPagina?: boolean; comandos?: { current: unknown }; camara?: { distMin?: number; distMax?: number } | null }) => {
    if (p.comandos) p.comandos.current = cmd;
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-roda={String(p.zoomRoda)} data-rolar={String(p.rolarPagina)} data-min={p.camara?.distMin} data-max={p.camara?.distMax} />;
  },
}));

import { Previa3DProduto } from "./Previa3DProduto";

beforeEach(() => { cmd.aproximar.mockClear(); cmd.afastar.mockClear(); cmd.repor.mockClear(); });
afterEach(cleanup);

const montar = () => render(<Previa3DProduto nome="Coluna Suspensa AXIS 40x160x25" sub="Colunas" no={null} arvore={[]} medida={{ largura: 40, comprimento: 160, espessura: 25 }} />);
const grupo = () => screen.getByRole("group", { name: "Pré-visualização 3D do produto" });
const roda = async () => (await screen.findByTestId("canvas3d")).getAttribute("data-roda");

describe("Previa3DProduto: botões de zoom", () => {
  it("tem «Aproximar», «Afastar» e «Repor vista», com nome em português e alvo de 44 px (min-h-11 min-w-11)", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    for (const nome of ["Aproximar", "Afastar", "Repor vista"]) {
      const b = screen.getByRole("button", { name: nome });
      expect(b.className).toContain("min-h-11");
      expect(b.className).toContain("min-w-11");
    }
  });
  it("cada botão chama o seu comando", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
    fireEvent.click(screen.getByRole("button", { name: "Afastar" }));
    fireEvent.click(screen.getByRole("button", { name: "Repor vista" }));
    expect(cmd.aproximar).toHaveBeenCalledTimes(1);
    expect(cmd.afastar).toHaveBeenCalledTimes(1);
    expect(cmd.repor).toHaveBeenCalledTimes(1);
  });
  it("dá ao visualizador os limites do zoom da peça", async () => {
    montar();
    const c = await screen.findByTestId("canvas3d");
    expect(Number(c.getAttribute("data-min"))).toBeGreaterThan(0.25);
    expect(Number(c.getAttribute("data-max"))).toBeGreaterThan(Number(c.getAttribute("data-min")));
  });
});

describe("Previa3DProduto: a roda do rato só faz zoom depois de clicar no 3D, para a página continuar a rolar", () => {
  it("por omissão a roda não faz zoom (e o 3D continua a deixar a página rolar)", async () => {
    montar();
    expect(await roda()).toBe("false");
    expect((await screen.findByTestId("canvas3d")).getAttribute("data-rolar")).toBe("true");
  });
  it("só passar o rato por cima não liga a roda", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    fireEvent.pointerEnter(grupo());
    expect(await roda()).toBe("false");
  });
  it("clicar no 3D (com o rato lá dentro) liga a roda; sair com o rato desliga; voltar a entrar volta a ligar", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    fireEvent.pointerDown(grupo());
    expect(grupo()).toHaveFocus();
    expect(await roda()).toBe("true");
    fireEvent.pointerLeave(grupo());
    expect(await roda()).toBe("false");
    fireEvent.pointerEnter(grupo());
    expect(await roda()).toBe("true");
  });
  it("perder o foco desliga a roda", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    fireEvent.pointerDown(grupo());
    expect(await roda()).toBe("true");
    fireEvent.blur(grupo());
    expect(await roda()).toBe("false");
  });
  it("passar o foco para um botão dos controlos desliga a roda (o foco saiu do 3D)", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    fireEvent.pointerDown(grupo());
    screen.getByRole("button", { name: "Aproximar" }).focus();
    expect(await roda()).toBe("false");
  });
});

describe("Previa3DProduto: as teclas + e − (com o foco no 3D) e a ajuda", () => {
  it("«+» e «=» aproximam; «-» e «_» afastam; os botões não precisam de foco", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    fireEvent.keyDown(grupo(), { key: "+" });
    fireEvent.keyDown(grupo(), { key: "=" });
    expect(cmd.aproximar).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(grupo(), { key: "-" });
    fireEvent.keyDown(grupo(), { key: "_" });
    expect(cmd.afastar).toHaveBeenCalledTimes(2);
  });
  it("com Ctrl, Alt ou Meta (zoom do navegador, atalhos) não faz nada; outras teclas também não", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    fireEvent.keyDown(grupo(), { key: "+", ctrlKey: true });
    fireEvent.keyDown(grupo(), { key: "-", metaKey: true });
    fireEvent.keyDown(grupo(), { key: "a" });
    expect(cmd.aproximar).not.toHaveBeenCalled();
    expect(cmd.afastar).not.toHaveBeenCalled();
  });
  it("a ajuda diz «Clique no 3D para usar a roda do rato» e, com o foco, que a roda e as teclas aproximam e afastam", async () => {
    montar();
    await screen.findByTestId("canvas3d");
    expect(screen.getByText("Clique no 3D para usar a roda do rato.")).toBeInTheDocument();
    fireEvent.pointerDown(grupo());
    expect(screen.getByText(/Roda do rato, ou as teclas/)).toBeInTheDocument();
    expect(grupo()).toHaveAttribute("aria-describedby", screen.getByText(/Roda do rato, ou as teclas/).id);
  });
});
