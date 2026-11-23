// 9/11: a planta do Estúdio no 3D do Miguel: os produtos escolhidos dão a cor e a medida; as peças de parede e os móveis suspensos sobem.
import { describe, expect, it } from "vitest";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import { espacoDoEstudio, revestimentosDe } from "./estudioNo3D";
import { produto } from "./catalogoFake";

describe("o Estúdio no 3D do Miguel", () => {
  it("o depois: cada peça com produto tem o modelo com a cor dele; o espelho fica na parede e o móvel suspenso acima do chão", () => {
    const p = { ...PROJETO_EXEMPLO, escolhas: { ...PROJETO_EXEMPLO.escolhas } };
    const r = espacoDoEstudio(p, "depois");
    if ("erro" in r || !r.ok) throw new Error("a planta do exemplo devia abrir em 3D");
    for (const [pecaId, prodId] of Object.entries(p.escolhas)) {
      const pc = r.espaco.pecas.find((x) => x.id === pecaId);
      if (!pc) continue;
      expect(r.modelos[pc.produtoId].mockup3d.cor).toBe(produto(prodId)!.hex);
    }
    const tipo = (t: string) => p.depois.pecas.find((x) => x.tipo === t)?.id;
    const espelho = r.espaco.pecas.find((x) => x.id === tipo("espelho"));
    if (espelho) expect(espelho).toMatchObject({ montagem: "parede" });
    const movel = r.espaco.pecas.find((x) => x.id === tipo("movel"));
    if (movel && (produto(p.escolhas[movel.id])?.z0 ?? 0) > 5) expect(movel.altura).toBeGreaterThan(0);
  });
  it("o antes abre sem produtos; sem paredes, diz o que falta", () => {
    const r = espacoDoEstudio(PROJETO_EXEMPLO, "antes");
    expect(r.ok).toBe(true);
    const vazio = espacoDoEstudio({ ...PROJETO_EXEMPLO, depois: { ...PROJETO_EXEMPLO.depois, paredes: [] } }, "depois");
    expect("erro" in vazio && vazio.erro).toMatch(/paredes/);
  });
  it("o revestimento e o pavimento: o mais parecido da lista do 3D", () => {
    expect(revestimentosDe({ pavimento: "pav-madeira" })).toMatchObject({ pavimento: "madeira_carvalho" });
    expect(revestimentosDe({ pavimento: "pav-tela-a", revestimento: "rev-tela-c" })).toMatchObject({ pavimento: "ceramico_escuro", parede: "tinta_cinza" });
    expect(revestimentosDe({}).materiais).toBeUndefined();
  });
});

// 18/11 (Rúben: «os pavimentos estão sem render 3D porque é revestimentos»): o chão do 3D com modelos saía sempre o «Cerâmico claro» da
// lista do visualizador, fosse qual fosse o pavimento escolhido (e as paredes, o «Azulejo branco»). Agora levam o material do produto.
import { usarProdutosReais, type Produto } from "./catalogoFake";
import { materialDoProduto } from "./estudioNo3D";
import { repeticoes, revestimentoDaSuperficie } from "@/emylia/planta3d/revestimentos";

/** Como chegam da Mudelar (produtoDaLinha): o Porcelânico e o SPC estão na categoria «Revestimentos», mas no Estúdio são o pavimento. */
const REAL = (id: string, cat: "pavimento" | "revestimento", n: string, cores: Produto["cores"], hex: string): Produto =>
  ({ id, cat, n, colecao: "", cores, hex, preco: 18.75, un: "m²", inst: 35.72 });
const GRIS = REAL("real-pav-gris", "pavimento", "Revestimento PORCELÂNICO BRERA GRIS 45x45", ["cinza"], "#8a8d91");
const SPC = REAL("real-pav-spc", "pavimento", "Pavimento SPC ROBLE NATURAL 1220x180x5", ["madeira"], "#b08a5e");
const ARENA = REAL("real-rev-arena", "revestimento", "Revestimento CERÂMICO ATREZO PALCO ARENA 30x60", ["bege"], "#d8c3a0");

