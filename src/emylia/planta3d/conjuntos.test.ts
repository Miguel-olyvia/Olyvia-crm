import { describe, expect, it } from "vitest";
import { retangulo, type PecaPlanta, type Planta } from "../planta";
import { CONJUNTOS, aplicarVariante, conjuntoPorId, expandirConjunto, familiasSubstitutas, guardarLugarLocal, linhasVendaveis, localParaPlano, planoParaLocal, precoConjunto, reporComponente, reposicionarConjunto, retirarComponente, totalDasLinhas } from "./conjuntos";
import { BANCADA_OMISSAO, pecaBancada } from "./bancada";

const lavatorio = conjuntoPorId("movel_lavatorio")!;
const ancora = (o: Partial<PecaPlanta> = {}): PecaPlanta => ({ id: "cj1-movel", tipo: "movel", x: 50, y: 0, w: 80, h: 46, rot: 0, ...o });
const planta = (pecas: PecaPlanta[]): Planta => ({ o: { x: 0, y: 0 }, paredes: retangulo(500, 300), pecas });
const doConjunto = (o: Partial<PecaPlanta> = {}) => expandirConjunto(lavatorio, "cj1", ancora(o));
const por = (l: PecaPlanta[], papel: string) => l.find((p) => p.papel === papel)!;

describe("os conjuntos são só de casa de banho", () => {
  it("a bancada de cozinha deixou de ser um conjunto e nenhum conjunto aparece na cozinha", () => {
    expect(conjuntoPorId("bancada_cozinha")).toBeUndefined();
    expect(CONJUNTOS.filter((c) => c.espacos.includes("cozinha"))).toEqual([]);
    expect(CONJUNTOS.every((c) => c.espacos.join() === "casa_banho")).toBe(true);
  });
  it("um móvel de cozinha nunca é substituído por um móvel de lavatório", () => {
    const movel: PecaPlanta = { id: "m", tipo: "movel", x: 0, y: 0, w: 240, h: 60, fam: "movel_base" };
    expect(familiasSubstitutas(movel).map((f) => f.id)).toEqual(["movel_base"]);
  });
});

describe("expandir um conjunto em peças ligadas", () => {
  it("o móvel de lavatório: móvel, lavatório, torneira e espelho, do mesmo conjunto, com as alturas certas", () => {
    const l = doConjunto();
    expect(l.map((p) => p.papel)).toEqual(["movel", "lavatorio", "torneira", "espelho"]);
    expect(l.every((p) => p.conj === "cj1" && p.conjId === "movel_lavatorio")).toBe(true);
    expect([por(l, "lavatorio").alt, por(l, "torneira").alt, por(l, "espelho").alt]).toEqual([55, 67, 110]);
    expect(por(l, "espelho").mont).toBe("parede");
  });
  it("o duche: o resguardo à frente da base e a misturadora na parede", () => {
    const duche = expandirConjunto(conjuntoPorId("conjunto_duche")!, "cj2", ancora({ id: "cj2-base", w: 120, h: 80, x: 0, y: 0 }));
    expect(por(duche, "resguardo")).toMatchObject({ y: 80, w: 120, h: 4 });
    expect(por(duche, "misturadora")).toMatchObject({ mont: "parede", alt: 100 });
  });
  it("com a âncora rodada, o conjunto roda com ela; local ↔ plano são inversos", () => {
    expect(por(doConjunto({ rot: 90 }), "espelho").rot).toBe(90);
    const a = { x: 50, y: 20, w: 240, h: 65, rot: 37 };
    const p = localParaPlano(a, 70, 30), q = planoParaLocal(a, p.x, p.y);
    expect([q.lx, q.ly].map((n) => Math.round(n * 1000) / 1000)).toEqual([70, 30]);
  });
});

describe("mover, retirar, repor e trocar componentes", () => {
  it("mover a âncora leva o conjunto; largar um componente noutro sítio guarda o novo lugar", () => {
    const p0 = planta(doConjunto()), antes = por(p0.pecas, "lavatorio");
    const movido = reposicionarConjunto({ ...p0, pecas: p0.pecas.map((p) => (p.ancora ? { ...p, x: p.x + 100, y: p.y + 20 } : p)) }, "cj1");
    expect(por(movido.pecas, "lavatorio")).toMatchObject({ x: antes.x + 100, y: antes.y + 20 });
    const q = guardarLugarLocal({ ...p0, pecas: p0.pecas.map((p) => (p.papel === "espelho" ? { ...p, x: p.x + 10 } : p)) }, por(p0.pecas, "espelho").id);
    expect(por(q.pecas, "espelho").lx).toBe((por(p0.pecas, "espelho").lx ?? 0) + 10);
  });
  it("retirar deixa o componente como retirado; repor traz-o; retirar a âncora retira o conjunto", () => {
    const p0 = planta(doConjunto()), id = por(p0.pecas, "lavatorio").id;
    const sem = retirarComponente(p0, id);
    expect(por(sem.pecas, "lavatorio").ret).toBe(true);
    expect(reporComponente(sem, id).pecas.find((p) => p.id === id)!.ret).toBe(false);
    expect(retirarComponente(p0, por(p0.pecas, "movel").id).pecas).toEqual([]);
  });
  it("trocar o acabamento mantém o sítio e o lugar no conjunto", () => {
    const p = por(doConjunto(), "torneira"), t = aplicarVariante(p, "torneira_lav", "unica", "oro");
    expect(t).toMatchObject({ acab: "oro", conj: "cj1", papel: "torneira", lx: p.lx, ly: p.ly });
  });
});

describe("preço do conjunto e linhas vendáveis", () => {
  it("o conjunto completo custa a soma com o desconto; sem um obrigatório não há desconto; sem um opcional mantém-se", () => {
    const p = planta(doConjunto());
    expect(precoConjunto(p, "cj1")).toMatchObject({ soma: 607, total: 576.65, poupanca: 30.35, completo: true, faltam: [] });
    expect(precoConjunto(retirarComponente(p, por(p.pecas, "lavatorio").id), "cj1")).toMatchObject({ soma: 508, total: 508, completo: false, faltam: ["Lavatório"] });
    expect(precoConjunto(retirarComponente(p, por(p.pecas, "espelho").id), "cj1")).toMatchObject({ soma: 498, completo: true });
  });
  it("cada componente é uma linha vendável; uma peça de família solta soma sem desconto", () => {
    const p = planta(doConjunto());
    expect(linhasVendaveis(p)).toHaveLength(4);
    expect(totalDasLinhas(p)).toBe(precoConjunto(p, "cj1")!.total);
    const solta: PecaPlanta = { id: "s1", tipo: "movel", x: 0, y: 0, w: 5, h: 22, fam: "stick", med: "unica", acab: "negro" };
    expect(totalDasLinhas(planta([solta]))).toBe(139);
  });
  it("a bancada composta dá uma linha por parte (chapa, lava-loiça, placa, torneira, móvel), cada uma vendável à parte", () => {
    const p = planta([pecaBancada("b1", { x: 0, y: 0 })]);
    const l = linhasVendaveis(p);
    expect(l.map((x) => x.papel)).toEqual(["chapa", "lavaloica", "placa", "torneira", "movel"]);
    expect(l[0]).toMatchObject({ sku: "88C772A", preco: undefined, vendivelSeparado: true });
    expect(l[1]).toMatchObject({ sku: "FS200262-IX", preco: 119 });
    expect(totalDasLinhas(p)).toBe(119 + 329 + 189 + 320);
    expect(BANCADA_OMISSAO.tap).toBe("round");
  });
});
