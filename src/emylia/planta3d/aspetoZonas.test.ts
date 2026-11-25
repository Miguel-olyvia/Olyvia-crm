// 25/11: o aspeto (metal e superfície) de uma zona do 3D. A superfície vem, por esta ordem, do atributo «Brilho» ou «Tonalidade» (por nome, com «Tem aspeto» ligado; uma ligação
// explícita manda sobre o nome e limita-o às zonas a que está ligado), da superfície por omissão da opção que pinta a zona, ou do modelo (null). O metal vem da opção que pinta a zona.
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto, OpcaoAtributo } from "../v2/catalogoModelo";
import { ROUGHNESS, ROUGHNESS_METAL, ehAtributoDeSuperficie, chaveDeExclusao, materialDaSuperficie, superficieDaZona } from "./aspetoZonas";

const op = (id: string, extra: Partial<OpcaoAtributo> = {}): OpcaoAtributo => ({ id, valor: id, nome: id, hex: null, ordem: 1, ...extra });
const def = (id: string, nome: string, opcoes: OpcaoAtributo[], extra: Partial<AtributoDef> = {}): AtributoDef => ({ id, codigo: nome.toLowerCase().replace(/ /g, "_"), nome, tipo: "lista", temHex: false, ordem: 1, opcoes, ...extra });
const esc = (atributoId: string, opcaoId: string): AtributoProduto => ({ atributoId, opcaoId });

const BRILHO = def("brilho", "Brilho", [op("polido", { superficie: "polida" }), op("fosco", { superficie: "mate" }), op("sem-superficie", { superficie: null })], { temAspeto: true });
const COR = def("cor", "Cor", [op("inox", { hex: "#cccccc", metal: true, superficie: "acetinada" }), op("branco", { hex: "#ffffff", metal: false, superficie: null })], { temHex: true, temAspeto: true });

describe("materialDaSuperficie: o que a superfície faz ao material (constantes nomeadas)", () => {
  it("polida, acetinada e mate dão a rugosidade de cada uma e deixam o metal como está (undefined)", () => {
    expect(materialDaSuperficie("polida", false)).toEqual({ roughness: ROUGHNESS.polida });
    expect(materialDaSuperficie("acetinada", false)).toEqual({ roughness: ROUGHNESS.acetinada });
    expect(materialDaSuperficie("mate", false)).toEqual({ roughness: ROUGHNESS.mate });
    expect(ROUGHNESS.polida).toBeLessThan(ROUGHNESS.acetinada);
    expect(ROUGHNESS.acetinada).toBeLessThan(ROUGHNESS.mate);
  });
  it("metal: metalness 1, com a rugosidade da superfície ou a do metal sem superfície", () => {
    expect(materialDaSuperficie("polida", true)).toEqual({ roughness: ROUGHNESS.polida, metalness: 1 });
    expect(materialDaSuperficie(null, true)).toEqual({ roughness: ROUGHNESS_METAL, metalness: 1 });
  });
  it("sem superfície e sem metal: nada a aplicar (null)", () => { expect(materialDaSuperficie(null, false)).toBeNull(); });
});

describe("ehAtributoDeSuperficie: «Brilho» ou «Tonalidade» (pelo nome ou pelo código) com «Tem aspeto»", () => {
  it("reconhece o nome sem maiúsculas nem acentos e o código", () => {
    expect(ehAtributoDeSuperficie(BRILHO)).toBe(true);
    expect(ehAtributoDeSuperficie(def("t", "TONALIDADE", [], { temAspeto: true }))).toBe(true);
    expect(ehAtributoDeSuperficie({ ...def("x", "Acabamento", [], { temAspeto: true }), codigo: "brilho" })).toBe(true);
  });
  it("sem «Tem aspeto» ou com outro nome: não", () => {
    expect(ehAtributoDeSuperficie({ ...BRILHO, temAspeto: false })).toBe(false);
    expect(ehAtributoDeSuperficie(def("x", "Textura", [], { temAspeto: true }))).toBe(false);
  });
});

describe("superficieDaZona", () => {
  const base = { defs: [COR, BRILHO] };
  it("o Brilho escolhido vence a superfície por omissão da opção de cor; o metal vem da opção de cor", () => {
    const r = superficieDaZona({ ...base, zona: "corpo", attrs: [esc("brilho", "polido")], daOpcaoDaCor: { metal: true, superficie: "acetinada" } });
    expect(r).toEqual({ metal: true, superficie: "polida", atributo: "Brilho" });
  });
  it("sem Brilho escolhido, vale a superfície por omissão da opção que pinta a zona", () => {
    expect(superficieDaZona({ ...base, zona: "corpo", attrs: [], daOpcaoDaCor: { metal: false, superficie: "acetinada" } })).toEqual({ metal: false, superficie: "acetinada" });
  });
  it("sem nada: sem superfície e sem metal (fica a do modelo)", () => {
    expect(superficieDaZona({ ...base, zona: "corpo", attrs: [], daOpcaoDaCor: null })).toEqual({ metal: false, superficie: null });
  });
  it("o Brilho com «Tem aspeto» desligado é ignorado", () => {
    const sem = { ...BRILHO, temAspeto: false };
    expect(superficieDaZona({ defs: [COR, sem], zona: "corpo", attrs: [esc("brilho", "polido")], daOpcaoDaCor: null })).toEqual({ metal: false, superficie: null });
  });
  it("uma opção de Brilho sem superfície não conta: vale a da opção de cor", () => {
    expect(superficieDaZona({ ...base, zona: "corpo", attrs: [esc("brilho", "sem-superficie")], daOpcaoDaCor: { metal: false, superficie: "mate" } }).superficie).toBe("mate");
  });
  it("o Brilho ligado só a `frente` não muda o corpo, e muda a frente", () => {
    const ligacoes = { brilho: ["frente"] as const };
    const p = { ...base, attrs: [esc("brilho", "polido")], ligacoes, daOpcaoDaCor: { metal: false, superficie: "mate" as const } };
    expect(superficieDaZona({ ...p, zona: "corpo" }).superficie).toBe("mate");
    expect(superficieDaZona({ ...p, zona: "frente" }).superficie).toBe("polida");
  });
  it("o Brilho excluído (aplicar: não) numa zona não a afecta", () => {
    const p = { ...base, attrs: [esc("brilho", "polido")], excluidos: new Set([chaveDeExclusao("brilho", "tampo")]), daOpcaoDaCor: null };
    expect(superficieDaZona({ ...p, zona: "tampo" }).superficie).toBeNull();
    expect(superficieDaZona({ ...p, zona: "corpo" }).superficie).toBe("polida");
  });
});
