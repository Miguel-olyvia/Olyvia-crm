// 25/11: as ligações atributo → zona e o aspeto (metal e superfície) nas zonas do 3D (zonasGlb.ts). REGRESSÃO primeiro: sem configuração e sem «Tem aspeto», o resultado é exactamente o de hoje
// (zonasGlb.test.ts passa sem mexer); depois: «aplicar: não» tira o atributo da zona (deixa de pintar pelo nome), a superfície e o metal entram em cada zona, e `porZona` distingue-os.
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto, OpcaoAtributo } from "../v2/catalogoModelo";
import { ligacoesDaConfig } from "../config3dDados";
import { chaveDeExclusao } from "./aspetoZonas";
import { ZONAS, aparenciaDaZona, zonasDosAtributos, zonasVisuais } from "./zonasGlb";

const op = (id: string, extra: Partial<OpcaoAtributo> = {}): OpcaoAtributo => ({ id, valor: id, nome: id, hex: null, foto: null, ordem: 1, ...extra });
const def = (id: string, nome: string, opcoes: OpcaoAtributo[], extra: Partial<AtributoDef> = {}): AtributoDef => ({ id, codigo: nome.toLowerCase().replace(/ /g, "_"), nome, tipo: "lista", temHex: true, ordem: 1, opcoes, ...extra });
const esc = (d: AtributoDef, opcaoId: string): AtributoProduto => ({ atributoId: d.id, opcaoId, valor: opcaoId });

const COR_CORPO = def("d-corpo", "Cor do corpo", [op("preto", { hex: "#000000" }), op("inox", { hex: "#cccccc", metal: true, superficie: "acetinada" })], { temAspeto: true });
const COR_FRENTE = def("d-frente", "Cor da frente", [op("branco", { hex: "#ffffff" })]);
const BRILHO = def("d-brilho", "Brilho", [op("polido", { superficie: "polida" }), op("fosco", { superficie: "mate" })], { temHex: false, temAspeto: true });

describe("REGRESSÃO: sem aspeto e sem configuração, a aparência é exactamente a de hoje (sem chaves novas)", () => {
  it("nenhuma chave `metal`, `superficie`, `acabamento` nem `material` quando nada disso se aplica", () => {
    const defs = [def("d-corpo", "Cor do corpo", [op("preto", { hex: "#000000" })]), COR_FRENTE];
    const r = zonasDosAtributos([esc(defs[0], "preto"), esc(COR_FRENTE, "branco")], defs)!;
    expect(r.zonas.frente).toEqual({ atributo: "Cor da frente", foto: null, hex: "#ffffff" });
    expect(r.zonas.corpo).toEqual({ atributo: "Cor do corpo", foto: null, hex: "#000000" });
    expect(r.ligadas).toBeUndefined();
    expect(zonasVisuais(r, () => null).zonas.corpo).toEqual({ atributo: "Cor do corpo", cor: "#000000" });
  });
  it("o Brilho escolhido sem «Tem aspeto» não muda nada", () => {
    const sem = { ...BRILHO, temAspeto: false };
    const r = zonasDosAtributos([esc(COR_FRENTE, "branco"), esc(sem, "polido")], [COR_FRENTE, sem])!;
    expect(Object.values(r.zonas).every((z) => z && !("superficie" in z) && !("acabamento" in z))).toBe(true);
  });
});

describe("«aplicar: não»: o atributo deixa de pintar essa zona, mesmo pelo nome", () => {
  const defs = [COR_CORPO, COR_FRENTE];
  const a = [esc(COR_CORPO, "preto"), esc(COR_FRENTE, "branco")];
  it("a «Cor da frente» excluída da frente: a frente cai na «Cor do corpo»", () => {
    expect(aparenciaDaZona("frente", a, defs)?.atributo).toBe("Cor da frente");
    expect(aparenciaDaZona("frente", a, defs, undefined, new Set([chaveDeExclusao("d-frente", "frente")]))?.atributo).toBe("Cor do corpo");
  });
  it("o único atributo de cor, excluído de uma zona: essa zona fica sem aparência; as outras mantêm-na", () => {
    const so = [COR_CORPO];
    const exc = new Set([chaveDeExclusao("d-corpo", "tampo")]);
    expect(aparenciaDaZona("tampo", [esc(COR_CORPO, "preto")], so, undefined, exc)).toBeNull();
    expect(aparenciaDaZona("corpo", [esc(COR_CORPO, "preto")], so, undefined, exc)?.hex).toBe("#000000");
  });
  it("a ligação vinda de ligacoesDaConfig (tudo menos a frente) chega ao zonasDosAtributos", () => {
    const { ligacoes, excluidos } = ligacoesDaConfig([{ atributo: "d-corpo", zona: "tudo", aplicar: true }, { atributo: "d-corpo", zona: "frente", aplicar: false }]);
    const r = zonasDosAtributos(a, defs, ligacoes, excluidos)!;
    expect(r.zonas.frente?.atributo).toBe("Cor da frente");
    expect(r.zonas.corpo?.atributo).toBe("Cor do corpo");
    expect(r.zonas.tampo?.atributo).toBe("Cor do corpo");
    expect(r.ligadas).toEqual(["corpo", "tampo", "puxadores", "pes", "estofo"]);
  });
});

