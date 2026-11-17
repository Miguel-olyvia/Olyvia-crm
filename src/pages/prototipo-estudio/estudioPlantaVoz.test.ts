// 17/11 (Rúben: «o Estúdio super dinâmico: limpa paredes ele remove tudo, adiciona banheira ele adiciona… tudo por voz»)
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { pecasDitas, pedeDesfazer, plantaPorVoz, procuraNoEstudio, vozNoEstudio } from "./estudioPorVoz";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import { retangulo, type Planta } from "@/emylia/planta";

const PL: Planta = { o: { x: 0, y: 0 }, paredes: retangulo(275, 155), pecas: [{ id: "b", tipo: "banheira", x: 10, y: 10, w: 170, h: 70 }] };
const tipos = (p: Planta) => p.pecas.map((x) => x.tipo);

describe("a planta por voz (passo Antes)", () => {
  it("«limpa as paredes» tira as paredes e deixa as peças; «apaga tudo» limpa a planta", () => {
    const r = plantaPorVoz("limpa as paredes", PL, true)!;
    expect(r.planta.paredes).toEqual([]);
    expect(tipos(r.planta)).toEqual(["banheira"]);
    expect(plantaPorVoz("apaga tudo", PL, true)!.planta).toMatchObject({ paredes: [], pecas: [] });
  });
  it("«adiciona uma banheira», «põe uma sanita e um bidé», «banheira» sozinha", () => {
    expect(tipos(plantaPorVoz("adiciona uma banheira", PL, true)!.planta)).toEqual(["banheira", "banheira"]);
    expect(tipos(plantaPorVoz("põe uma sanita e um bidé", PL, true)!.planta)).toEqual(["banheira", "sanita", "bide"]);
    expect(tipos(plantaPorVoz("sanita", PL, true)!.planta)).toEqual(["banheira", "sanita"]);
    expect(tipos(plantaPorVoz("mete também uma janela", PL, true)!.planta)).toEqual(["banheira", "janela"]);
  });
  it("«tira a banheira», «roda a banheira», «mexe a banheira para a direita», «a banheira tem 1,60 por 70»", () => {
    expect(tipos(plantaPorVoz("tira a banheira", PL, true)!.planta)).toEqual([]);
    expect(plantaPorVoz("roda a banheira", PL, true)!.planta.pecas[0]).toMatchObject({ w: 70, h: 170 });
    expect(plantaPorVoz("mexe a banheira para a direita", PL, true)!.planta.pecas[0]).toMatchObject({ x: 35, y: 10 });
    expect(plantaPorVoz("move a banheira 50 para baixo", PL, true)!.planta.pecas[0]).toMatchObject({ x: 10, y: 60 });
    expect(plantaPorVoz("a banheira tem 1,60 por 70", PL, true)!.planta.pecas[0]).toMatchObject({ w: 160, h: 70 });
  });
  it("as paredes por medidas: «a casa de banho tem 2,50 por 1,80», «a parede de cima tem 3 metros», «parede 2 com 180»", () => {
    expect(plantaPorVoz("a casa de banho tem 2,50 por 1,80", PL, true)!.planta.paredes.map((w) => w.c)).toEqual([250, 180, 250, 180]);
    expect(plantaPorVoz("a parede de cima tem 3 metros", PL, true)!.planta.paredes[0].c).toBe(300);
    expect(plantaPorVoz("parede 2 com 180", PL, true)!.planta.paredes[1].c).toBe(180);
  });
  it("o que não é da planta não mexe", () => {
    expect(plantaPorVoz("vai para o estilo", PL, true)).toBeNull();
    expect(plantaPorVoz("bom dia", PL, true)).toBeNull();
  });
  it("as peças ditas e o desfazer", () => {
    expect(pecasDitas("põe um móvel, um espelho e uma porta")).toEqual(["movel", "espelho", "porta"]);
    expect(pedeDesfazer("desfaz")).toBe(true);
    expect(pedeDesfazer("não era isso")).toBe(true);
    expect(pedeDesfazer("desfaz a banheira")).toBe(false);
  });
});

describe("17/11 (Rúben: «pesquisar por voz»)", () => {
  it("o tipo de peça e o que procurar", () => {
    expect(procuraNoEstudio("procura sanitas glamic")).toEqual({ cat: "sanita", q: "glamic" });
    expect(procuraNoEstudio("mostra torneiras douradas")).toEqual({ cat: "torneira", q: "douradas" });
    expect(procuraNoEstudio("quero ver resguardos pretos de 120")).toEqual({ cat: "resguardo", q: "pretos 120" });
    expect(procuraNoEstudio("pesquisa azulejos brancos")).toEqual({ cat: "revestimento", q: "brancos" });
    expect(procuraNoEstudio("procura um móvel de 80")).toEqual({ cat: "movel", q: "80" });
    expect(procuraNoEstudio("vai para o estilo")).toBeNull();
  });
});

describe("no projeto, pelo passo", () => {
  const p = PROJETO_EXEMPLO;
  it("no Antes, «adiciona uma base de duche» põe a base na planta de hoje (e o depois segue)", () => {
    const r = vozNoEstudio("adiciona uma base de duche", p, 0)!;
    expect(r.p!.antes.pecas.some((x) => x.tipo === "base")).toBe(true);
    expect(r.p!.depois.pecas.some((x) => x.tipo === "base")).toBe(true);
  });
  it("no Depois, «põe um toalheiro» junta um novo, com produto, já na planta ao meio", () => {
    const r = vozNoEstudio("põe um toalheiro", p, 2)!;
    const t = r.p!.depois.pecas.find((x) => x.tipo === "toalheiro");
    expect(t).toBeTruthy();
    expect(r.p!.escolhas[t!.id]).toBeTruthy();
    expect(r.partes).toEqual(["Toalheiro nova na planta"]);
  });
  it("«aplica o estilo»", () => {
    const r = vozNoEstudio("aplica o estilo", p, 2);
    expect(r?.partes).toContain("Estilo aplicado às peças novas e trocadas");
  });
});