describe("o pavimento e o revestimento escolhidos no 3D (18/11)", () => {
  it("um pavimento da Mudelar (Porcelânico, na categoria Revestimentos) vai para o chão com a cor e a peça dele", () => {
    usarProdutosReais([GRIS, SPC, ARENA]);
    const r = espacoDoEstudio({ ...PROJETO_EXEMPLO, pavimento: GRIS.id, revestimento: ARENA.id }, "depois");
    if ("erro" in r || !r.ok) throw new Error("a planta do exemplo devia abrir em 3D");
    const chao = revestimentoDaSuperficie(r.espaco.revestimentos, "pavimento");
    expect(chao).toMatchObject({ id: "estudio:real-pav-gris", cor: GRIS.hex, tipo: "azulejo", modulo: 0.45 });
    expect(chao.moduloAlto).toBeUndefined();
    // e o revestimento continua nas paredes, com a cor dele e a peça de 60 x 30 deitada
    expect(revestimentoDaSuperficie(r.espaco.revestimentos, "parede")).toMatchObject({ cor: ARENA.hex, tipo: "azulejo", modulo: 0.6, moduloAlto: 0.3 });
    usarProdutosReais([]);
  });
  it("o antes não leva os produtos escolhidos (fica o chão e as paredes da lista)", () => {
    usarProdutosReais([GRIS]);
    const r = espacoDoEstudio({ ...PROJETO_EXEMPLO, pavimento: GRIS.id }, "antes");
    if ("erro" in r || !r.ok) throw new Error("o antes devia abrir em 3D");
    expect(revestimentoDaSuperficie(r.espaco.revestimentos, "pavimento").id).not.toMatch(/^estudio:/);
    usarProdutosReais([]);
  });
  it("madeira em tábuas da largura do nome; contínuo sem juntas; sem medida, a peça de sempre", () => {
    expect(materialDoProduto(SPC, "pavimento")).toMatchObject({ tipo: "madeira", modulo: 0.18, cor: SPC.hex });
    expect(materialDoProduto({ id: "x", n: "Cerâmico efeito madeira 120 x 20", hex: "#a0784f", cores: ["madeira"] }, "pavimento")).toMatchObject({ tipo: "madeira", modulo: 0.2 });
    expect(materialDoProduto({ id: "m", n: "Microcimento Cinza", hex: "#9a9a98", cores: ["cinza"] }, "pavimento")).toMatchObject({ tipo: "tinta", cor: "#9a9a98" });
    expect(materialDoProduto({ id: "s", n: "Porcelânico Blanco", hex: "#f4f4f2", cores: ["branco"] }, "pavimento")).toMatchObject({ tipo: "azulejo", modulo: 0.6 });
    expect(materialDoProduto({ id: "s", n: "Azulejo Blanco", hex: "#f4f4f2", cores: ["branco"] }, "parede")).toMatchObject({ tipo: "azulejo", modulo: 0.3 });
    // a junta é a cor do produto, mais escura
    expect(materialDoProduto(GRIS, "pavimento").junta).toBe("#686a6d");
  });
  it("o pavimento escolhido muda o chão: cada um tem o seu material", () => {
    usarProdutosReais([GRIS, SPC]);
    const a = revestimentosDe({ pavimento: GRIS.id }).materiais?.pavimento, b = revestimentosDe({ pavimento: SPC.id }).materiais?.pavimento;
    expect(a?.cor).not.toBe(b?.cor);
    expect([a?.tipo, b?.tipo]).toEqual(["azulejo", "madeira"]);
    usarProdutosReais([]);
  });
});

describe("as repetições da textura (18/11)", () => {
  it("peça retangular: uma repetição por peça em cada direção; madeira: quatro tábuas", () => {
    expect(repeticoes({ id: "a", nome: "", tipo: "azulejo", cor: "#fff", modulo: 0.6, moduloAlto: 0.3 }, 2.4, 1.2)).toEqual([4, 4]);
    expect(repeticoes({ id: "b", nome: "", tipo: "azulejo", cor: "#fff", modulo: 0.5 }, 1, 1)).toEqual([2, 2]);
    expect(repeticoes({ id: "c", nome: "", tipo: "madeira", cor: "#fff", modulo: 0.25 }, 2, 1)).toEqual([2, 1]);
  });
  it("sem material de produto, a lista pelo id (como antes)", () => {
    expect(revestimentoDaSuperficie({ pavimento: "madeira_escura", parede: "tinta_verde" }, "pavimento").id).toBe("madeira_escura");
    expect(revestimentoDaSuperficie({ pavimento: "?", parede: "tinta_verde" }, "parede").id).toBe("tinta_verde");
  });
});

// 11/11 (Rúben: «as peças rodadas nas paredes em diagonal aparecem direitas no 3D»)
import { cortarCanto, retangulo, type PecaPlanta, type Planta } from "@/emylia/planta";
import { cantosPeca } from "@/emylia/planta3d/pecas3d";
import { rodadaNo3D } from "./estudioNo3D";

