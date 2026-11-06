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

  it("tocar no número de uma parede deixa escrever a medida certa; a parede do outro lado acompanha e a planta continua fechada", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }) });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Parede 1: 200 cm. Escrever a medida." }));
    const caixa = screen.getByLabelText("Parede 1, em cm");
    fireEvent.change(caixa, { target: { value: "250" } });
    fireEvent.blur(caixa);
    expect(lerPlanta(d.f.planta)?.paredes.map((w) => w.c)).toEqual([250, 150, 250, 150]);
    expect(screen.getByText("A planta fecha.")).toBeInTheDocument();
    expect(screen.getByText("3,75 m²")).toBeInTheDocument();
  });

  it("tocar numa parede não põe o foco na caixa da medida (a página não desce); com o teclado, põe", async () => {
    montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }) });
    const numero = screen.getByRole("button", { name: "Parede 3: 200 cm. Escrever a medida." });
    fireEvent.pointerDown(numero);
    expect(screen.getByLabelText("Parede 3, em cm")).not.toHaveFocus();
    fireEvent.keyDown(numero, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText("Parede 3, em cm")).toHaveFocus();
  });

  it("arrastar uma parede muda-a de sítio: as vizinhas esticam e a planta continua fechada (5/11)", () => {
    const { d, tela } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }) });
    // a parede da direita está em x = 200: agarrá-la a meio e puxar 40 cm para fora
    const parede = tela.querySelectorAll("line[stroke='transparent']")[1];
    fireEvent.pointerDown(parede, { clientX: 200, clientY: 75, pointerId: 2 });
    fireEvent.pointerMove(tela, { clientX: 240, clientY: 80, pointerId: 2 });
    fireEvent.pointerUp(tela, { clientX: 240, clientY: 80, pointerId: 2 });
    expect(lerPlanta(d.f.planta)?.paredes.map((w) => w.c)).toEqual([240, 150, 240, 150]);
    expect(screen.getByText("A planta fecha.")).toBeInTheDocument();
  });

  it("as peças encostadas à parede que se arrasta andam com ela", () => {
    const { d, tela } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [
      { id: "esp", tipo: "espelho", x: 196, y: 40, w: 4, h: 80 }, { id: "san", tipo: "sanita", x: 60, y: 40, w: 36, h: 55 },
    ] }) });
    const parede = tela.querySelectorAll("line[stroke='transparent']")[1];
    fireEvent.pointerDown(parede, { clientX: 200, clientY: 20, pointerId: 3 });
    fireEvent.pointerMove(tela, { clientX: 230, clientY: 20, pointerId: 3 });
    fireEvent.pointerUp(tela, { clientX: 230, clientY: 20, pointerId: 3 });
    const pecas = lerPlanta(d.f.planta)!.pecas;
    expect(pecas.find((x) => x.id === "esp")?.x).toBe(226);
    expect(pecas.find((x) => x.id === "san")?.x).toBe(60);
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
    fireEvent.keyDown(screen.getByRole("button", { name: "Sanita" }), { key: "Enter" });
    const peca = screen.getByRole("button", { name: /^Sanita, 36 por 55 cm/ });
    const x0 = lerPlanta(d.f.planta)!.pecas[0].x;
    fireEvent.keyDown(peca, { key: "ArrowRight" });
    expect(lerPlanta(d.f.planta)!.pecas[0].x).toBe(x0 + 5);
    fireEvent.click(screen.getByRole("button", { name: "Tirar" }));
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
});

