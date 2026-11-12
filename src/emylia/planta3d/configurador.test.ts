// Configurador de famílias (protótipo, só em memória): a matriz cor × medida, o preço e o SKU por célula, a validação e o registo.
import { afterEach, describe, expect, it } from "vitest";
import { FAMILIAS, acabamentosDaMedida, familiaPorId, familiasDaCategoria, modeloDaFamilia, resolverVariante, temGlbDoFabricante, variantesDe } from "./familias";
import { registarFamilias, todasAsFamilias } from "./familias";
import { celulaKey, criarFamiliaVazia, exemploKeran, ficheirosCompativeis, paraFamilia, skuDaCelula, validar, type FamiliaCfg } from "./configurador";
import { chaveFicheiro } from "./modelosHtml/ficheiros";

afterEach(() => registarFamilias([]));

/** uma família pequena: 2 acabamentos × 2 medidas, a 100 e a 150 € */
function base(): FamiliaCfg {
  return {
    id: "cfg:teste", marca: "Marca", nome: "Teste", categoria: "lavaloicas", tipo: "lava_loica", espacos: ["cozinha", "outro"],
    acabamentos: [
      { id: "a1", nome: "Inox", cor: "#c3c7ca", metalness: 1, roughness: 0.3, codigo: "IX" },
      { id: "a2", nome: "Negro", cor: "#151617", metalness: 0, roughness: 0.5, codigo: "NE" },
    ],
    medidas: [
      { id: "m1", rotulo: "80 cm", ref: "T-80", dim: [80, 50, 16], preco: 100 },
      { id: "m2", rotulo: "100 cm", ref: "T-100", dim: [100, 50, 16], preco: 150 },
    ],
    celulas: { "m1|a1": { ativo: true }, "m1|a2": { ativo: true }, "m2|a1": { ativo: true }, "m2|a2": { ativo: true } },
    regraSku: { modo: "auto", sep: "-" },
  };
}

