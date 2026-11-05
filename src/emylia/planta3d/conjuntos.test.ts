import { describe, expect, it } from "vitest";
import { retangulo, type PecaPlanta, type Planta } from "../planta";
import { CONJUNTOS, aplicarVariante, conjuntoPorId, expandirConjunto, guardarLugarLocal, linhasVendaveis, localParaPlano, mudarMontagem, planoParaLocal, precoConjunto, recortesDeTampo, reporComponente, reposicionarConjunto, retirarComponente, totalDasLinhas } from "./conjuntos";
import { deLegado } from "./ligacao";

const bancada = conjuntoPorId("bancada_cozinha")!;
const ancora = (o: Partial<PecaPlanta> = {}): PecaPlanta => ({ id: "cj1-tampo", tipo: "movel", x: 50, y: 0, w: 240, h: 65, rot: 0, ...o });
const planta = (pecas: PecaPlanta[]): Planta => ({ o: { x: 0, y: 0 }, paredes: retangulo(500, 300), pecas });
const doConjunto = (o: Partial<PecaPlanta> = {}) => expandirConjunto(bancada, "cj1", ancora(o));
const por = (l: PecaPlanta[], papel: string) => l.find((p) => p.papel === papel)!;

describe("expandir um conjunto em peças ligadas", () => {
  it("a bancada: tampo, móvel, lava-loiça, torneira, placa e sifão, todos do mesmo conjunto", () => {
    const l = doConjunto();
    expect(l.map((p) => p.papel)).toEqual(["tampo", "movel", "lavaloica", "torneira", "placa", "sifao"]);
    expect(l.every((p) => p.conj === "cj1" && p.conjId === "bancada_cozinha")).toBe(true);
    expect(l.filter((p) => p.ancora).map((p) => p.papel)).toEqual(["tampo"]);
    expect(por(l, "sifao").semGeo).toBe(true);
    expect(por(l, "lavaloica").opc).toEqual({ montagem: "baixo" });
  });
  it("cada componente é um produto de família com variante (família, medida e acabamento)", () => {
    const l = doConjunto();
    expect(por(l, "torneira")).toMatchObject({ fam: "noah", med: "unica", acab: "brushed" });
    expect(por(l, "lavaloica")).toMatchObject({ fam: "velar", med: "velar50", acab: "inox", w: 54, h: 44 });
    expect(por(l, "placa")).toMatchObject({ fam: "placa_inducao", med: "ib65b60", w: 59, h: 51 });
  });
  it("posição relativa: o lava-loiça e a placa no tampo, a torneira atrás do lava-loiça, com as alturas certas", () => {
    const l = doConjunto();
    const sink = por(l, "lavaloica"), tap = por(l, "torneira"), hob = por(l, "placa");
    // tampo em x 50..290, y 0..65: lava-loiça a 65 cm da esquerda e encostado à frente (4 cm de folga)
    expect([sink.x + sink.w / 2, sink.y + sink.h / 2]).toEqual([115, 39]);
    expect([hob.x + hob.w / 2, hob.y + hob.h / 2]).toEqual([230, 32.5]);
    expect(tap.x + tap.w / 2).toBeCloseTo(115, 0);
    expect(tap.y + tap.h / 2).toBeLessThan(sink.y + sink.h / 2);
    expect([por(l, "tampo").alt, sink.alt, tap.alt, hob.alt]).toEqual([88.8, 68.8, 90, 90]);
    expect(por(l, "movel")).toMatchObject({ w: 240, h: 60, alt: 0 });
  });
  it("com o tampo rodado 90 graus, o conjunto roda com ele", () => {
    const l = doConjunto({ rot: 90 });
    const sink = por(l, "lavaloica");
    expect(sink.rot).toBe(90);
    expect(sink.x + sink.w / 2).toBeCloseTo(163.5, 1);
    expect(sink.y + sink.h / 2).toBeCloseTo(-22.5, 1);
  });
  it("local ↔ plano são inversos", () => {
    const a = { x: 50, y: 20, w: 240, h: 65, rot: 37 };
    const p = localParaPlano(a, 70, 30), q = planoParaLocal(a, p.x, p.y);
    expect([q.lx, q.ly].map((n) => Math.round(n * 1000) / 1000)).toEqual([70, 30]);
  });
  it("outros conjuntos: o duche (resguardo à frente da base) e o móvel de lavatório (espelho na parede)", () => {
    const duche = expandirConjunto(conjuntoPorId("conjunto_duche")!, "cj2", ancora({ id: "cj2-base", w: 120, h: 80, x: 0, y: 0 }));
    expect(por(duche, "resguardo")).toMatchObject({ y: 80, w: 120, h: 4 });
    expect(por(duche, "misturadora")).toMatchObject({ mont: "parede", alt: 100 });
    const lav = expandirConjunto(conjuntoPorId("movel_lavatorio")!, "cj3", ancora({ id: "cj3-movel", w: 80, h: 46, x: 0, y: 0 }));
    expect([por(lav, "lavatorio").alt, por(lav, "torneira").alt, por(lav, "espelho").alt]).toEqual([55, 67, 110]);
    expect(por(lav, "espelho").mont).toBe("parede");
  });
});

