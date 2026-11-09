// Pavimentos e revestimentos de parede como produtos: variantes, escolha por parede (parede de destaque), venda em m², e a planta guarda-os.
import { describe, expect, it } from "vitest";
import { gravarPlanta, lerPlanta, retangulo, type Planta } from "../planta";
import { deLegado } from "./ligacao";
import { revestimentoDaParede, revestimentoDe } from "./revestimentos";
import { PRODUTOS_REV, linhasDosRevestimentos, revestimentoDoCatalogo } from "./revestimentosCatalogo";
import { linhasVendaveis } from "./conjuntos";

// divisão 3 × 2 m; chão em microcimento, paredes em tinta branca e a parede 2 (direita) em azulejo metro verde
const planta: Planta = { o: { x: 0, y: 0 }, paredes: retangulo(300, 200), pecas: [], rev: { pavimento: "microcimento_chao:claro", parede: "tinta:branco", porParede: { p2: "metro:verde" } } };

describe("revestimentos como produtos", () => {
  it("o catálogo tem os grupos pedidos, cada produto com variantes de cor e textura", () => {
    expect(PRODUTOS_REV.filter((p) => p.superficie === "pavimento").length).toBeGreaterThanOrEqual(7);
    expect(PRODUTOS_REV.filter((p) => p.superficie === "parede").length).toBeGreaterThanOrEqual(7);
    expect(revestimentoDoCatalogo("tinta:terracota")).toMatchObject({ tipo: "tinta", cor: "#c47e5e" });
    expect(revestimentoDe("parede", "metro:verde")).toMatchObject({ tipo: "metro", modulo: 0.075 });
  });
  it("a escolha por parede: a de destaque leva o seu, as outras o de todas", () => {
    const res = deLegado(planta, { tipo: "casa_banho", nome: "T", peDireito: 2.6, produtos: {} });
    if (!res.ok) throw new Error(res.erro);
    const r = res.espaco.revestimentos;
    expect(revestimentoDaParede(r, "p2")).toBe("metro:verde");
    expect(revestimentoDaParede(r, "p1")).toBe("tinta:branco");
    expect(r.pavimento).toBe("microcimento_chao:claro");
  });
  it("conta como linhas vendáveis em m² (chão 6 m², parede de destaque 2 × 2,6, as outras 8 × 2,6)", () => {
    const l = linhasDosRevestimentos(planta);
    expect(l.find((x) => x.id === "microcimento_chao:claro")?.m2).toBe(6);
    expect(l.find((x) => x.id === "metro:verde")?.m2).toBe(5.2);
    expect(l.find((x) => x.id === "tinta:branco")?.m2).toBe(20.8);
    expect(linhasVendaveis(planta).filter((x) => x.categoria === "Revestimento")).toHaveLength(3);
  });
  it("a planta guarda e lê a escolha (desfazer/refazer e o negócio gravado)", () => {
    expect(lerPlanta(gravarPlanta(planta))?.rev).toEqual(planta.rev);
  });
});
