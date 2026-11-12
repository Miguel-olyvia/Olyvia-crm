// Configurador de famílias (protótipo, só em memória): a matriz cor × medida, o preço e o SKU por célula, a validação e o registo.
import { afterEach, describe, expect, it } from "vitest";
import { FAMILIAS, acabamentosDaMedida, familiaPorId, familiasDaCategoria, modeloDaFamilia, resolverVariante, temGlbDoFabricante, variantesDe } from "./familias";
import { registarFamilias, todasAsFamilias } from "./familias";
import {
  ALVO_PROTO, TIPOS_DA_CATEGORIA, atribuicoesDaFamilia, categoriaSugerida, celulaKey, criarFamiliaVazia, erroNomeAtributo, familiaDeProdutos, ficheiroSugerido, ficheirosCompativeis,
  linhasDeVariantes, palpiteDoProduto, paraFamilia, refDoProduto, resumoDeProdutos, rotuloDaMedida, skuDaCelula, sugerirFamilia, validar,
  type AtribuicaoProduto, type FamiliaCfg, type ProdutoRef,
} from "./configurador";
import { familiaKeranDeTeste } from "./familiaDeTeste";
import { chaveFicheiro } from "./modelosHtml/ficheiros";
import { produtoIdsAgrupados } from "./familias";

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

  it("uma família feita de produtos do catálogo (Keran, RODI HOME: 3 produtos) é válida e gera as 3 variantes", () => {
    const e = familiaKeranDeTeste();
    expect(e.marca).toBe("RODI HOME");
    expect(e.acabamentos).toHaveLength(2); expect(e.medidas).toHaveLength(2);
    expect(validar(e)).toEqual([]);
    expect(variantesDe(paraFamilia(e))).toHaveLength(3);
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

  it("a família de partida (sem produtos) ainda não é válida", () => expect(validar(criarFamiliaVazia()).length).toBeGreaterThan(0));
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

/* ------------------------------------------------------------------ juntar produtos que já existem no catálogo */
describe("palpiteDoProduto: medida e acabamento a partir do nome", () => {
  it("«Lody 40 U-F - Cobre»: medida 40 e acabamento Cobre (depois do hífen)", () => {
    const p = palpiteDoProduto("Lody 40 U-F - Cobre");
    expect(p).toMatchObject({ medida: "40 cm", acabamento: "Cobre", codigo: "CO", acabId: "cobre" });
    expect(p.dim).toEqual([40, 50, 20]);
  });
  it("lava-loiça (tipo): a largura leva 4 cm de rebordo e a profundidade é 44", () => {
    expect(palpiteDoProduto("Lody 40 U-F - Cobre", { tipo: "lava_loica" }).dim).toEqual([44, 44, 20]);
  });
  it("«Lava-louças VELAR 1 CUBA 50»: a medida vem depois de CUBA; sem acabamento no nome, o subtipo «Cubas inox» dá Inox", () => {
    expect(palpiteDoProduto("Lava-louças VELAR 1 CUBA 50", { sub: "Cubas inox" })).toMatchObject({ medida: "50 cm", acabamento: "Inox", acabId: "inox" });
  });
  it("sem acabamento reconhecível, o acabamento é «Padrão»", () => {
    expect(palpiteDoProduto("Lava-louças VELAR 1 CUBA 50")).toMatchObject({ medida: "50 cm", acabamento: "Padrão", codigo: "STD" });
    expect(palpiteDoProduto("Lava-louças VELAR 1 CUBA 50").acabId).toBeUndefined();
  });
  it("«… 45 S-IF 523 030 86CM»: a medida explícita em cm ganha; o último acabamento do nome ganha (Blanco é marca, Inox é o acabamento)", () => {
    expect(palpiteDoProduto("LAVA LOUÇA BLANCO INOX LEMIS 45 S-IF 523 030 86CM")).toMatchObject({ medida: "86 cm", acabamento: "Inox" });
  });
  it("«AMBAR 100 C/ESCORREDOR 1 CUBA» → 100; «1.5 CUBA 55» → 55; «DUO 60 - 2 CUBAS» → 60 e o fim «2 CUBAS» não é um acabamento", () => {
    expect(palpiteDoProduto("Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA").medida).toBe("100 cm");
    expect(palpiteDoProduto("Lava-louças AMBAR 1.5 CUBA 55").medida).toBe("55 cm");
    const d = palpiteDoProduto("Lava-louças DUO 60 - 2 CUBAS");
    expect(d.medida).toBe("60 cm");
    expect(d.acabamento).toBe("Padrão");
  });
  it("dimensões escritas no nome: «Móvel 60x45x80» → 60, 45 e 80", () => {
    const p = palpiteDoProduto("Móvel baixo 60x45x80 - Branco");
    expect(p.dim).toEqual([60, 45, 80]);
    expect(p).toMatchObject({ medida: "60×45×80 cm", acabamento: "Branco", acabId: "blanco" });
  });
  it("sem número no nome: medida «Única»", () => {
    expect(palpiteDoProduto("Misturadoras Monocomando ROUND").medida).toBe("Única");
  });
  it("um fim «- Rosa velho» que não está no dicionário é o nome do acabamento, com código das iniciais", () => {
    expect(palpiteDoProduto("Lava-louças X 40 - Rosa velho")).toMatchObject({ acabamento: "Rosa velho", codigo: "RV" });
  });
  it("texto vazio ou só espaços: não rebenta", () => {
    expect(palpiteDoProduto("   ")).toMatchObject({ medida: "Única", acabamento: "Padrão" });
  });
});

describe("sugerirFamilia, categoriaSugerida e ficheiroSugerido", () => {
  const ref = (id: string, n: string, extra: Partial<ProdutoRef> = {}): ProdutoRef => ({ id, n, marca: "FRASA", sku: id.toUpperCase(), preco: 100, semPvp: false, ...extra });
  it("o nome é o começo comum dos nomes, sem números nem «CUBA» no fim; a marca é a mais frequente", () => {
    const s = sugerirFamilia([ref("a", "Lava-louças VELAR 1 CUBA 34"), ref("b", "Lava-louças VELAR 1 CUBA 40"), ref("c", "Lava-louças VELAR 1 CUBA 50", { marca: "Rodi" }), ref("d", "Lava-louças VELAR 1 CUBA 70")]);
    expect(s).toEqual({ nome: "Lava-louças VELAR", marca: "FRASA" });
  });
  it("um só produto: o nome dele sem a medida; sem produtos: vazio", () => {
    expect(sugerirFamilia([ref("a", "Lody 40 U-F - Cobre")]).nome).toBe("Lody U-F");
    expect(sugerirFamilia([])).toEqual({ nome: "", marca: "" });
  });
  it("categoriaSugerida: cada tipo cai numa categoria que o aceita", () => {
    expect(categoriaSugerida("lava_loica")).toEqual({ categoria: "lavaloicas", tipo: "lava_loica" });
    expect(categoriaSugerida("torneira_cozinha")).toEqual({ categoria: "torneiras", tipo: "torneira_cozinha" });
    expect(categoriaSugerida("resguardo")).toEqual({ categoria: "banho", tipo: "resguardo" });
    for (const t of ["sanita", "caixa", "placa", "tampo", "bancada"] as const) { const c = categoriaSugerida(t); expect(TIPOS_DA_CATEGORIA[c.categoria]).toContain(c.tipo); }
  });
  it("ficheiroSugerido: Lody 40 Cobre (lava-loiça) e Smooth Cromo (torneira) casam com um GLB do fabricante", () => {
    expect(ficheiroSugerido("lava_loica", "Lody 40 U-F - Cobre", palpiteDoProduto("Lody 40 U-F - Cobre"))).toBe(chaveFicheiro("lava_loica", "lody40", "cobre"));
    const t = "Misturadoras Monocomando Extraível SMOOTH - Cromo";
    expect(ficheiroSugerido("torneira_cozinha", t, palpiteDoProduto(t))).toBe(chaveFicheiro("torneira", "smooth", "chrome"));
  });
  it("ficheiroSugerido: Velar 70 apanha o velar71 (1 cm de diferença) e o sufixo N distingue ambar40n de ambar40", () => {
    const v = "Lava-louças VELAR 1 CUBA 70";
    expect(ficheiroSugerido("lava_loica", v, palpiteDoProduto(v, { sub: "Cubas inox" }))).toBe(chaveFicheiro("lava_loica", "velar71", "inox"));
    const a = "Lava-louças AMBAR 1 CUBA 40 N - Negro", b = "Lava-louças AMBAR 1 CUBA 40 - Negro";
    expect(ficheiroSugerido("lava_loica", a, palpiteDoProduto(a))).toBe(chaveFicheiro("lava_loica", "ambar40n", "negro"));
    expect(ficheiroSugerido("lava_loica", b, palpiteDoProduto(b))).toBe(chaveFicheiro("lava_loica", "ambar40", "negro"));
  });
  it("ficheiroSugerido: sem acabamento conhecido, sem GLB de outro tipo, ou nome que não casa, devolve vazio", () => {
    expect(ficheiroSugerido("lava_loica", "Lava-louças KERAN 80", palpiteDoProduto("Lava-louças KERAN 80"))).toBe("");
    expect(ficheiroSugerido("movel", "Lody 40 - Cobre", palpiteDoProduto("Lody 40 - Cobre"))).toBe("");
    expect(ficheiroSugerido("lava_loica", "Lava-louças Zeta 40 - Cobre", palpiteDoProduto("Lava-louças Zeta 40 - Cobre"))).toBe("");
  });
});

describe("refDoProduto: o preço de venda é o do catálogo", () => {
  const prod = { id: "p1", n: "X", marca: "M", sku: " S1 ", sub: "Cubas inox", custo: 65 };
  it("com PVP usa o PVP; sem PVP, custo ÷ (1 − margem-alvo), como o catálogo (precoUnitario)", () => {
    expect(refDoProduto({ ...prod, pvp: 149 })).toMatchObject({ preco: 149, semPvp: false, sku: "S1" });
    const r = refDoProduto(prod);
    expect(ALVO_PROTO).toBe(35);
    expect(r).toMatchObject({ preco: 100, semPvp: true });
  });
  it("sem PVP e sem custo: preço 0 (é erro mais à frente); sem referência: o id serve de SKU", () => {
    expect(refDoProduto({ id: "p9", n: "Y", custo: 0 })).toMatchObject({ preco: 0, semPvp: true, sku: "p9" });
  });
});

describe("familiaDeProdutos: agrupar produtos reais numa família", () => {
  const nova = (): FamiliaCfg => ({ ...criarFamiliaVazia(), id: "cfg:lody-do-catalogo", nome: "Lody do catálogo", marca: "FRASA", acabamentos: [], medidas: [], celulas: {} });
  const ACABS = [["Cobre", "CO"], ["Gold", "GO"], ["Gunmetal", "GM"]] as const;
  const refs9: ProdutoRef[] = [], atrib9: AtribuicaoProduto[] = [];
  for (const [i, tam] of [40, 50, 70].entries()) for (const [j, [ac, cod]] of ACABS.entries()) {
    const id = `p-${tam}-${cod}`;
    refs9.push({ id, n: `Lava-louças Lody ${tam} - ${ac}`, marca: "FRASA", sku: `LLCCI-${tam}${cod}`, preco: 140 + i * 20 + j, semPvp: false });
    atrib9.push({ produtoId: id, medida: `${tam} cm`, dim: [tam + 4, 44, 20], acabamento: ac, cor: "#bc825b", codigo: cod });
  }
  it("9 produtos → 3 medidas × 3 acabamentos, 9 células ativas, e a família valida sem erros", () => {
    const { familia: f, conflitos } = familiaDeProdutos(nova(), refs9, atrib9);
    expect(conflitos).toEqual([]);
    expect(f.medidas.map((m) => m.rotulo)).toEqual(["40 cm", "50 cm", "70 cm"]);
    expect(f.acabamentos.map((a) => a.nome)).toEqual(["Cobre", "Gold", "Gunmetal"]);
    expect(Object.values(f.celulas).filter((c) => c.ativo && c.produtoId)).toHaveLength(9);
    expect(validar(f)).toEqual([]);
    expect(resumoDeProdutos(f).texto).toBe("9 produtos = 9 variantes");
  });
  it("o SKU e o preço de cada variante vêm do produto (não da regra ref+código nem do preço da medida)", () => {
    const { familia: f } = familiaDeProdutos(nova(), refs9, atrib9);
    const linhas = linhasDeVariantes(f);
    expect(linhas.map((l) => l.sku).sort()).toEqual(refs9.map((r) => r.sku).sort());
    for (const r of refs9) expect(linhas.find((l) => l.sku === r.sku)?.preco).toBe(r.preco);
    expect(skuDaCelula(f, "m1", "a1")).toBe("LLCCI-40CO");
  });
  it("paraFamilia e resolverVariante respeitam o produto: SKU, preço e produtoId; modeloDaFamilia leva-os para a peça", () => {
    const fam = paraFamilia(familiaDeProdutos(nova(), refs9, atrib9).familia);
    expect(variantesDe(fam)).toHaveLength(9);
    const v = resolverVariante(fam, "m2", "a3");
    expect(v).toMatchObject({ sku: "LLCCI-50GM", preco: 162, produtoId: "p-50-GM" });
    const m = modeloDaFamilia(fam, "m2", "a3");
    expect(m.fam).toMatchObject({ sku: "LLCCI-50GM", preco: 162, produtoId: "p-50-GM" });
    expect(produtoIdsAgrupados().size).toBe(0);
    registarFamilias([fam]);
    expect([...produtoIdsAgrupados()].sort()).toEqual(refs9.map((r) => r.id).sort());
  });
  it("produtos com a mesma medida juntam-se no mesmo «produto» da família (e as dimensões são as do primeiro)", () => {
    const { familia: f } = familiaDeProdutos(nova(), refs9.slice(0, 3), atrib9.slice(0, 3));
    expect(f.medidas).toHaveLength(1);
    expect(Object.keys(f.celulas)).toEqual(["m1|a1", "m1|a2", "m1|a3"]);
    expect(f.medidas[0].dim).toEqual([44, 44, 20]);
  });
  it("duas atribuições na mesma medida × acabamento: a segunda fica de fora e há um conflito legível", () => {
    const dup = { ...atrib9[0], produtoId: "p-40-CO2" };
    const { familia: f, conflitos } = familiaDeProdutos(nova(), [...refs9.slice(0, 1), { ...refs9[0], id: "p-40-CO2", n: "Lava-louças Lody 40 - Cobre (bis)" }], [atrib9[0], dup]);
    expect(Object.values(f.celulas)).toHaveLength(1);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]).toMatch(/mesmos valores em todos os atributos \(Medida: 40 cm; Cor: Cobre\)/);
  });
  it("produto sem preço de venda: a família deixa de validar, com o nome do produto", () => {
    const refs = refs9.map((r, i) => (i === 0 ? { ...r, preco: 0 } : r));
    const { familia: f } = familiaDeProdutos(nova(), refs, atrib9);
    expect(validar(f).some((m) => /Lava-louças Lody 40 - Cobre.*não tem preço de venda/.test(m))).toBe(true);
  });
  it("o mesmo produto em duas variantes é erro", () => {
    const { familia } = familiaDeProdutos(nova(), refs9, atrib9);
    const f = { ...familia, celulas: { ...familia.celulas, "m2|a1": { ...familia.celulas["m1|a1"] } } };
    expect(validar(f).some((m) => /mesmo produto do catálogo/.test(m))).toBe(true);
  });
  it("sem produtos atribuídos, ou atribuição de um produto desconhecido: família vazia, sem rebentar", () => {
    expect(familiaDeProdutos(nova(), [], []).familia.medidas).toEqual([]);
    expect(familiaDeProdutos(nova(), refs9.slice(0, 1), [{ ...atrib9[0], produtoId: "nao-existe" }]).familia.celulas).toEqual({});
  });
  it("o GLB escolhido vai para a célula e sai se não serve o tipo da família", () => {
    const g = chaveFicheiro("lava_loica", "lody40", "cobre");
    const { familia: f } = familiaDeProdutos(nova(), refs9.slice(0, 1), [{ ...atrib9[0], glb: g }]);
    expect(f.glb).toEqual({ "m1|a1": g });
    const outro = familiaDeProdutos({ ...nova(), tipo: "movel", categoria: "cozinha" }, refs9.slice(0, 1), [{ ...atrib9[0], glb: g }]).familia;
    expect(outro.glb).toEqual({});
  });

  it("o SKU de cada produto do catálogo prevalece sobre a regra ref + código (mesmo com a regra em modo automático)", () => {
    const { familia: f } = familiaDeProdutos(nova(), refs9, atrib9);
    expect(skuDaCelula({ ...f, regraSku: { modo: "auto", sep: "-" } }, "m1", "a1")).toBe("LLCCI-40CO");
  });
});

