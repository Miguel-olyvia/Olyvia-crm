// 23/11 (Rúben: «o 3D ainda é genérico: caixas cinzentas sem os produtos nem os materiais, e não há planta»). O Estúdio da obra passa a
// mostrar o 3D com modelos do Estúdio (os produtos do contrato, o resguardo, a coluna, o espelho, a porta e a janela, o revestimento e o
// pavimento) com o feito a cores e o que falta transparente, e as plantas antes e depois.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import type { Planta } from "../planta";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { extrasDoContrato, obraEm3DComModelos, pedidosDosExtras } from "./obra3d";
import { guardarProdutosDoProjeto, produto, type Produto } from "@/pages/prototipo-estudio/catalogoFake";
import { ID_ESPELHO_CONTRATO, espacoDoEstudio, idColunaDuche, idResguardo } from "@/pages/prototipo-estudio/estudioNo3D";
import { produtoDoNome, produtosPedidosDoProjeto } from "@/pages/prototipo-estudio/produtosDoProjeto";
import { PROJETO_EXEMPLO } from "@/pages/prototipo-estudio/exemploEstudio";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";

afterEach(cleanup);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = (n: number, cat: Produto["cat"], nome: string, hex: string): Produto =>
  ({ id: uuid(n), cat, n: nome, colecao: nome.split(" ")[1] ?? "", cores: ["branco"], hex, preco: 100, un: cat === "revestimento" || cat === "pavimento" ? "m²" : "un", inst: 0 });
const BASE = { ...P(1, "base", "Base de duche ZEUS 70x150 branco", "#f5f5f5"), colecao: "ZEUS" };
const SANITA = P(2, "sanita", "Sanita compacta branca", "#fafafa");
const MOVEL = P(3, "movel", "Móvel AXIS 60x45x60 carvalho", "#b8895c");
const RESGUARDO = P(4, "resguardo", "Resguardo Spazio 80x195 fixo", "#dddddd");
const COLUNA = P(5, "coluna_duche", "Coluna de duche termostática preta", "#222222");
const MARFIL = P(6, "revestimento", "Revestimento Surface Marfil 30x60", "#eee3cf");
const ARENA = P(7, "pavimento", "Pavimento Surface Arena 60x60", "#cbb79a");
const ESPELHO = P(8, "espelho", "Espelho LED 80x70", "#cfd6da");
const PORTA = P(9, "porta", "Porta CPL branca 70", "#f2f2f2");
const JANELA = P(10, "janela", "Janela PVC oscilobatente", "#f0f0f0");
guardarProdutosDoProjeto([BASE, SANITA, MOVEL, RESGUARDO, COLUNA, MARFIL, ARENA, ESPELHO, PORTA, JANELA]);

/** A casa de banho do 1015: 147 × 147, a base ao fundo, a janela em cima, a porta em baixo. */
const sala = (pecas: Planta["pecas"]): Planta => ({ o: { x: 0, y: 0 }, paredes: [{ c: 147, r: "E" }, { c: 147, r: "S" }, { c: 147, r: "W" }, { c: 147, r: "N" }], pecas } as Planta);
const projeto1015 = (): Projeto => ({
  ...PROJETO_EXEMPLO, nome: "Manuel", negocio: 1015,
  antes: sala([
    { id: "folha1", tipo: "base", x: 15, y: 0, w: 120, h: 70 }, { id: "folha2", tipo: "janela", x: 24, y: -4, w: 100, h: 8 },
    { id: "folha3", tipo: "sanita", x: 0, y: 75, w: 36, h: 55 }, { id: "folha4", tipo: "movel", x: 65, y: 90, w: 80, h: 45 },
    { id: "folha5", tipo: "porta", x: 40, y: 143, w: 80, h: 8 },
  ] as Planta["pecas"]),
  depois: sala([
    { id: "folha1", tipo: "base", x: 0, y: 0, w: 147, h: 70 }, { id: "folha2", tipo: "janela", x: 24, y: -4, w: 100, h: 8 },
    { id: "folha3", tipo: "sanita", x: 0, y: 75, w: 36, h: 55 }, { id: "folha4", tipo: "movel", x: 111, y: 83, w: 36, h: 60 },
    { id: "folha5", tipo: "porta", x: 40, y: 143, w: 80, h: 8 },
  ] as Planta["pecas"]),
  escolhas: { folha1: BASE.id, folha3: SANITA.id, folha4: MOVEL.id },
  acompanha: { folha1: { coluna_duche: COLUNA.id, resguardo: RESGUARDO.id } },
  revestimento: MARFIL.id, pavimento: ARENA.id, alturas: { peDireito: 250, tetoFalso: 240 },
});

