// 5/11 (Rúben, a visita real): a planta no ecrã. Desenha-se com o dedo; tocar no número de uma parede deixa escrever a medida; as peças
// juntam-se pela barra; «Usar nas medidas» põe os m² nas medidas. Tudo se grava em f.planta.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlantaDivisao3D } from "./PlantaDivisao3D";
import { lerPlanta, retangulo } from "./planta";
import type { Ctx } from "./pecas";
import type { Negocio } from "./motor";

// estes testes usam os produtos de casa de banho (sanita, espelho…), que a lista do protótipo esconde por não terem modelo 3D do HTML:
// aqui a lista mostra todos (o filtro tem testes próprios em planta3d/BarraProdutos.test.tsx)
vi.mock("./planta3d/catalogo3d", async (original) => ({ ...(await original<typeof import("./planta3d/catalogo3d")>()), SO_COM_MODELO_HTML: false }));

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
  render(<PlantaDivisao3D ctx={ctx} d={d} divisao="Casa de banho" />);
  // a planta fica escondida no passo 1 (Divisão): procura-se também entre os escondidos
  return { d, campo, tela: screen.getByRole("img", { name: /^Planta/, hidden: true }) as unknown as SVGSVGElement };
}
// ---- a página é um assistente de 5 passos, um visível de cada vez: estes ajudantes andam entre eles ----
const NOMES_PASSOS = ["Divisão", "Paredes", "Portas e janelas", "Produtos", "Rever e ver em 3D"];
const rodape = () => screen.getByRole("group", { name: "Navegação entre passos" });
const passoAtual = () => Number(/^Passo (\d) de 5 · /.exec(screen.getByText(/^Passo \d de 5 · /).textContent ?? "")?.[1]);
const irPara = (n: number) => {
  while (passoAtual() < n) fireEvent.click(within(rodape()).getByRole("button", { name: "Seguinte" }));
  if (passoAtual() > n) fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Passo ${n}: `) }));
};
const tracar = (tela: Element, de: [number, number], ate: [number, number]) => {
  const alvo = tela.querySelector("[data-tela]")!;
  fireEvent.pointerDown(alvo, { clientX: de[0], clientY: de[1], pointerId: 1 });
  fireEvent.pointerMove(tela, { clientX: ate[0], clientY: ate[1], pointerId: 1 });
  fireEvent.pointerUp(tela, { clientX: ate[0], clientY: ate[1], pointerId: 1 });
};

describe("PlantaDivisao3D", () => {
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
    irPara(2);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Parede 1: 200 cm. Escrever a medida." }));
    const caixa = screen.getByLabelText("Parede 1, em cm");
    fireEvent.change(caixa, { target: { value: "250" } });
    fireEvent.blur(caixa);
    expect(lerPlanta(d.f.planta)?.paredes[0].c).toBe(250);
    expect(screen.getByText("Faltam 50 cm até ao canto de partida.")).toBeInTheDocument();
    irPara(5);
    expect(screen.getByRole("button", { name: "Usar nas medidas" })).toBeDisabled();
  });

  it("«Usar nas medidas» põe o chão e as paredes (pé-direito da visita, sem a porta) nas medidas", () => {
    const { d } = montar({ diag_pe_direito_m: "2,5 m", planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(234, 177), pecas: [] }) });
    irPara(3);
    fireEvent.keyDown(screen.getByRole("button", { name: "Porta" }), { key: "Enter" });
    irPara(5);
    fireEvent.click(screen.getByRole("button", { name: "Usar nas medidas" }));
    const med = (d as unknown as { visita: { med: Record<string, number> } }).visita.med;
    expect(med.pav).toBe(4.14);
    expect(med.par).toBe(Math.round((8.22 * 2.5 - 0.8 * 2) * 100) / 100);
    expect(screen.getByText(/Nas medidas: chão 4,14 m² e paredes/)).toBeInTheDocument();
  });

  it("uma peça junta-se pela barra, mexe-se com as setas e tira-se", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }) });
    irPara(4);
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
    render(<PlantaDivisao3D ctx={ctx} d={d} />);
    expect(screen.getByText("4,14 m²")).toBeInTheDocument();
  });
  it("um produto do catálogo (sanita) entra com o nome e a medida, roda 90 graus e duplica-se", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(300, 200), pecas: [] }) });
    irPara(4);
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
    irPara(4);
    fireEvent.click(screen.getByRole("tab", { name: /^Espelhos/ }));
    fireEvent.keyDown(screen.getByRole("list", { name: "Produtos do catálogo" }).querySelector("button")!, { key: "Enter" });
    const pc = lerPlanta(d.f.planta)!.pecas[0];
    expect(pc).toMatchObject({ mont: "parede", alt: 100 });
    expect(pc.y).toBeGreaterThanOrEqual(-1.5);
    expect(screen.getByLabelText("Altura ao chão (cm)")).toBeInTheDocument();
  });

  it("uma peça maior do que a divisão não entra: «Fora da divisão»", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(80, 80), pecas: [] }) });
    irPara(4);
    fireEvent.click(screen.getByRole("tab", { name: /^Banheiras/ }));
    fireEvent.keyDown(screen.getByRole("list", { name: "Produtos do catálogo" }).querySelector("button")!, { key: "Enter" });
    expect(lerPlanta(d.f.planta)?.pecas ?? []).toEqual([]);
    expect(screen.getByText(/^Fora da divisão/)).toBeInTheDocument();
  });
  it("uma família aparece uma só vez, com bolinhas de acabamento; escolher o acabamento muda a variante da peça (SKU e preço)", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [] }) });
    irPara(4);
    fireEvent.click(screen.getByRole("tab", { name: /^Banho \(famílias\)/ }));
    expect(screen.getAllByText("Espelho com moldura (demo)")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Acabamento Moldura oro" })[0]);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Família Espelho com moldura 60×80 \(demo\), acabamento Moldura oro, SKU ESP-60×80-OR/ }), { key: "Enter" });
    const pc = lerPlanta(d.f.planta)!.pecas[0];
    expect(pc).toMatchObject({ fam: "espelho_f", med: "60×80", acab: "oro", mont: "parede", alt: 110 });
    fireEvent.click(within(screen.getByRole("group", { name: "Variante da peça" })).getByRole("button", { name: "Acabamento Moldura alumínio" }));
    expect(lerPlanta(d.f.planta)!.pecas[0]).toMatchObject({ acab: "aluminio" });
  });

  it("um conjunto (duche) põe as peças ligadas; retirar um componente deixa-o na lista como retirado, e repor traz-o de volta", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [] }) });
    irPara(4);
    fireEvent.click(screen.getByRole("tab", { name: /^Conjuntos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pôr o conjunto Conjunto de duche (demo) na planta" }));
    const l = lerPlanta(d.f.planta)!.pecas;
    expect(l.map((x) => x.papel)).toEqual(["base", "resguardo", "misturadora", "coluna"]);
    expect(l.every((x) => x.conj === "cj1")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retirar coluna de duche" }));
    expect(lerPlanta(d.f.planta)!.pecas.find((x) => x.papel === "coluna")!.ret).toBe(true);
    expect(screen.getAllByText(/retirado do conjunto/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Repor coluna de duche" }));
    expect(lerPlanta(d.f.planta)!.pecas.find((x) => x.papel === "coluna")!.ret).toBe(false);
  });
  it("na cozinha: sem conjuntos de banho; a bancada composta entra encostada e configura-se como no catálogo 3D", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [] }) });
    fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: "cozinha" } });
    irPara(4);
    expect(screen.queryByRole("tab", { name: /^Conjuntos/ })).toBeNull();
    try {
    fireEvent.click(screen.getByRole("tab", { name: /^Bancadas \(/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pôr a bancada composta na planta" }));
    const pc = lerPlanta(d.f.planta)!.pecas[0];
    expect(pc).toMatchObject({ w: 240, h: 65, banc: { series: "canela-roma", sink: "velar50", hob: "ib65b60", tap: "round" } });
    const painel = screen.getByRole("region", { name: "Configurar bancada" });
    fireEvent.change(within(painel).getByRole("combobox", { name: "Série da bancada" }), { target: { value: "jungla" } });
    expect(lerPlanta(d.f.planta)!.pecas[0].banc).toMatchObject({ series: "jungla", tone: "abeto", surface: "escovado" });
    // uma posição que não serve mostra a mensagem do HTML e não se aplica
    const placa = within(painel).getByRole("spinbutton", { name: "Placa · cm" });
    fireEvent.change(placa, { target: { value: "90" } }); fireEvent.blur(placa);
    expect(within(painel).getByRole("status")).toHaveTextContent(/Afasta o lava-loiça e a placa/);
    expect(lerPlanta(d.f.planta)!.pecas[0].banc!.hobX).toBe(1800);
    fireEvent.click(within(painel).getByRole("button", { name: "Trocar lados ⇄" }));
    const b = lerPlanta(d.f.planta)!.pecas[0].banc!;
    expect(b.sinkX).toBeGreaterThan(b.hobX);
    expect(within(painel).getAllByText(/88JG42S/).length).toBeGreaterThan(0);
    } finally {
      // a preferência do espaço fica gravada: volta à casa de banho para os testes seguintes
      irPara(1);
      fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: "casa_banho" } });
    }
  });
  it("na cozinha: a composição livre põe as partes ligadas como um conjunto, e sai tudo junto", () => {
    const { d } = montar({ planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [] }) });
    fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: "cozinha" } });
    irPara(4);
    try {
      fireEvent.click(screen.getByRole("tab", { name: /^Bancadas \(/ }));
      fireEvent.click(screen.getByRole("button", { name: "Montar uma composição livre" }));
      const painel = screen.getByRole("region", { name: "Composição livre" });
      const juntar = (cat: string) => {
        fireEvent.click(within(painel).getByRole("button", { name: cat }));
        fireEvent.click(within(painel).getByRole("button", { name: "Seguinte" }));
        fireEvent.click(within(painel).getByRole("button", { name: /^Juntar a família/ }));
      };
      juntar("Lava-loiças");
      fireEvent.click(within(painel).getByRole("button", { name: "Juntar mais um produto" }));
      juntar("Torneiras");
      fireEvent.click(within(painel).getByRole("button", { name: "Seguinte" }));
      fireEvent.click(within(painel).getByRole("button", { name: "Pôr a composição na planta" }));
      const pecas = lerPlanta(d.f.planta)!.pecas;
      expect(pecas).toHaveLength(2);
      expect(pecas.every((x) => x.conj === "cl1" && x.conjId === "composicao_livre")).toBe(true);
      expect(pecas.filter((x) => x.ancora)).toHaveLength(1);
      expect(screen.queryByRole("region", { name: "Composição livre" })).toBeNull();
      irPara(5);
      expect(screen.getByText(/Conjunto: Composição livre \(protótipo\)/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Remover conjunto Composição livre (protótipo)" }));
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(0);
    } finally {
      irPara(1);
      fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: "casa_banho" } });
    }
  });
  describe("tirar peças da planta (sem acertar num alvo pequeno)", () => {
    const sala = { planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [] }) };
    const poe = () => { irPara(4); fireEvent.keyDown(screen.getByRole("list", { name: "Produtos do catálogo" }).querySelector("button")!, { key: "Enter" }); };
    const peca = () => screen.getByRole("button", { name: /Setas para mover/ });
    const tocar = (alvo: Element, tela: Element) => {
      fireEvent.pointerDown(alvo, { clientX: 100, clientY: 100, pointerId: 7, pointerType: "touch" });
      fireEvent.pointerUp(tela, { clientX: 100, clientY: 100, pointerId: 7, pointerType: "touch" });
    };

    it("tocar na peça (com o dedo) escolhe-a e mostra, logo por baixo da planta, o botão Remover com o nome", () => {
      const { d, tela } = montar(sala);
      poe();
      fireEvent.click(screen.getByRole("button", { name: "Desescolher" }));
      expect(screen.queryByRole("toolbar", { name: "Peça escolhida" })).toBeNull();
      tocar(peca(), tela);
      const barra = screen.getByRole("toolbar", { name: "Peça escolhida" });
      fireEvent.click(within(barra).getByRole("button", { name: /^Remover / }));
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
    });
    it("a lista «Peças na divisão» tem uma linha por peça, com Remover, Rodar e Duplicar de 44 px", () => {
      const { d } = montar(sala);
      poe(); poe();
      irPara(5);
      const lista = screen.getByRole("list", { name: "Peças na divisão" });
      expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
      const nome = lerPlanta(d.f.planta)!.pecas[0].nome!;
      expect(within(lista).getAllByRole("button", { name: `Duplicar ${nome}` }).length).toBeGreaterThan(0);
      expect(within(lista).getAllByRole("button", { name: `Remover ${nome}` })[0].className).toMatch(/min-h-11/);
      fireEvent.click(within(lista).getAllByRole("button", { name: `Remover ${nome}` })[0]);
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1);
      fireEvent.click(within(screen.getByRole("list", { name: "Peças na divisão" })).getByRole("button", { name: `Rodar ${nome}` }));
      expect(lerPlanta(d.f.planta)!.pecas[0].rot).toBeDefined();
    });
    it("Delete e Backspace removem a escolhida; Escape desescolhe", () => {
      const { d } = montar(sala);
      poe();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("toolbar", { name: "Peça escolhida" })).toBeNull();
      fireEvent.keyDown(document.body, { key: "Delete" });
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1); // nada escolhido: não faz nada
      irPara(5);
      fireEvent.click(within(screen.getByRole("list", { name: "Peças na divisão" })).getAllByRole("button", { name: /^Escolher / })[0]);
      fireEvent.keyDown(document.body, { key: "Delete" });
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
      poe();
      fireEvent.keyDown(document.body, { key: "Backspace" });
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
    });
    it("Delete dentro de um campo de texto não remove a peça", () => {
      const { d } = montar(sala);
      poe();
      fireEvent.keyDown(screen.getByLabelText("Procurar no catálogo"), { key: "Backspace" });
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1);
    });
    it("Desfazer e Refazer (botões e Ctrl+Z / Ctrl+Y) para pôr, rodar e remover", () => {
      const { d } = montar(sala);
      irPara(2);
      expect(screen.getByRole("button", { name: "Desfazer" })).toBeDisabled();
      poe();
      const nome = lerPlanta(d.f.planta)!.pecas[0].nome!;
      irPara(5);
      fireEvent.click(within(screen.getByRole("list", { name: "Peças na divisão" })).getByRole("button", { name: `Rodar ${nome}` }));
      const rodada = lerPlanta(d.f.planta)!.pecas[0].rot;
      fireEvent.click(within(screen.getByRole("toolbar", { name: "Peça escolhida" })).getByRole("button", { name: /^Remover / }));
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1);
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      expect(lerPlanta(d.f.planta)!.pecas[0].rot).not.toBe(rodada);
      fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
      expect(lerPlanta(d.f.planta)!.pecas[0].rot).toBe(rodada);
      fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]); // voltou ao início
    });
    it("«Limpar todas as peças» pede confirmação, e Cancelar não limpa", () => {
      const { d } = montar(sala);
      poe(); poe();
      fireEvent.click(screen.getByRole("button", { name: "Limpar todas as peças" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Limpar todas as peças" }));
      fireEvent.click(screen.getByRole("button", { name: "Sim, limpar todas" }));
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(2);
    });
    it("arrastar a peça para fora da planta remove-a (e Desfazer repõe-na)", () => {
      const { d, tela } = montar(sala);
      Object.assign(tela, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400, x: 0, y: 0, toJSON: () => ({}) }) });
      poe();
      fireEvent.pointerDown(peca(), { clientX: 100, clientY: 100, pointerId: 3 });
      fireEvent.pointerMove(tela, { clientX: 700, clientY: 100, pointerId: 3 });
      fireEvent.pointerUp(tela, { clientX: 700, clientY: 100, pointerId: 3 });
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
      expect(screen.getByText(/Peça removida: foi largada fora da planta/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1);
    });
    it("arrastar dentro da planta mexe a peça sem a remover; só tocar não grava nem enche o histórico", () => {
      const { d, tela } = montar(sala);
      Object.assign(tela, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400, x: 0, y: 0, toJSON: () => ({}) }) });
      poe();
      const antes = lerPlanta(d.f.planta)!.pecas[0];
      tocar(peca(), tela);
      expect(lerPlanta(d.f.planta)!.pecas[0]).toEqual(antes);
      fireEvent.pointerDown(peca(), { clientX: antes.x + 5, clientY: antes.y + 5, pointerId: 4 });
      fireEvent.pointerMove(tela, { clientX: antes.x + 45, clientY: antes.y + 5, pointerId: 4 });
      fireEvent.pointerUp(tela, { clientX: antes.x + 45, clientY: antes.y + 5, pointerId: 4 });
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1);
      expect(lerPlanta(d.f.planta)!.pecas[0].x).not.toBe(antes.x);
      fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(lerPlanta(d.f.planta)!.pecas[0].x).toBe(antes.x);
    });
    it("a peça escolhida desenha-se por cima de tudo (recebe o toque mesmo sob um conjunto), e as peças pequenas têm área de toque maior", () => {
      const { tela } = montar(sala);
      irPara(4);
      fireEvent.click(screen.getByRole("tab", { name: /^Conjuntos/ }));
      fireEvent.click(screen.getByRole("button", { name: "Pôr o conjunto Conjunto de duche (demo) na planta" }));
      const botoes = () => [...tela.querySelectorAll("g[role=button][aria-pressed]")].filter((g) => g.getAttribute("aria-label")?.includes("Setas para mover"));
      const base = botoes().find((g) => g.getAttribute("aria-label")?.startsWith("Base de duche"))!;
      fireEvent.pointerDown(base, { clientX: 5, clientY: 5, pointerId: 9 });
      fireEvent.pointerUp(tela, { clientX: 5, clientY: 5, pointerId: 9 });
      const ordem = botoes();
      expect(ordem[ordem.length - 1].getAttribute("aria-label")).toMatch(/^Base de duche/);
      expect(base.querySelector("[data-toque]")).not.toBeNull();
      expect(tela.className.baseVal ?? tela.getAttribute("class")).toMatch(/touch-none/);
    });
    it("conjunto: linha do conjunto com «Remover conjunto» e componentes com «Retirar … do conjunto»", () => {
      const { d } = montar(sala);
      irPara(4);
      fireEvent.click(screen.getByRole("tab", { name: /^Conjuntos/ }));
      fireEvent.click(screen.getByRole("button", { name: "Pôr o conjunto Conjunto de duche (demo) na planta" }));
      irPara(5);
      const lista = screen.getByRole("list", { name: "Peças na divisão" });
      expect(within(lista).getAllByRole("button", { name: /^Retirar .* do conjunto$/ }).length).toBeGreaterThanOrEqual(3);
      fireEvent.click(within(lista).getAllByRole("button", { name: /^Retirar Coluna.* do conjunto$/ })[0]);
      expect(lerPlanta(d.f.planta)!.pecas.find((x) => x.papel === "coluna")!.ret).toBe(true);
      fireEvent.click(within(screen.getByRole("list", { name: "Peças na divisão" })).getByRole("button", { name: "Remover conjunto Conjunto de duche (demo)" }));
      expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
    });
  });
  describe("assistente em passos (um passo visível de cada vez)", () => {
    const sala = { planta: JSON.stringify({ o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [] }) };
    const poe = () => fireEvent.keyDown(screen.getByRole("list", { name: "Produtos do catálogo" }).querySelector("button")!, { key: "Enter" });

    it("abre no passo 1: só a divisão está visível, sem planta, produtos nem «Ver em 3D»", () => {
      montar(sala);
      expect(screen.getByText("Passo 1 de 5 · Divisão")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Espaço" })).toBeInTheDocument();
      expect(screen.queryByRole("img", { name: /^Planta/ })).toBeNull();
      expect(screen.queryByRole("list", { name: "Produtos do catálogo" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Ver em 3D" })).toBeNull();
      expect(screen.getByRole("button", { name: "Passo 1: Divisão" })).toHaveAttribute("aria-current", "step");
    });

    it("tem cinco marcadores com o nome escrito, e só o do passo actual leva aria-current=step", () => {
      montar(sala);
      irPara(3);
      const marcadores = NOMES_PASSOS.map((n, i) => screen.getByRole("button", { name: `Passo ${i + 1}: ${n}` }));
      expect(marcadores.map((m) => m.getAttribute("aria-current"))).toEqual([null, null, "step", null, null]);
      marcadores.forEach((m, i) => expect(m).toHaveTextContent(NOMES_PASSOS[i]));
      expect(screen.getByText("Passo 3 de 5 · Portas e janelas")).toBeInTheDocument();
    });

    it("percorre 1→5 e em cada passo só aparece o que lhe pertence", () => {
      montar(sala);
      irPara(2);
      expect(screen.getByRole("img", { name: /^Planta/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Desfazer a última parede" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Porta" })).toBeNull();
      expect(screen.queryByRole("combobox", { name: "Espaço" })).toBeNull();
      irPara(3);
      expect(screen.getByRole("button", { name: "Porta" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Desfazer a última parede" })).toBeNull();
      expect(screen.queryByRole("list", { name: "Produtos do catálogo" })).toBeNull();
      irPara(4);
      expect(screen.getByRole("list", { name: "Produtos do catálogo" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Modelo 3D" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Porta" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Ver em 3D" })).toBeNull();
      irPara(5);
      expect(screen.getByRole("button", { name: "Ver em 3D" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Produtos do catálogo" })).toBeNull();
      expect(within(rodape()).queryByRole("button", { name: "Seguinte" })).toBeNull();
    });

    it("sem paredes, «Seguinte» fica desactivado no passo 2 com o motivo escrito, e os passos 3 a 5 não abrem", () => {
      const { tela } = montar();
      irPara(2);
      expect(within(rodape()).getByRole("button", { name: "Seguinte" })).toBeDisabled();
      expect(within(rodape()).getByText("Desenhe pelo menos uma parede")).toBeInTheDocument();
      [3, 4, 5].forEach((n) => expect(screen.getByRole("button", { name: new RegExp(`^Passo ${n}: `) })).toBeDisabled());
      tracar(tela, [50, 50], [250, 55]);
      expect(within(rodape()).getByRole("button", { name: "Seguinte" })).toBeEnabled();
      expect(within(rodape()).queryByText("Desenhe pelo menos uma parede")).toBeNull();
    });

    it("«Anterior» e os marcadores já feitos voltam atrás sem perder paredes, peças nem o separador escolhido", () => {
      const { d } = montar(sala);
      irPara(4);
      fireEvent.click(screen.getByRole("tab", { name: /^Espelhos/ }));
      poe();
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1);
      fireEvent.click(within(rodape()).getByRole("button", { name: "Anterior" }));
      expect(passoAtual()).toBe(3);
      fireEvent.click(screen.getByRole("button", { name: "Passo 2: Paredes" }));
      expect(passoAtual()).toBe(2);
      expect(screen.getByRole("button", { name: "Parede 1: 400 cm. Escrever a medida." })).toBeInTheDocument();
      irPara(4);
      expect(screen.getByRole("tab", { name: /^Espelhos/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("button", { name: /Setas para mover/ })).toBeInTheDocument();
      expect(lerPlanta(d.f.planta)!.pecas).toHaveLength(1);
      expect(lerPlanta(d.f.planta)!.paredes).toHaveLength(4);
    });

    it("«Anterior» não existe no passo 1; a escolha do espaço mantém-se ao andar", () => {
      montar(sala);
      expect(within(rodape()).queryByRole("button", { name: "Anterior" })).toBeNull();
      fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: "cozinha" } });
      try {
        irPara(4); irPara(1);
        expect(screen.getByRole("combobox", { name: "Espaço" })).toHaveValue("cozinha");
      } finally {
        fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: "casa_banho" } });
      }
    });

    it("o passo 5 mostra a lista de peças, as linhas de venda abertas e o total", () => {
      montar(sala);
      irPara(4);
      poe();
      irPara(5);
      expect(screen.getByRole("list", { name: "Peças na divisão" })).toBeInTheDocument();
      const resumo = screen.getByText(/^Lista de peças para venda \(1\)/);
      expect(resumo.closest("details")).toHaveAttribute("open");
      expect(screen.getByText(/Total com preços de família/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ver em 3D" })).toHaveAttribute("aria-expanded", "false");
    });

    it("ao mudar de passo o foco vai para o título do passo (tabIndex -1), anunciado em role=status", () => {
      montar(sala);
      fireEvent.click(within(rodape()).getByRole("button", { name: "Seguinte" }));
      const titulo = screen.getByText("Passo 2 de 5 · Paredes");
      expect(titulo).toHaveAttribute("tabindex", "-1");
      expect(document.activeElement).toBe(titulo);
      expect(titulo.closest("[role=status]")).not.toBeNull();
    });
  });
});