describe("peças rodadas no 3D (11/11)", () => {
  // 200 × 250 com o canto de cima à direita cortado a 45° (de (140, 0) a (200, 60)); a normal para dentro é (−0,71; 0,71)
  const planta = (pecas: PecaPlanta[]): Planta => ({ ...cortarCanto({ o: { x: 0, y: 0 }, paredes: retangulo(200, 250) }, 1, 60)!, pecas });
  // como o three.js gira a caixa (rotation.y = rot): (dx, dz) → (dx·cos + dz·sin, −dx·sin + dz·cos)
  const cantos3d = (pc: PecaPlanta) => {
    const a = ((pc.rot ?? 0) * Math.PI) / 180, cx = pc.x + pc.w / 2, cy = pc.y + pc.h / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const dx = (sx * pc.w) / 2, dy = (sy * pc.h) / 2; return { x: cx + dx * Math.cos(a) + dy * Math.sin(a), y: cy - dx * Math.sin(a) + dy * Math.cos(a) }; });
  };
  const mesmos = (a: { x: number; y: number }[], b: { x: number; y: number }[]) =>
    a.every((p) => b.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.5));
  for (const rot of [45, 135]) {
    it(`a sanita rodada a ${rot}° junto à diagonal fica no 3D no mesmo sítio, com a frente para dentro`, () => {
      const pc: PecaPlanta = { id: "s", tipo: "sanita", x: 129, y: 21, w: 40, h: 60, rot };
      const pl = planta([pc]);
      const r = rodadaNo3D(pc, pl);
      expect(mesmos(cantos3d(r), cantosPeca(pc))).toBe(true);
      const a = ((r.rot ?? 0) * Math.PI) / 180;
      expect(Math.sin(a) * -Math.SQRT1_2 + Math.cos(a) * Math.SQRT1_2).toBeGreaterThan(0.99);
      const e = espacoDoEstudio({ ...PROJETO_EXEMPLO, depois: pl, escolhas: {} }, "depois");
      if ("erro" in e || !e.ok) throw new Error("devia abrir em 3D");
      expect(e.espaco.pecas.find((x) => x.id === "s")?.rotacao).toBe(r.rot);
    });
  }
  it("as peças sem rotação e as portas ficam como estão", () => {
    const pl = planta([]);
    const s: PecaPlanta = { id: "s", tipo: "sanita", x: 10, y: 0, w: 40, h: 60 };
    const p: PecaPlanta = { id: "p", tipo: "porta", x: 150, y: 20, w: 70, h: 8, rot: 45 };
    expect(rodadaNo3D(s, pl)).toBe(s);
    expect(rodadaNo3D(p, pl)).toBe(p);
  });
});

// 23/11 (Rúben, negócio 1015: «a folha põe a coluna de duche na parede da esquerda»): a coluna fica no lado da base escolhido.
import { produtosDe } from "./catalogoFake";
import { ladoDaColuna, ladosParaColuna } from "./estudioNo3D";
import type { LadoColuna } from "@/emylia/planta";

describe("a coluna de duche no lado escolhido da base (23/11)", () => {
  const paredes = retangulo(147, 147);
  const pecas1015 = (coluna?: LadoColuna): PecaPlanta[] => [
    { id: "folha1", tipo: "base", x: 0, y: 0, w: 147, h: 70, ...(coluna ? { coluna } : {}) }, { id: "folha2", tipo: "janela", x: 33, y: -4, w: 81, h: 8 },
    { id: "folha3", tipo: "sanita", x: 0, y: 82, w: 60, h: 36 }, { id: "folha4", tipo: "movel", x: 111, y: 71, w: 36, h: 60 },
    { id: "folha5", tipo: "porta", x: 42, y: 143, w: 74, h: 8 }];
  const projeto = (coluna?: LadoColuna) => {
    const pl: Planta = { o: { x: 0, y: 0 }, paredes, pecas: pecas1015(coluna) };
    return { ...PROJETO_EXEMPLO, antes: pl, depois: pl, escolhas: {}, acompanha: { folha1: { coluna_duche: produtosDe("coluna_duche", PROJETO_EXEMPLO.estilo, true)[0].id } } };
  };
  const coluna = (c?: LadoColuna) => {
    const r = espacoDoEstudio(projeto(c), "depois");
    if ("erro" in r || !r.ok) throw new Error("a planta do 1015 devia abrir em 3D");
    return r.espaco.pecas.find((x) => x.id === "folha1-coluna-duche")!;
  };

  it("a base de parede a parede deixa escolher o fundo, a esquerda e a direita", () => {
    const pl = projeto().depois;
    expect(ladosParaColuna(pl.pecas[0], pl)).toEqual(["fundo", "esquerda", "direita"]);
  });
  it("sem escolha, a coluna fica ao meio do fundo (a parede da janela)", () => {
    const c = coluna();
    expect(c.x).toBeCloseTo(0.735, 2);
    expect(c.y).toBeLessThan(0.1);
  });
  it("«Na parede da esquerda»: ao meio do lado curto da esquerda, virada para dentro da base (como na folha do 1015)", () => {
    const c = coluna("esquerda");
    expect(c.x).toBeLessThan(0.1);
    expect(c.y).toBeCloseTo(0.35, 2);
    expect(c.rotacao).toBe(90);
    expect(coluna("direita").x).toBeGreaterThan(1.37);
  });
  it("um lado sem parede não se oferece, e a escolha antiga volta ao fundo", () => {
    const pl: Planta = { o: { x: 0, y: 0 }, paredes, pecas: [{ id: "folha1", tipo: "base", x: 15, y: 0, w: 120, h: 70, coluna: "esquerda" }] };
    expect(ladosParaColuna(pl.pecas[0], pl)).toEqual(["fundo"]);
    expect(ladoDaColuna(pl.pecas[0], pl)).toBe("fundo");
  });
});