/* ------------------------------------------------------------------ atributos livres */
describe("atributos extra: juntam-se ao rótulo da medida", () => {
  const nova = (atributos: string[]): FamiliaCfg => ({ ...criarFamiliaVazia(), id: "cfg:velar", nome: "Velar", marca: "FRASA", atributos });
  const ref = (id: string, n: string, preco: number): ProdutoRef => ({ id, n, marca: "FRASA", sku: id.toUpperCase(), preco, semPvp: false });
  const atr = (produtoId: string, medida: string, acabamento: string, extras?: Record<string, string>): AtribuicaoProduto =>
    ({ produtoId, medida, dim: [54, 44, 20], acabamento, cor: "#c3c7ca", codigo: acabamento.slice(0, 2).toUpperCase(), ...(extras ? { extras } : {}) });
  const refs = [ref("a", "Velar 50 1 cuba", 100), ref("b", "Velar 50 2 cubas", 120), ref("c", "Velar 70 2 cubas", 150), ref("d", "Velar 70 2 cubas Negro", 160)];
  const atrs = [atr("a", "50 cm", "Inox", { "Nº de cubas": "1 cuba" }), atr("b", "50 cm", "Inox", { "Nº de cubas": "2 cubas" }), atr("c", "70 cm", "Inox", { "Nº de cubas": "2 cubas" }), atr("d", "70 cm", "Negro", { "Nº de cubas": "2 cubas" })];

  it("rotuloDaMedida: medida + valores extra não vazios, separados por « · »; «Única» some se há extras", () => {
    expect(rotuloDaMedida("50 cm", ["2 cubas"])).toBe("50 cm · 2 cubas");
    expect(rotuloDaMedida("50 cm", ["2 cubas", "  ", "Inox"])).toBe("50 cm · 2 cubas · Inox");
    expect(rotuloDaMedida("50 cm", [])).toBe("50 cm");
    expect(rotuloDaMedida("Única", ["2 cubas"])).toBe("2 cubas");
    expect(rotuloDaMedida("", [])).toBe("Única");
  });

  it("o rótulo do «produto» da família é medida + extras, e só existem as combinações dos produtos reais", () => {
    const { familia: f, conflitos } = familiaDeProdutos(nova(["Nº de cubas"]), refs, atrs);
    expect(conflitos).toEqual([]);
    expect(f.medidas.map((m) => m.rotulo)).toEqual(["50 cm · 1 cuba", "50 cm · 2 cubas", "70 cm · 2 cubas"]);
    expect(f.atributos).toEqual(["Nº de cubas"]);
    // 4 produtos, 3 medidas × 2 acabamentos = 6 combinações possíveis, mas só 4 existem
    expect(Object.keys(f.celulas)).toHaveLength(4);
    const fam = paraFamilia(f);
    expect(variantesDe(fam)).toHaveLength(4);
    expect(acabamentosDaMedida(fam, "m1").map((a) => a.nome)).toEqual(["Inox"]);
    expect(acabamentosDaMedida(fam, "m3").map((a) => a.nome)).toEqual(["Inox", "Negro"]);
    expect(validar(f)).toEqual([]);
  });

  it("cada produto fica com a medida base e os valores extra na célula; as linhas do resumo trazem-nos, com o SKU e o preço do produto", () => {
    const { familia: f } = familiaDeProdutos(nova(["Nº de cubas"]), refs, atrs);
    expect(f.celulas["m2|a1"]).toMatchObject({ produtoId: "b", medida: "50 cm", valores: { "Nº de cubas": "2 cubas" }, sku: "B", preco: 120 });
    const l = linhasDeVariantes(f).find((x) => x.produtoId === "b")!;
    expect(l).toMatchObject({ produto: "Velar 50 2 cubas", medida: "50 cm", acabamento: "Inox", valores: { "Nº de cubas": "2 cubas" }, sku: "B", preco: 120 });
    expect(resumoDeProdutos(f).texto).toBe("4 produtos = 4 variantes");
  });

  it("dois produtos com os mesmos valores em TODOS os atributos: erro legível; mudar um dos valores resolve", () => {
    const dup = [atr("a", "50 cm", "Inox", { "Nº de cubas": "2 cubas" }), atr("b", "50 cm", "Inox", { "Nº de cubas": "2 cubas" })];
    const r = familiaDeProdutos(nova(["Nº de cubas"]), refs.slice(0, 2), dup);
    expect(r.conflitos).toHaveLength(1);
    expect(r.conflitos[0]).toMatch(/«Velar 50 1 cuba» e «Velar 50 2 cubas» têm os mesmos valores em todos os atributos \(Medida: 50 cm; Nº de cubas: 2 cubas; Cor: Inox\)/);
    expect(Object.keys(r.familia.celulas)).toHaveLength(1);
    expect(familiaDeProdutos(nova(["Nº de cubas"]), refs.slice(0, 2), [dup[0], atr("b", "50 cm", "Inox", { "Nº de cubas": "1 cuba" })]).conflitos).toEqual([]);
  });

  it("sem o atributo extra, os mesmos dois produtos colidem; com ele, distinguem-se (o atributo é o que os separa)", () => {
    const duas = [atr("a", "50 cm", "Inox", { "Nº de cubas": "1 cuba" }), atr("b", "50 cm", "Inox", { "Nº de cubas": "2 cubas" })];
    expect(familiaDeProdutos(nova([]), refs.slice(0, 2), duas).conflitos).toHaveLength(1);
    expect(familiaDeProdutos(nova(["Nº de cubas"]), refs.slice(0, 2), duas).conflitos).toEqual([]);
  });

  it("um valor em branco não entra no rótulo; valores de atributos que já não existem são ignorados", () => {
    const r = familiaDeProdutos(nova(["Material"]), refs.slice(0, 1), [atr("a", "50 cm", "Inox", { Material: "  ", "Nº de cubas": "1 cuba" })]);
    expect(r.familia.medidas.map((m) => m.rotulo)).toEqual(["50 cm"]);
    expect(r.familia.celulas["m1|a1"].valores).toBeUndefined();
  });

  it("erroNomeAtributo: vazio, repetido (sem distinguir maiúsculas) e os que já existem são recusados", () => {
    expect(erroNomeAtributo("Material", [])).toBe("");
    expect(erroNomeAtributo("  ", [])).toMatch(/Escreva o nome/);
    expect(erroNomeAtributo("material", ["Material"])).toMatch(/Já há um atributo/);
    for (const n of ["Medida", "cor", "Acabamento", "Cor/Acabamento"]) expect(erroNomeAtributo(n, [])).toMatch(/já existe em cada produto/);
  });

  it("atribuicoesDaFamilia é o inverso de familiaDeProdutos (para voltar a editar): refaz a mesma família", () => {
    const { familia: f } = familiaDeProdutos(nova(["Nº de cubas"]), refs, atrs);
    const volta = atribuicoesDaFamilia(f);
    expect(volta.map((a) => [a.produtoId, a.medida, a.acabamento, a.extras?.["Nº de cubas"]])).toEqual([
      ["a", "50 cm", "Inox", "1 cuba"], ["b", "50 cm", "Inox", "2 cubas"], ["c", "70 cm", "Inox", "2 cubas"], ["d", "70 cm", "Negro", "2 cubas"],
    ]);
    const refeita = familiaDeProdutos(nova(["Nº de cubas"]), refs, volta).familia;
    expect(refeita.medidas.map((m) => m.rotulo)).toEqual(f.medidas.map((m) => m.rotulo));
    expect(Object.keys(refeita.celulas)).toEqual(Object.keys(f.celulas));
  });
});
