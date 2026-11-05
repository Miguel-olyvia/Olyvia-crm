import { describe, expect, it } from "vitest";
import { retangulo, type Planta } from "../planta";
import { modeloDoProduto } from "./catalogo3d";
import { deLegado, paredeMaisPerto, pecaDeProduto } from "./ligacao";
import { ajustarPeca } from "./pecas3d";
import { areaPavimento, areaParedes, paredesDoContorno } from "./modelo";

const sala = (pecas: Planta["pecas"] = []): Planta => ({ o: { x: 0, y: 0 }, paredes: retangulo(300, 200), pecas });
const base = modeloDoProduto({ id: "p1", n: "Base de duche 80×120", no: null, sub: "Bases Duche" });
const opcoes = { tipo: "casa_banho" as const, nome: "WC", peDireito: 2.4, produtos: { p1: base } };

describe("deLegado", () => {
  it("passa uma planta fechada a metros", () => {
    const r = deLegado(sala(), opcoes);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(areaPavimento(r.espaco)).toBe(6); expect(r.espaco.paredes).toHaveLength(4); expect(areaParedes(r.espaco)).toBe(24); }
  });
  it("recusa planta aberta ou pequena", () => {
    expect(deLegado({ o: { x: 0, y: 0 }, paredes: retangulo(300, 200).slice(0, 3), pecas: [] }, opcoes)).toMatchObject({ ok: false });
    expect(deLegado({ o: { x: 0, y: 0 }, paredes: [], pecas: [] }, opcoes)).toMatchObject({ ok: false });
  });
  it("uma porta do desenho vira abertura na parede mais próxima", () => {
    const r = deLegado(sala([{ id: "d", tipo: "porta", x: 100, y: -4, w: 80, h: 8 }]), opcoes);
    expect(r.ok && r.espaco.aberturas).toMatchObject([{ tipo: "porta", parede: "p1", largura: 0.8, altura: 2.1, peitoril: 0 }]);
    expect(r.ok && r.espaco.aberturas[0].posicao).toBe(1);
  });
  it("uma porta longe de qualquer parede não entra", () => {
    const r = deLegado(sala([{ id: "d", tipo: "porta", x: 100, y: 90, w: 80, h: 8 }]), opcoes);
    expect(r.ok && r.espaco.aberturas).toEqual([]);
  });
  it("a peça de um produto do catálogo guarda o id e a dimensão real, encostada à parede", () => {
    const p = sala();
    const pc = pecaDeProduto(p, base, "pc1", { x: 60, y: 40 });
    expect(pc).toMatchObject({ produto: "p1", tipo: "base", w: 120, h: 80 });
    const r = deLegado({ ...p, pecas: [pc] }, opcoes);
    expect(r.ok && r.espaco.pecas[0]).toMatchObject({ produtoId: "p1", paredeEncosto: "p1", largura: 1.2, profundidade: 0.8, rotacao: 0 });
    expect(r.ok && Object.keys(r.modelos)).toEqual(["p1"]);
  });
  it("uma peça de parede (espelho) encostada à parede da direita leva a altura ao chão e roda para dentro", () => {
    const espelho = modeloDoProduto({ id: "e1", n: "Espelho 60x80", no: null, sub: "Espelhos" });
    const base0 = pecaDeProduto(sala(), espelho, "pc1", { x: 280, y: 100 });
    const aj = ajustarPeca(sala(), base0);
    if (!aj.ok) throw new Error("ajuste");
    const r = deLegado({ ...sala(), pecas: [aj.peca] }, { ...opcoes, produtos: { e1: espelho } });
    expect(r.ok && r.espaco.pecas[0]).toMatchObject({ paredeEncosto: "p2", rotacao: 270, montagem: "parede", altura: 1, largura: 0.6, profundidade: 0.03, espelhada: false });
  });
  it("uma peça espelhada guarda o espelhamento", () => {
    const m = modeloDoProduto({ id: "p1", n: "Base de duche 80×120", no: null, sub: "Bases Duche" });
    const pc = { ...pecaDeProduto(sala(), m, "pc1", { x: 150, y: 100 }), esp: true };
    const r = deLegado({ ...sala(), pecas: [pc] }, { ...opcoes, produtos: { p1: m } });
    expect(r.ok && r.espaco.pecas[0].espelhada).toBe(true);
  });
  it("uma janela do catálogo abre a parede com a altura do produto", () => {
    const j = modeloDoProduto({ id: "j1", n: "Janela PVC 100x120", no: null, sub: "Janelas PVC" });
    const pc = pecaDeProduto(sala(), j, "pc1", { x: 150, y: 0 });
    const r = deLegado({ ...sala(), pecas: [pc] }, { ...opcoes, produtos: { j1: j } });
    expect(r.ok && r.espaco.aberturas[0]).toMatchObject({ tipo: "janela", parede: "p1", largura: 1, altura: 1.2, peitoril: 0.9 });
  });  it("uma peça genérica (sem produto) ganha um modelo de reserva", () => {
    const r = deLegado(sala([{ id: "s", tipo: "sanita", x: 10, y: 10, w: 36, h: 55 }]), opcoes);
    expect(r.ok && r.espaco.pecas[0].produtoId).toBe("generico:sanita");
    expect(r.ok && r.modelos["generico:sanita"].mockup3d.tipo).toBe("sanita");
  });
});

describe("paredeMaisPerto", () => {
  it("devolve o índice, a distância e a posição ao longo da parede", () => {
    const w = paredesDoContorno([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }]);
    expect(paredeMaisPerto(w, { x: 1, y: 0.1 })).toMatchObject({ indice: 0, ao: 1 });
    expect(paredeMaisPerto(w, { x: 2.9, y: 1 })?.indice).toBe(1);
  });
});