describe("o 3D com modelos do projeto (o mesmo do Estúdio)", () => {
  it("o resguardo no lado aberto da base, a coluna na parede do fundo, os materiais do revestimento e do pavimento", () => {
    const r = espacoDoEstudio(projeto1015(), "depois");
    if ("erro" in r || !r.ok) throw new Error("a planta do 1015 devia abrir em 3D");
    const base = r.espaco.pecas.find((x) => x.id === "folha1")!;
    expect(r.modelos[base.produtoId]).toMatchObject({ nome: BASE.n, mockup3d: expect.objectContaining({ cor: BASE.hex }) });
    const resg = r.espaco.pecas.find((x) => x.id === idResguardo("folha1"))!;
    expect(r.modelos[resg.produtoId]).toMatchObject({ tipo: "resguardo", nome: RESGUARDO.n });
    expect(resg.y).toBeCloseTo(0.69, 1); // o lado da base virado para o meio da divisão
    expect(resg.largura).toBeCloseTo(0.8, 2); // a medida do nome (80x195)
    expect(resg.rotacao).toBe(0);
    const col = r.espaco.pecas.find((x) => x.id === idColunaDuche("folha1"))!;
    expect(col).toMatchObject({ montagem: "parede" });
    expect(col.y).toBeLessThan(0.1); // na parede do fundo
    expect(col.x).toBeCloseTo(0.735, 2); // ao meio da base
    expect(r.modelos[col.produtoId].mockup3d.cor).toBe(COLUNA.hex);
    expect(r.espaco.revestimentos.materiais?.parede).toMatchObject({ nome: MARFIL.n, cor: MARFIL.hex });
    expect(r.espaco.revestimentos.materiais?.pavimento).toMatchObject({ nome: ARENA.n, cor: ARENA.hex });
  });
  it("o espelho do contrato por cima do móvel e a cor da porta e da janela; sem revestimento feito, as paredes de antes", () => {
    const r = espacoDoEstudio(projeto1015(), "depois", { espelho: ESPELHO, porta: PORTA, janela: JANELA, semRevestimento: true });
    if ("erro" in r || !r.ok) throw new Error("devia abrir");
    const esp = r.espaco.pecas.find((x) => x.id === ID_ESPELHO_CONTRATO)!;
    const movel = r.espaco.pecas.find((x) => x.id === "folha4")!;
    expect(esp).toMatchObject({ montagem: "parede", largura: 0.8 });
    expect(esp.altura).toBeGreaterThan(1);
    expect(esp.x).toBeGreaterThan(movel.x); // o móvel encosta à parede da direita: o espelho fica nessa parede
    expect(r.espaco.aberturas.find((a) => a.tipo === "porta")?.cor).toBe(PORTA.hex);
    expect(r.espaco.aberturas.find((a) => a.tipo === "janela")?.cor).toBe(JANELA.hex);
    expect(r.espaco.revestimentos.materiais?.parede).toBeUndefined();
    expect(r.espaco.revestimentos.materiais?.pavimento).toBeDefined();
  });
  it("o antes fica sem os produtos nem o que vai com a base", () => {
    const r = espacoDoEstudio(projeto1015(), "antes");
    if ("erro" in r || !r.ok) throw new Error("devia abrir");
    expect(r.espaco.pecas.some((x) => x.id === idResguardo("folha1"))).toBe(false);
    expect(r.espaco.revestimentos.materiais).toBeUndefined();
  });
});

