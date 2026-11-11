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
    expect(revestimentosDe({ pavimento: "pav-tela-a", revestimento: "rev-tela-c" })).toEqual({ pavimento: "ceramico_escuro", parede: "tinta_cinza" });
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
