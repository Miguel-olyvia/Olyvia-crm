// 5/11 (Rúben, a visita real): a planta no ecrã. Desenha-se com o dedo; tocar no número de uma parede deixa escrever a medida; as peças
// juntam-se pela barra; «Usar nas medidas» põe os m² nas medidas. Tudo se grava em f.planta.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlantaDivisao } from "./PlantaDivisao";
import { lerPlanta, retangulo } from "./planta";
import type { Ctx } from "./pecas";
import type { Negocio } from "./motor";

afterEach(cleanup);
// jsdom não tem geometria: a planta mede 1 cm por píxel, a começar em (0,0)
beforeEach(() => {
  const ident = { inverse: () => ident } as unknown as DOMMatrix;
  Object.assign(SVGSVGElement.prototype, {
    getScreenCTM: () => ident,
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y }; } }),
    setPointerCapture: () => undefined,
  });
});

function montar(f: Record<string, string> = {}) {
  const campo = vi.fn((_id: number, k: string, v: string) => { d.f[k] = v; });
  const d = { id: 3, f: { ...f }, visita: { med: {} } } as unknown as Negocio;
  const ctx = { A: { campo }, run: (fn: () => void) => fn() } as unknown as Ctx;
  render(<PlantaDivisao ctx={ctx} d={d} divisao="Casa de banho" />);
  return { d, campo, tela: screen.getByRole("img", { name: /^Planta/ }) as unknown as SVGSVGElement };
}
const tracar = (tela: Element, de: [number, number], ate: [number, number]) => {
  const alvo = tela.querySelector("[data-tela]")!;
  fireEvent.pointerDown(alvo, { clientX: de[0], clientY: de[1], pointerId: 1 });
  fireEvent.pointerMove(tela, { clientX: ate[0], clientY: ate[1], pointerId: 1 });
  fireEvent.pointerUp(tela, { clientX: ate[0], clientY: ate[1], pointerId: 1 });
};

describe("PlantaDivisao", () => {
  it("vazia, pede para desenhar; quatro traços com o dedo fecham a planta e dão os m²", () => {
    const { d, tela } = montar();
    expect(screen.getByText("Ainda sem paredes.")).toBeInTheDocument();
    tracar(tela, [50, 50], [250, 55]);
    expect(lerPlanta(d.f.planta)?.paredes).toEqual([{ c: 200, r: "E" }]);
    tracar(tela, [0, 0], [250, 200]);   // continua de onde acabou (o toque pode ser noutro sítio)
    tracar(tela, [0, 0], [50, 200]);
    tracar(tela, [0, 0], [50, 60]);     // parou 10 cm antes do canto de partida: fecha
    expect(screen.getByText("A planta fecha.")).toBeInTheDocument();
    expect(screen.getByText("3 m²")).toBeInTheDocument();
  });

  it("tocar no número de uma parede deixa escrever a medida certa; se deixa de fechar, diz quanto falta", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }) });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Parede 1: 200 cm. Escrever a medida." }));
    const caixa = screen.getByLabelText("Parede 1, em cm");
    fireEvent.change(caixa, { target: { value: "250" } });
    fireEvent.blur(caixa);
    expect(lerPlanta(d.f.planta)?.paredes[0].c).toBe(250);
    expect(screen.getByText("Faltam 50 cm até ao canto de partida.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar nas medidas" })).toBeDisabled();
  });

  it("«Usar nas medidas» põe o chão e as paredes (pé-direito da visita, sem a porta) nas medidas", () => {
    const { d } = montar({ diag_pe_direito_m: "2,5 m", planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(234, 177), pecas: [] }) });
    fireEvent.keyDown(screen.getByRole("button", { name: "Porta" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Usar nas medidas" }));
    const med = (d as unknown as { visita: { med: Record<string, number> } }).visita.med;
    expect(med.pav).toBe(4.14);
    expect(med.par).toBe(Math.round((8.22 * 2.5 - 0.8 * 2) * 100) / 100);
    expect(screen.getByText(/Nas medidas: chão 4,14 m² e paredes/)).toBeInTheDocument();
  });

  it("uma peça junta-se pela barra, mexe-se com as setas e tira-se", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }) });
    // as peças genéricas ficam atrás de um botão quando o catálogo tem produtos para o espaço
    const genericas = screen.queryByRole("button", { name: /peças genéricas/ });
    if (genericas) fireEvent.click(genericas);
    fireEvent.keyDown(screen.getByRole("button", { name: "Sanita" }), { key: "Enter" });
    const peca = screen.getByRole("button", { name: /^Sanita, 36 por 55 cm/ });
    const x0 = lerPlanta(d.f.planta)!.pecas[0].x;
    fireEvent.keyDown(peca, { key: "ArrowRight" });
    expect(lerPlanta(d.f.planta)!.pecas[0].x).toBe(x0 + 5);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
  });

  it("a planta gravada por fora (a folha) aparece no desenho", () => {
    const { d } = montar();
    const { rerender } = render(<div />);
    d.f.planta = JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(234, 177), pecas: [] });
    rerender(<div />);
    cleanup();
    const ctx = { A: { campo: vi.fn() }, run: (fn: () => void) => fn() } as unknown as Ctx;
    render(<PlantaDivisao ctx={ctx} d={d} />);
    expect(screen.getByText("4,14 m²")).toBeInTheDocument();
  });
  it("um produto do catálogo (sanita) entra com o nome e a medida, roda 90 graus e duplica-se", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(300, 200), pecas: [] }) });
    const chip = screen.getByRole("list", { name: "Produtos do catálogo" }).querySelector("button")!;
    fireEvent.keyDown(chip, { key: "Enter" });
    const pc = lerPlanta(d.f.planta)!.pecas[0];
    expect(pc.produto).toBeTruthy();
    expect(pc.nome).toBeTruthy();
    expect(pc.rot).toBeDefined();
    const antes = pc.rot ?? 0;
    fireEvent.click(screen.getByRole("button", { name: "Rodar 90° à direita" }));
    expect(lerPlanta(d.f.planta)!.pecas[0].rot).toBe((antes + 90) % 360);
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(2);
  });

  it("um espelho do catálogo encosta-se à parede, a 1 m do chão, e fica dentro da divisão", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(300, 200), pecas: [] }) });
    fireEvent.click(screen.getByRole("tab", { name: /^Espelhos/ }));
    fireEvent.keyDown(screen.getByRole("list", { name: "Produtos do catálogo" }).querySelector("button")!, { key: "Enter" });
    const pc = lerPlanta(d.f.planta)!.pecas[0];
    expect(pc).toMatchObject({ mont: "parede", alt: 100 });
    expect(pc.y).toBeGreaterThanOrEqual(-1.5);
    expect(screen.getByLabelText("Altura ao chão (cm)")).toBeInTheDocument();
  });

  it("uma peça maior do que a divisão não entra: «Fora da divisão»", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(80, 80), pecas: [] }) });
    fireEvent.click(screen.getByRole("tab", { name: /^Banheiras/ }));
    fireEvent.keyDown(screen.getByRole("list", { name: "Produtos do catálogo" }).querySelector("button")!, { key: "Enter" });
    expect(lerPlanta(d.f.planta)?.pecas ?? []).toEqual([]);
    expect(screen.getByText(/^Fora da divisão/)).toBeInTheDocument();
  });
});