describe("o aspeto entra em cada zona", () => {
  it("a opção de cor de metal: a zona que pinta leva metal e a superfície por omissão dela", () => {
    const r = zonasDosAtributos([esc(COR_CORPO, "inox")], [COR_CORPO])!;
    expect(r.zonas.corpo).toMatchObject({ atributo: "Cor do corpo", hex: "#cccccc", metal: true, superficie: "acetinada" });
  });
  it("o Brilho escolhido vence a superfície da opção de cor e dá o nome em `acabamento`; o metal fica da opção de cor", () => {
    const r = zonasDosAtributos([esc(COR_CORPO, "inox"), esc(BRILHO, "polido")], [COR_CORPO, BRILHO])!;
    expect(r.zonas.corpo).toMatchObject({ metal: true, superficie: "polida", acabamento: "Brilho" });
  });
  it("o Brilho sozinho (sem cor): todas as zonas levam a superfície, sem atributo de cor; o 3D fica com a cor do modelo", () => {
    const r = zonasDosAtributos([esc(BRILHO, "fosco")], [BRILHO])!;
    expect(r.zonas.frente).toEqual({ atributo: "", foto: null, hex: null, superficie: "mate", acabamento: "Brilho" });
    expect(ZONAS.every((z) => r.zonas[z]?.superficie === "mate")).toBe(true);
  });
  it("o Brilho ligado só à frente: só a frente leva superfície, e `porZona` passa a ser true", () => {
    const r = zonasDosAtributos([esc(COR_CORPO, "preto"), esc(BRILHO, "polido")], [COR_CORPO, BRILHO], { "d-brilho": ["frente"] })!;
    expect(r.zonas.frente?.superficie).toBe("polida");
    expect(r.zonas.corpo?.superficie).toBeUndefined();
    expect(r.porZona).toBe(true);
  });
  it("`porZona` distingue só pela superfície: mesma cor em todas as zonas, mas a frente polida e o resto mate", () => {
    const cor = def("d-cor", "Cor", [op("cinza", { hex: "#888888" })]);
    const r = zonasDosAtributos([esc(cor, "cinza"), esc(BRILHO, "polido")], [cor, BRILHO], { "d-brilho": ["frente"] })!;
    expect(r.porZona).toBe(true);
    const tudoIgual = zonasDosAtributos([esc(cor, "cinza"), esc(BRILHO, "polido")], [cor, BRILHO])!;
    expect(tudoIgual.porZona).toBe(false);
  });
  it("zonasVisuais leva o `material` (rugosidade e metal) e o `acabamento` para o 3D; sem aspeto não há `material`", () => {
    const r = zonasDosAtributos([esc(COR_CORPO, "inox"), esc(BRILHO, "polido")], [COR_CORPO, BRILHO])!;
    const v = zonasVisuais(r, () => null);
    expect(v.zonas.corpo).toMatchObject({ cor: "#cccccc", material: { roughness: 0.15, metalness: 1 }, acabamento: "Brilho" });
    const limpo = zonasVisuais(zonasDosAtributos([esc(COR_CORPO, "preto")], [COR_CORPO])!, () => null);
    expect(limpo.zonas.corpo).not.toHaveProperty("material");
  });
  it("as zonas ligadas (aplicar: sim) vão no resultado para o 3D saber quais pode pintar de novo (puxadores de metal)", () => {
    const r = zonasDosAtributos([esc(COR_CORPO, "preto")], [COR_CORPO], { "d-corpo": ["puxadores", "corpo"] })!;
    expect(zonasVisuais(r, () => null).ligadas).toEqual(["corpo", "puxadores"]);
  });
});