describe("matriz cor × medida", () => {
  it("uma célula inactiva faz a cor não existir nessa medida (matriz parcial)", () => {
    const f = base();
    f.celulas["m2|a2"] = { ativo: false };
    const fam = paraFamilia(f);
    expect(acabamentosDaMedida(fam, "m1").map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(acabamentosDaMedida(fam, "m2").map((a) => a.id)).toEqual(["a1"]);
    expect(variantesDe(fam)).toHaveLength(3);
  });

  it("uma medida sem nenhuma célula activa deixa de existir na família gerada", () => {
    const f = base();
    f.celulas["m2|a1"] = { ativo: false }; f.celulas["m2|a2"] = { ativo: false };
    expect(paraFamilia(f).medidas.map((m) => m.id)).toEqual(["m1"]);
  });

  it("o preço é o da célula; sem ele, o da medida (duas medidas da mesma cor a preços diferentes)", () => {
    const f = base();
    f.celulas["m2|a1"] = { ativo: true, preco: 170 };
    const fam = paraFamilia(f);
    expect(resolverVariante(fam, "m1", "a1").preco).toBe(100);
    expect(resolverVariante(fam, "m2", "a1").preco).toBe(170);
    expect(resolverVariante(fam, "m2", "a2").preco).toBe(150);
    expect(modeloDaFamilia(fam, "m2", "a1").fam?.preco).toBe(170);
  });
});

describe("SKU", () => {
  it("automático: referência + separador + código do acabamento", () => {
    const fam = paraFamilia(base());
    expect(resolverVariante(fam, "m1", "a1").sku).toBe("T-80-IX");
    expect(resolverVariante(fam, "m2", "a2").sku).toBe("T-100-NE");
  });

  it("o separador é o da regra", () => {
    const f = base(); f.regraSku = { modo: "auto", sep: "." };
    expect(resolverVariante(paraFamilia(f), "m1", "a2").sku).toBe("T-80.NE");
  });

  it("automático ignora um SKU escrito à mão; manual usa-o e, se estiver vazio, cai no automático", () => {
    const f = base();
    f.celulas["m1|a1"] = { ativo: true, sku: "MEU-1" };
    expect(skuDaCelula(f, "m1", "a1")).toBe("T-80-IX");
    f.regraSku = { modo: "manual", sep: "-" };
    expect(resolverVariante(paraFamilia(f), "m1", "a1").sku).toBe("MEU-1");
    expect(resolverVariante(paraFamilia(f), "m1", "a2").sku).toBe("T-80-NE");
  });
});

describe("validar", () => {
  it("uma família certa não tem erros", () => expect(validar(base())).toEqual([]));

  it("o exemplo (Lava-loiça Keran, RODI HOME) é válido e tem uma célula inactiva", () => {
    const e = exemploKeran();
    expect(e.marca).toBe("RODI HOME");
    expect(e.acabamentos).toHaveLength(2); expect(e.medidas).toHaveLength(2);
    expect(validar(e)).toEqual([]);
    expect(variantesDe(paraFamilia(e)).length).toBeGreaterThanOrEqual(3);
  });

  it("medida sem preço: erro em português com o nome da medida", () => {
    const f = base(); f.medidas[1] = { ...f.medidas[1], preco: 0 };
    expect(validar(f)).toEqual([expect.stringContaining("100 cm")]);
    expect(validar(f)[0]).toMatch(/preço/i);
  });

  it("SKU duplicado entre células activas; inactiva não conta", () => {
    const f = base(); f.regraSku = { modo: "manual", sep: "-" };
    f.celulas["m1|a1"] = { ativo: true, sku: "X" }; f.celulas["m2|a1"] = { ativo: true, sku: "X" };
    expect(validar(f).join(" ")).toMatch(/SKU «X»/);
    f.celulas["m2|a1"] = { ativo: false, sku: "X" };
    expect(validar(f)).toEqual([]);
  });

  it("família sem nenhuma célula activa", () => {
    const f = base();
    for (const k of Object.keys(f.celulas)) f.celulas[k] = { ativo: false };
    expect(validar(f).join(" ")).toMatch(/nenhuma combinação/i);
  });

  it("id repetido: com uma demo, e com outra configurada", () => {
    const f = base(); f.id = "cfg:keran";
    expect(validar(f, ["cfg:keran"]).join(" ")).toMatch(/identificador/i);
    f.id = FAMILIAS[0].id;
    expect(validar(f).join(" ")).toMatch(/identificador/i);
  });

  it("sem nome, sem acabamentos e sem medidas", () => {
    const f = base(); f.nome = " "; f.acabamentos = []; f.medidas = []; f.celulas = {};
    const e = validar(f).join(" ");
    expect(e).toMatch(/nome/i); expect(e).toMatch(/acabamento/i); expect(e).toMatch(/medida/i);
  });

  it("a família vazia criada pelo botão ainda não é válida", () => expect(validar(criarFamiliaVazia()).length).toBeGreaterThan(0));
});

describe("modelo 3D por célula", () => {
  it("só se oferecem GLB do tipo certo (lava-loiça ou torneira); os outros tipos não têm", () => {
    expect(ficheirosCompativeis("lava_loica").length).toBeGreaterThan(10);
    expect(ficheirosCompativeis("lava_loica").every((x) => x.familia === "lava_loica")).toBe(true);
    expect(ficheirosCompativeis("torneira_cozinha").every((x) => x.familia === "torneira")).toBe(true);
    expect(ficheirosCompativeis("espelho")).toEqual([]);
  });

  it("a célula com GLB ganha o selo do fabricante e as outras ficam no modelo genérico", () => {
    const f = base();
    f.glb = { "m1|a1": chaveFicheiro("lava_loica", "keran80", "inox") };
    const fam = paraFamilia(f);
    expect(temGlbDoFabricante(resolverVariante(fam, "m1", "a1"))).toBe(true);
    expect(temGlbDoFabricante(resolverVariante(fam, "m1", "a2"))).toBe(false);
    const m = modeloDaFamilia(fam, "m1", "a1").mockup3d.params;
    expect(m && "html" in m ? m.html : undefined).toMatchObject({ modelo: "keran80", acab: "inox" });
    const g = modeloDaFamilia(fam, "m1", "a2").mockup3d.params;
    expect(g && "html" in g ? g.html : undefined).toBeUndefined();
  });
});

describe("registo", () => {
  it("registar acrescenta às demo: familiaPorId, categoria e todasAsFamilias; as demo ficam intactas", () => {
    const n = FAMILIAS.length, ids = FAMILIAS.map((f) => f.id);
    const fam = paraFamilia(base());
    registarFamilias([fam]);
    expect(familiaPorId("cfg:teste")).toBe(fam);
    expect(familiasDaCategoria("lavaloicas")).toContain(fam);
    expect(todasAsFamilias()).toHaveLength(n + 1);
    expect(fam.origem).toBe("configurada");
    expect(FAMILIAS).toHaveLength(n);
    expect(FAMILIAS.map((f) => f.id)).toEqual(ids);
    expect(FAMILIAS.some((f) => f.id.startsWith("cfg:"))).toBe(false);
  });

  it("registar de novo substitui a lista; vazio limpa e as demo continuam", () => {
    registarFamilias([paraFamilia(base())]);
    registarFamilias([]);
    expect(familiaPorId("cfg:teste")).toBeUndefined();
    expect(familiaPorId("keran")).toBeDefined();
    expect(todasAsFamilias()).toHaveLength(FAMILIAS.length);
  });

  it("só aceita ids com o prefixo cfg: (as outras são ignoradas, nunca sobrepõem uma demo)", () => {
    const intruso = { ...paraFamilia(base()), id: "keran" };
    registarFamilias([intruso]);
    expect(familiaPorId("keran")).not.toBe(intruso);
    expect(todasAsFamilias()).toHaveLength(FAMILIAS.length);
  });

  it("um id desconhecido (a página recarregou) não lança: devolve undefined", () => {
    expect(() => familiaPorId("cfg:desaparecida")).not.toThrow();
    expect(familiaPorId("cfg:desaparecida")).toBeUndefined();
  });

  it("celulaKey junta medida e acabamento", () => expect(celulaKey("m1", "a2")).toBe("m1|a2"));
});