describe("do Estúdio para as necessidades (5/11)", () => {
  it("a volta do Estúdio traz as linhas; o comercial revê e junta: os serviços com a quantidade; sem par fica à parte", () => {
    localStorage.clear();
    localStorage.setItem("olyvia.estudio.volta", JSON.stringify({ negocio: 3, em: Date.now(), antes: { o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }, linhas: [
      { id: "dem", n: "Demolição e entulho", q: 12.5, un: "m²", tipo: "servico", chave: "demolicao" },
      { id: "teto", n: "Teto falso a 2,4 m", q: 3, un: "m²", tipo: "servico", chave: "teto" },
      { id: "serv-sv-nicho", n: "Nicho embutido no duche", q: 1, un: "un", tipo: "servico", chave: "nicho" },
    ] }));
    const extra = vi.fn(), campo = vi.fn();
    const d = { id: 3, f: {}, visita: { med: {}, extra: {} } } as unknown as Negocio;
    const ctx = { A: { campo, extra, produto: vi.fn() }, run: (fn: () => void) => fn(), S: { svc: { demol: { n: "Demolição e entulho" }, teto: { n: "Teto falso em pladur" } } } } as unknown as Ctx;
    render(<PlantaDivisao ctx={ctx} d={d} />);
    expect(screen.getByRole("heading", { name: "Do Estúdio para as necessidades" })).toBeInTheDocument();
    expect(screen.getByText(/Sem par no Catálogo.*Nicho embutido no duche/)).toBeInTheDocument();
    // tirar o teto falso e juntar o resto
    fireEvent.click(screen.getByRole("checkbox", { name: /Teto falso em pladur/ }));
    fireEvent.click(screen.getByRole("button", { name: "Juntar às necessidades (1)" }));
    expect(extra).toHaveBeenCalledWith(3, "demol", 12.5);
    expect(extra).not.toHaveBeenCalledWith(3, "teto", expect.anything());
    expect(screen.getByText(/Nas necessidades: 1 serviço e 0 produtos do Estúdio/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Do Estúdio para as necessidades" })).toBeNull();
    expect(localStorage.getItem("olyvia.estudio.pendentes.3")).toBeNull();
  });
});

describe("o painel do Estúdio vê-se (5/11)", () => {
  it("com linhas por juntar, a caixa fechada da planta abre-se", () => {
    localStorage.clear();
    localStorage.setItem("olyvia.estudio.pendentes.4", JSON.stringify([{ id: "teto", n: "Teto falso", q: 3, un: "m²", tipo: "servico", chave: "teto" }]));
    const d = { id: 4, f: {}, visita: { med: {}, extra: {} } } as unknown as Negocio;
    const ctx = { A: { campo: vi.fn(), extra: vi.fn(), produto: vi.fn() }, run: (fn: () => void) => fn(), S: { svc: { teto: { n: "Teto falso em pladur" } } } } as unknown as Ctx;
    const { container } = render(<details><summary>Desenhar a planta</summary><PlantaDivisao ctx={ctx} d={d} /></details>);
    expect(container.querySelector("details")!.open).toBe(true);
    localStorage.clear();
  });
});

describe("o Estúdio preenche as Peças da casa de banho (6/11)", () => {
  it("as respostas da volta gravam-se no negócio, só as que mudaram", () => {
    localStorage.clear();
    localStorage.setItem("olyvia.estudio.volta", JSON.stringify({ negocio: 5, em: Date.now(), antes: { o: { x: 0, y: 0 }, paredes: [], pecas: [] }, respostas: { pc_base_cor: "Preto", pc_sanita_tipo: "Suspensa" } }));
    const campo = vi.fn();
    const d = { id: 5, f: { pc_sanita_tipo: "Suspensa" }, visita: { med: {}, extra: {} } } as unknown as Negocio;
    const ctx = { A: { campo, extra: vi.fn(), produto: vi.fn() }, run: (fn: () => void) => fn(), S: { svc: {} } } as unknown as Ctx;
    render(<PlantaDivisao ctx={ctx} d={d} />);
    expect(campo).toHaveBeenCalledWith(5, "pc_base_cor", "Preto");
    expect(campo).not.toHaveBeenCalledWith(5, "pc_sanita_tipo", expect.anything());
    expect(screen.getByText(/1 resposta do Estúdio/)).toBeInTheDocument();
  });
});