describe("os produtos do projeto, lidos pelo id", () => {
  it("as peças, o que vai com elas, os materiais e os extras do contrato, cada um com a categoria", () => {
    const L = produtosPedidosDoProjeto(projeto1015(), [{ id: ESPELHO.id, cat: "espelho" }]);
    expect(L).toEqual(expect.arrayContaining([
      { id: BASE.id, cat: "base" }, { id: RESGUARDO.id, cat: "resguardo" }, { id: COLUNA.id, cat: "coluna_duche" },
      { id: MARFIL.id, cat: "revestimento" }, { id: ARENA.id, cat: "pavimento" }, { id: ESPELHO.id, cat: "espelho" },
    ]));
    expect(new Set(L.map((x) => x.id)).size).toBe(L.length);
  });
  it("sem a linha do catálogo, o produto pelo nome: a cor e a medida, sem preço", () => {
    const x = produtoDoNome(uuid(99), "Base de duche ZEUS 70x150 Antracite", "base");
    expect(x).toMatchObject({ id: uuid(99), cat: "base", preco: 0, w: 150, h: 70 });
    expect(x.cores).toContain("cinza");
    expect(produto(BASE.id)?.n).toBe(BASE.n);
  });
  it("os extras do contrato: o espelho, a porta e a janela pelo nome dos produtos das Necessidades", () => {
    const { d } = obraDeExemplo();
    d.visita.prod = [
      { id: ESPELHO.id, n: "ESPELHO LED 80x70", un: "un", custo: 1, q: 1, no: null },
      { id: uuid(20), n: "Porta-rolos cromado", un: "un", custo: 1, q: 1, no: null },
      { id: PORTA.id, n: "Porta CPL branca 70", un: "un", custo: 1, q: 1, no: null },
      { id: JANELA.id, n: "Janela PVC oscilobatente", un: "un", custo: 1, q: 1, no: null },
    ] as typeof d.visita.prod;
    const e = extrasDoContrato(d);
    expect(e).toEqual({ espelho: ESPELHO.id, porta: PORTA.id, janela: JANELA.id });
    expect(pedidosDosExtras(e).map((x) => x.cat)).toEqual(["espelho", "porta", "janela"]);
  });
});

describe("a obra: o feito a cores, o que falta transparente", () => {
  it("as peças por fazer ficam transparentes; com a obra acabada, nada", () => {
    const { d } = obraDeExemplo();
    const M = obraEm3DComModelos(d)!;
    expect(M.hoje.ok).toBe(true);
    expect(M.total).toBeGreaterThan(0);
    expect(M.porFazer.size).toBe(M.total - M.feitas);
    expect(M.feitas).toBeLessThan(M.total);
    d.obra.plano!.estado = "concluída";
    const F = obraEm3DComModelos(d)!;
    expect(F.porFazer.size).toBe(0);
    expect(F.feitas).toBe(F.total);
  });
  it("o resguardo e a coluna contam com as louças; o espelho do contrato com os móveis", () => {
    const { d } = obraDeExemplo();
    d.f.estudio = JSON.stringify(projeto1015());
    d.visita.prod = [{ id: ESPELHO.id, n: "Espelho LED 80x70", un: "un", custo: 1, q: 1, no: null }] as typeof d.visita.prod;
    const M = obraEm3DComModelos(d)!;
    expect(M.porFazer.has(idResguardo("folha1"))).toBe(M.porFazer.has("folha1"));
    expect(M.porFazer.has(idColunaDuche("folha1"))).toBe(M.porFazer.has("folha1"));
    expect(M.porFazer.has(ID_ESPELHO_CONTRATO)).toBe(M.porFazer.has("folha4"));
    expect(M.total).toBe(6); // base, resguardo, coluna, sanita, móvel, espelho (a porta e a janela são aberturas)
  });
  it("no Estúdio da obra, o separador 3D mostra o 3D (o simples, sem WebGL) e as duas plantas", () => {
    const { S, d } = obraDeExemplo();
    d.f.estudio = JSON.stringify(projeto1015());
    const A = acoes(S, () => {}, (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    const sec = screen.getByRole("region", { name: "O projeto em 3D" });
    expect(within(sec).getByRole("img", { name: /A obra em 3D/ })).toBeTruthy();
    expect(within(sec).getByText(/0 de 5 peças feitas/)).toBeTruthy();
    const plantas = screen.getByRole("region", { name: "As plantas antes e depois" });
    expect(within(plantas).getByRole("img", { name: /^Antes: como está: paredes de 147, 147, 147, 147 cm; 5 peças/ })).toBeTruthy();
    expect(within(plantas).getByRole("img", { name: /^Depois: como vai ficar/ })).toBeTruthy();
    expect(within(plantas).getByText(/Base de duche · ZEUS/)).toBeTruthy();
  });
});
