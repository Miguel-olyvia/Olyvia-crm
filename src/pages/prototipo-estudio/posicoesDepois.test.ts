// 6/11: o depois lembra-se de onde estão as peças (o caso do testarh: no depois, a banheira, o móvel e a sanita nova estavam ao meio).
import { describe, expect, it } from "vitest";
import type { Planta } from "@/emylia/planta";
import type { Projeto } from "./necessidadesEstudio";
import { colocar } from "./necessidadesEstudio";
import { acertarPosicoes, mudarODepois, seguirOAntes } from "./posicoesDepois";

const paredes = [{ c: 240, r: "E" as const }, { c: 245, r: "S" as const }, { c: 240, r: "W" as const }, { c: 245, r: "N" as const }];
const antes: Planta = {
  o: { x: 115, y: 180 }, paredes,
  pecas: [
    { id: "ban", tipo: "banheira", x: 115, y: 185, w: 170, h: 70 }, { id: "san", tipo: "sanita", x: 120, y: 335, w: 55, h: 36 },
    { id: "mov", tipo: "movel", x: 190, y: 380, w: 80, h: 45 }, { id: "jan", tipo: "janela", x: 110, y: 295, w: 8, h: 50 },
  ],
};
// o depois antigo: ficou com as peças ao meio (copiado de um antes de outra altura); a sanita antiga sai e entra uma nova
const depoisAntigo: Planta = {
  o: { x: 115, y: 180 }, paredes,
  pecas: [
    { id: "ban", tipo: "banheira", x: 190, y: 250, w: 170, h: 75 }, { id: "mov", tipo: "movel", x: 195, y: 305, w: 80, h: 45 },
    { id: "jan", tipo: "janela", x: 110, y: 280, w: 8, h: 100 }, { id: "nova", tipo: "sanita", x: 195, y: 270, w: 62, h: 36 },
  ],
};
const projeto = (extra: Partial<Projeto> = {}): Projeto => ({
  antes, depois: depoisAntigo, escolhas: { ban: "ban-lago", nova: "san-ria" }, acompanha: {}, ajustes: {},
  alturas: { peDireito: 250, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, ...extra,
});
const em = (p: Projeto, id: string) => p.depois.pecas.find((x) => x.id === id)!;

describe("o depois lembra-se das posições", () => {
  it("um projeto antigo acerta-se ao abrir: o que fica volta ao sítio do antes; a sanita nova vai para onde estava a antiga", () => {
    const p = acertarPosicoes(projeto());
    // a banheira (trocada pela Lago 170 × 75) fica encostada à mesma parede, no mesmo sítio
    expect(em(p, "ban")).toMatchObject({ x: 115, y: 180, w: 170, h: 75 });
    expect(em(p, "mov")).toMatchObject({ x: 190, y: 380 });
    expect(em(p, "jan")).toMatchObject({ x: 110, y: 295, h: 50 });
    const nova = em(p, "nova"), cx = nova.x + nova.w / 2, cy = nova.y + nova.h / 2;
    expect(Math.abs(cx - (120 + 55 / 2))).toBeLessThan(10);
    expect(Math.abs(cy - (335 + 36 / 2))).toBeLessThan(10);
    expect(p.movidasNoDepois).toEqual([]);
    // uma segunda vez não mexe em nada
    expect(acertarPosicoes(p)).toBe(p);
  });

  it("mexer no antes leva o depois; o que foi mudado no depois fica onde se pôs", () => {
    let p = acertarPosicoes(projeto());
    p = mudarODepois(p, { ...p.depois, pecas: p.depois.pecas.map((x) => (x.id === "mov" ? { ...x, x: 230 } : x)) });
    expect(p.movidasNoDepois).toEqual(["mov"]);
    p = seguirOAntes(p, { ...antes, pecas: antes.pecas.map((x) => (x.id === "ban" ? { ...x, x: 130 } : x.id === "mov" ? { ...x, x: 160 } : x)) });
    expect(em(p, "ban").x).toBe(130);
    expect(em(p, "mov").x).toBe(230);
  });

  it("uma peça nova tocada (sem sítio) vai para o sítio da do mesmo tipo que sai", () => {
    const base = acertarPosicoes(projeto({ depois: { ...depoisAntigo, pecas: depoisAntigo.pecas.filter((x) => x.id !== "nova") }, escolhas: { ban: "ban-lago" } }));
    const p = colocar({ ...base, porColocar: [{ id: "n2", tipo: "sanita", produto: "san-ria" }] }, "n2");
    const n2 = em(p, "n2");
    expect(Math.abs(n2.x + n2.w / 2 - (120 + 27.5))).toBeLessThan(10);
    expect(Math.abs(n2.y + n2.h / 2 - (335 + 18))).toBeLessThan(10);
  });
});
