// 25/11: a cor de BASE de um metal no 3D (corDoMetal): a amostra de catálogo (p.ex. Cobre #FFBA6B) é pálida porque é uma amostra de cor, não a reflectância do metal;
// a conta escurece e satura o tom de forma controlada (um cinzento fica cinzento), sem tocar no valor guardado.
import { describe, expect, it } from "vitest";
import { LUMINOSIDADE_METAL, SATURACAO_METAL, corDoMetal } from "./metal3d";

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const luz = (hex: string): number => { const [r, g, b] = rgb(hex); return (Math.max(r, g, b) + Math.min(r, g, b)) / 510; };
const croma = (hex: string): number => { const [r, g, b] = rgb(hex); return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };

describe("corDoMetal: a cor de base de um metal", () => {
  it("devolve sempre um hex de 6 dígitos", () => {
    for (const h of ["#FFBA6B", "#fff", "#C0C0C0", "#000000", "#ffffff", "#B76E79"]) expect(corDoMetal(h)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("um tom quente (Cobre, Ouro) fica mais escuro e não perde o matiz", () => {
    const antes = "#FFBA6B", depois = corDoMetal(antes);
    expect(luz(depois)).toBeLessThan(luz(antes));
    expect(luz(depois)).toBeCloseTo(luz(antes) * LUMINOSIDADE_METAL, 1);
    const [r, g, b] = rgb(depois);
    expect(r).toBeGreaterThan(g); expect(g).toBeGreaterThan(b); // continua laranja: vermelho > verde > azul
  });
  it("um cinzento (Cromo, Inox, Prata) continua cinzento e não escurece", () => {
    for (const h of ["#c0c0c0", "#e5e5e5", "#8a8a8a"]) {
      const d = corDoMetal(h), [r, g, b] = rgb(d);
      expect(r).toBe(g); expect(g).toBe(b);
      expect(luz(d)).toBeCloseTo(luz(h), 2);
    }
  });
  it("o escurecimento é gradual: quanto mais colorido, mais escurece", () => {
    const pouco = corDoMetal("#d9cfc8"), muito = corDoMetal("#ffba6b");
    expect(luz(pouco) / luz("#d9cfc8")).toBeGreaterThan(luz(muito) / luz("#ffba6b"));
  });
  it("a saturação sobe ao máximo SATURACAO_METAL e nunca passa de 1", () => {
    expect(SATURACAO_METAL).toBeGreaterThanOrEqual(1);
    const a = corDoMetal("#e8b4a0");
    expect(croma(a) / (1 - Math.abs(2 * luz(a) - 1))).toBeLessThanOrEqual(1.0001);
  });
  it("aceita #abc e maiúsculas; um valor inválido sai como veio (não parte nada)", () => {
    expect(corDoMetal("#FFF")).toBe(corDoMetal("#ffffff"));
    expect(corDoMetal("#FFBA6B")).toBe(corDoMetal("#ffba6b"));
    expect(corDoMetal("laranja")).toBe("laranja");
    expect(corDoMetal("")).toBe("");
  });
});