describe("mover, retirar, repor e trocar componentes", () => {
  it("mover a âncora leva o conjunto; largar um componente noutro sítio guarda o novo lugar", () => {
    const p0 = planta(doConjunto());
    const movido = reposicionarConjunto({ ...p0, pecas: p0.pecas.map((p) => (p.ancora ? { ...p, x: p.x + 100, y: p.y + 20 } : p)) }, "cj1");
    expect(por(movido.pecas, "lavaloica")).toMatchObject({ x: 88 + 100, y: 17 + 20 });
    const q = guardarLugarLocal({ ...p0, pecas: p0.pecas.map((p) => (p.papel === "placa" ? { ...p, x: p.x + 10 } : p)) }, por(p0.pecas, "placa").id);
    expect(por(q.pecas, "placa").lx).toBe(190);
  });
  it("retirar um componente deixa-o na lista como retirado; repor traz-o de volta; retirar a âncora retira o conjunto", () => {
    const p0 = planta(doConjunto());
    const sink = por(p0.pecas, "lavaloica").id;
    const sem = retirarComponente(p0, sink);
    expect(sem.pecas).toHaveLength(6);
    expect(por(sem.pecas, "lavaloica").ret).toBe(true);
    expect(reporComponente(sem, sink).pecas.find((p) => p.id === sink)!.ret).toBe(false);
    expect(retirarComponente(p0, por(p0.pecas, "tampo").id).pecas).toEqual([]);
  });
  it("trocar um componente (outra torneira, outro acabamento) mantém o sítio e o lugar no conjunto", () => {
    const p = por(doConjunto(), "torneira");
    const t = aplicarVariante(p, "round", "unica", "oro");
    expect(t).toMatchObject({ fam: "round", acab: "oro", conj: "cj1", papel: "torneira", alt: 90, lx: p.lx, ly: p.ly });
    expect(t.x + t.w / 2).toBeCloseTo(p.x + p.w / 2, 1);
    expect(t.y + t.h / 2).toBeCloseTo(p.y + p.h / 2, 1);
    expect(t.nome).toBe("Torneira Round Extraível (demo)");
  });
  it("outra medida de lava-loiça muda o tamanho e a altura; por cima sobe o rebordo", () => {
    const s = por(doConjunto(), "lavaloica");
    const maior = aplicarVariante(s, "velar", "velar71", "inox");
    expect(maior).toMatchObject({ w: 75, h: 44, alt: 68.8, med: "velar71" });
    expect(mudarMontagem(s, "cima")).toMatchObject({ alt: 70, opc: { montagem: "cima" } });
  });
  it("o tampo e o móvel mantêm o comprimento quando se troca a cor", () => {
    expect(aplicarVariante(por(doConjunto(), "tampo"), "tampo", "unica", "nero-ardi")).toMatchObject({ w: 240, acab: "nero-ardi" });
  });
});

describe("recortes do tampo", () => {
  it("o lava-loiça e a placa abrem recortes no tampo, em metros e relativos ao centro", () => {
    const l = doConjunto();
    const r = recortesDeTampo(por(l, "tampo"), l);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ w: 0.5, d: 0.4 });
    expect(r[0].x).toBeCloseTo(-0.55, 3);
    expect(r[0].z).toBeCloseTo(0.065, 3);
    expect(r[1]).toMatchObject({ w: 0.56, d: 0.48 });
    expect(r[1].x).toBeCloseTo(0.6, 3);
  });
  it("um componente retirado deixa de abrir recorte", () => {
    const l = doConjunto().map((p) => (p.papel === "lavaloica" ? { ...p, ret: true } : p));
    expect(recortesDeTampo(por(l, "tampo"), l)).toHaveLength(1);
  });
  it("o 3D leva os recortes no tampo e deixa de fora o que foi retirado", () => {
    const l = doConjunto({ x: 100, y: 5, id: "cj1-tampo" });
    const opcoes = { tipo: "cozinha" as const, nome: "Cozinha", peDireito: 2.4, produtos: {} };
    const r = deLegado(planta(l), opcoes);
    expect(r.ok && r.espaco.pecas.find((p) => p.nome?.includes("Tampo"))?.recortes).toHaveLength(2);
    expect(r.ok && r.espaco.pecas.find((p) => p.nome?.includes("Lava-loiça"))?.altura).toBeCloseTo(0.688, 3);
    const sem = deLegado(planta(l.map((p) => (p.papel === "lavaloica" ? { ...p, ret: true } : p))), opcoes);
    expect(sem.ok && sem.espaco.pecas.some((p) => p.nome?.includes("Lava-loiça"))).toBe(false);
    expect(sem.ok && sem.espaco.pecas.find((p) => p.nome?.includes("Tampo"))?.recortes).toHaveLength(1);
    expect(sem.ok && sem.espaco.pecas.some((p) => p.nome?.includes("Sifão"))).toBe(false);
  });
});

describe("preço do conjunto e linhas vendáveis", () => {
  it("o conjunto completo custa a soma com o desconto do conjunto", () => {
    const p = planta(doConjunto());
    const r = precoConjunto(p, "cj1")!;
    expect(r).toMatchObject({ soma: 1211, total: 1114.12, poupanca: 96.88, completo: true, faltam: [] });
    expect(r.total).toBeLessThan(r.soma);
    expect(CONJUNTOS.every((c) => c.componentes.every((k) => k.vendivelSeparado))).toBe(true);
  });
  it("sem um obrigatório não há desconto e diz-se o que falta; sem um opcional o desconto mantém-se", () => {
    const p = planta(doConjunto());
    const semPlaca = retirarComponente(p, por(p.pecas, "placa").id);
    expect(precoConjunto(semPlaca, "cj1")).toMatchObject({ soma: 882, total: 882, completo: false, faltam: ["Placa"] });
    const semSifao = retirarComponente(p, por(p.pecas, "sifao").id);
    expect(precoConjunto(semSifao, "cj1")).toMatchObject({ soma: 1187, completo: true });
  });
  it("trocar de acabamento muda o preço do conjunto (diferença de preço do acabamento)", () => {
    const p = planta(doConjunto());
    const caro = { ...p, pecas: p.pecas.map((x) => (x.papel === "torneira" ? aplicarVariante(x, "noah", "unica", "oro") : x)) };
    expect(precoConjunto(caro, "cj1")!.soma).toBe(1211 + 35);
  });
  it("cada componente é uma linha vendável, com o SKU e a indicação do conjunto, ou «retirado»", () => {
    const p = retirarComponente(planta(doConjunto()), "cj1-lavaloica");
    const l = linhasVendaveis(p);
    expect(l).toHaveLength(6);
    expect(l.find((x) => x.papel === "torneira")).toMatchObject({ sku: "GME-NOA-AC", preco: 159, conjNome: "Bancada de cozinha (demo)", retirado: false, vendivelSeparado: true });
    expect(l.find((x) => x.papel === "lavaloica")).toMatchObject({ retirado: true, sku: "FS200262-IX" });
    expect(totalDasLinhas(p)).toBe(precoConjunto(p, "cj1")!.total);
  });
  it("uma peça de família solta soma ao total à parte, sem desconto", () => {
    const solta: PecaPlanta = { id: "s1", tipo: "movel", x: 0, y: 0, w: 5, h: 22, fam: "stick", med: "unica", acab: "negro" };
    expect(totalDasLinhas(planta([solta]))).toBe(139);
  });
});
