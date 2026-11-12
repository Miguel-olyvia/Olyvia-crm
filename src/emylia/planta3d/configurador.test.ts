// Configurador de famílias (protótipo, só em memória): a matriz cor × medida, o preço e o SKU por célula, a validação e o registo.
import { afterEach, describe, expect, it } from "vitest";
import { FAMILIAS, acabamentosDaMedida, familiaPorId, familiasDaCategoria, modeloDaFamilia, resolverVariante, temGlbDoFabricante, variantesDe } from "./familias";
import { registarFamilias, todasAsFamilias } from "./familias";
import {
  acabamentosDoProduto, alterarVariante, aplicarAcabamentoATodos, celulaKey, copiarAcabamentosParaOutros, criarFamiliaVazia, exemploKeran, exemploLodyFrasa, ficheirosCompativeis,
  juntarAcabamentoAoProduto, juntarProduto, linhasDeVariantes, paraFamilia, prepararParaEdicao, resumoDeProdutos, skuDaCelula, tirarAcabamentoDoProduto, tirarProduto, validar, type FamiliaCfg,
} from "./configurador";
import { FICHEIROS_3D, chaveFicheiro } from "./modelosHtml/ficheiros";
import {
  ALVO_PROTO, TIPOS_DA_CATEGORIA, alterarVariante as alterarVarianteCat, categoriaSugerida, familiaDeProdutos, ficheiroSugerido, palpiteDoProduto, refDoProduto, sugerirFamilia,
  type AtribuicaoProduto, type ProdutoRef,
} from "./configurador";
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

/* ------------------------------------------------------------------ acabamentos POR PRODUTO (cada medida é um produto com os seus acabamentos) */
/** uma família sem produtos nem acabamentos: tudo se constrói por produto */
const vazia = (): FamiliaCfg => ({ ...base(), acabamentos: [], medidas: [], celulas: {}, glb: {} });
/** produto 1 (T-80) com Inox e Negro; produto 2 (T-100) só com Cobre */
function doisProdutos(): FamiliaCfg {
  let f = juntarProduto(juntarProduto(vazia()));
  f = { ...f, medidas: [{ ...f.medidas[0], rotulo: "80 cm", ref: "T-80", preco: 100 }, { ...f.medidas[1], rotulo: "100 cm", ref: "T-100", preco: 150 }] };
  f = juntarAcabamentoAoProduto(f, "m1", { nome: "Inox", codigo: "IX", cor: "#c3c7ca" });
  f = juntarAcabamentoAoProduto(f, "m1", { nome: "Negro", codigo: "NE" });
  return juntarAcabamentoAoProduto(f, "m2", { nome: "Cobre", codigo: "CO" });
}

describe("produtos com acabamentos próprios", () => {
  it("um produto novo nasce sem acabamentos e sem células", () => {
    const f = juntarProduto(vazia());
    expect(f.medidas).toHaveLength(1);
    expect(acabamentosDoProduto(f, f.medidas[0].id)).toEqual([]);
    expect(f.celulas).toEqual({});
  });

  it("2 produtos com acabamentos diferentes geram só as variantes certas, com SKUs e preços distintos", () => {
    const f = alterarVariante(doisProdutos(), "m1", "a2", { preco: 110 });
    const linhas = linhasDeVariantes(f);
    expect(linhas.map((l) => [l.produto, l.acabamento, l.sku, l.preco])).toEqual([
      ["80 cm", "Inox", "T-80-IX", 100], ["80 cm", "Negro", "T-80-NE", 110], ["100 cm", "Cobre", "T-100-CO", 150],
    ]);
    expect(validar(f)).toEqual([]);
    const fam = paraFamilia(f);
    expect(acabamentosDaMedida(fam, "m1").map((a) => a.nome)).toEqual(["Inox", "Negro"]);
    expect(acabamentosDaMedida(fam, "m2").map((a) => a.nome)).toEqual(["Cobre"]);
    expect(variantesDe(fam)).toHaveLength(3);
  });

  it("um acabamento pode existir só num produto: o outro produto não o tem", () => {
    const f = doisProdutos();
    expect(acabamentosDoProduto(f, "m1").map((a) => a.nome)).toEqual(["Inox", "Negro"]);
    expect(acabamentosDoProduto(f, "m2").map((a) => a.nome)).toEqual(["Cobre"]);
  });

  it("juntar um acabamento que já existe na família (mesmo código ou nome, sem distinguir maiúsculas) reutiliza-o em vez de criar outro", () => {
    let f = doisProdutos();
    f = juntarAcabamentoAoProduto(f, "m2", { codigo: "ix" });
    f = juntarAcabamentoAoProduto(f, "m2", { nome: "NEGRO" });
    expect(f.acabamentos).toHaveLength(3);
    expect(acabamentosDoProduto(f, "m2").map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(resumoDeProdutos(f).produtos).toBe(5);
  });

  it("juntar sem dados cria um acabamento novo com nome e código que ainda não existem", () => {
    let f = doisProdutos();
    f = juntarAcabamentoAoProduto(f, "m1");
    f = juntarAcabamentoAoProduto(f, "m1");
    const codigos = f.acabamentos.map((a) => a.codigo), nomes = f.acabamentos.map((a) => a.nome);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(acabamentosDoProduto(f, "m2")).toHaveLength(1);
  });

  it("copiar os acabamentos de um produto para os outros junta os que faltam, sem tirar os que já tem nem copiar preços", () => {
    let f = alterarVariante(doisProdutos(), "m1", "a1", { preco: 120 });
    f = copiarAcabamentosParaOutros(f, "m1");
    expect(acabamentosDoProduto(f, "m2").map((a) => a.nome)).toEqual(["Inox", "Negro", "Cobre"]);
    expect(skuDaCelula(f, "m2", "a1")).toBe("T-100-IX");
    expect(f.celulas[celulaKey("m2", "a1")].preco).toBeUndefined();
    expect(acabamentosDoProduto(f, "m1").map((a) => a.nome)).toEqual(["Inox", "Negro"]);
  });

  it("aplicar um acabamento a todos os produtos ativa-o em cada um", () => {
    const f = aplicarAcabamentoATodos(doisProdutos(), "a3");
    expect(acabamentosDoProduto(f, "m1").map((a) => a.nome)).toEqual(["Inox", "Negro", "Cobre"]);
    expect(linhasDeVariantes(f).filter((l) => l.acabamento === "Cobre").map((l) => l.sku)).toEqual(["T-80-CO", "T-100-CO"]);
  });

  it("tirar um acabamento de um produto apaga a sua célula e o seu 3D; o acabamento só desaparece da família se já ninguém o usa", () => {
    let f = aplicarAcabamentoATodos(doisProdutos(), "a1");
    f = { ...f, glb: { "m1|a1": chaveFicheiro("lava_loica", "keran80", "inox") } };
    f = tirarAcabamentoDoProduto(f, "m1", "a1");
    expect(acabamentosDoProduto(f, "m1").map((a) => a.id)).toEqual(["a2"]);
    expect(f.glb).toEqual({});
    expect(f.acabamentos.map((a) => a.id)).toContain("a1");
    f = tirarAcabamentoDoProduto(f, "m2", "a1");
    expect(f.acabamentos.map((a) => a.id)).not.toContain("a1");
  });

  it("tirar um produto leva as suas células e os acabamentos que só ele tinha", () => {
    const f = tirarProduto(doisProdutos(), "m2");
    expect(f.medidas.map((m) => m.id)).toEqual(["m1"]);
    expect(Object.keys(f.celulas)).toEqual(["m1|a1", "m1|a2"]);
    expect(f.acabamentos.map((a) => a.nome)).toEqual(["Inox", "Negro"]);
  });

  it("SKU duplicado dentro de um produto (dois acabamentos com o mesmo código) é erro", () => {
    let f = doisProdutos();
    f = juntarAcabamentoAoProduto(f, "m1", { nome: "Outro", codigo: "X" });
    f = { ...f, acabamentos: f.acabamentos.map((a) => (a.nome === "Outro" ? { ...a, codigo: "IX" } : a)) };
    expect(validar(f).join(" ")).toMatch(/SKU «T-80-IX»/);
  });

  it("SKU escrito à mão igual ao de outro produto é erro; vazio volta ao automático", () => {
    let f = prepararParaEdicao(doisProdutos());
    f = alterarVariante(f, "m2", "a3", { sku: "T-80-IX" });
    expect(validar(f).join(" ")).toMatch(/SKU «T-80-IX»/);
    f = alterarVariante(f, "m2", "a3", { sku: "  " });
    expect(skuDaCelula(f, "m2", "a3")).toBe("T-100-CO");
    expect(validar(f)).toEqual([]);
  });

  it("produto sem preço continua a ser erro", () => {
    const f = doisProdutos(); f.medidas[1] = { ...f.medidas[1], preco: 0 };
    expect(validar(f)).toEqual([expect.stringContaining("100 cm")]);
  });

  it("um produto sem nenhum acabamento ativo é erro (senão desaparecia da família em silêncio)", () => {
    const f = juntarProduto(doisProdutos());
    f.medidas[2] = { ...f.medidas[2], rotulo: "Vazio", preco: 90 };
    expect(validar(f).join(" ")).toMatch(/produto «Vazio» não tem nenhum acabamento/);
  });

  it("família sem variantes: erro", () => expect(validar(juntarProduto(vazia())).join(" ")).toMatch(/acabamento/i));

  it("prepararParaEdicao: em modo automático descarta SKUs antigos (eram ignorados) e passa a manual sem mudar nenhum SKU", () => {
    const f = doisProdutos();
    f.celulas["m1|a1"] = { ativo: true, sku: "ANTIGO" };
    const antes = linhasDeVariantes(f).map((l) => l.sku);
    const g = prepararParaEdicao(f);
    expect(g.regraSku.modo).toBe("manual");
    expect(linhasDeVariantes(g).map((l) => l.sku)).toEqual(antes);
    expect(f.regraSku.modo).toBe("auto");
  });

  it("prepararParaEdicao mantém uma família vinda da matriz antiga (todas as células existem, uma inativa)", () => {
    const g = prepararParaEdicao(exemploKeran());
    expect(acabamentosDoProduto(g, "m80").map((a) => a.id)).toEqual(["inox", "gunmetal"]);
    expect(g.celulas["m80|gunmetal"].ativo).toBe(false);
    expect(linhasDeVariantes(g)).toHaveLength(3);
  });
});

describe("semente Lava-loiça Lody, FRASA: 9 produtos = 9 referências", () => {
  it("3 medidas × 3 acabamentos, cada um com o seu SKU e o seu preço, e o GLB Frasa de cada um", () => {
    const f = exemploLodyFrasa(), linhas = linhasDeVariantes(f);
    expect(f.id.startsWith("cfg:")).toBe(true);
    expect(f.id).not.toBe("lody");
    expect(f.nome).toMatch(/Lody, FRASA/);
    expect(f.medidas.map((m) => m.ref)).toEqual(["LOD-40", "LOD-50", "LOD-70"]);
    expect(f.acabamentos.map((a) => a.nome)).toEqual(["Cobre", "Gold", "Gunmetal"]);
    expect(linhas).toHaveLength(9);
    expect(new Set(linhas.map((l) => l.sku)).size).toBe(9);
    expect(new Set(linhas.map((l) => l.preco)).size).toBe(9);
    expect(linhas.map((l) => l.sku)).toContain("LOD-50-GO");
    expect(linhas.every((l) => l.tem3d)).toBe(true);
    expect(resumoDeProdutos(f)).toMatchObject({ produtos: 9, referencias: 9, texto: "9 produtos = 9 referências" });
    expect(validar(f)).toEqual([]);
  });

  it("os GLB da semente existem mesmo em modelosHtml/ficheiros.ts", () => {
    const f = exemploLodyFrasa();
    const chaves = new Set(FICHEIROS_3D.map((x) => chaveFicheiro(x.familia, x.modelo, x.acab)));
    for (const g of Object.values(f.glb ?? {})) { expect(chaves.has(g)).toBe(true); expect(g.startsWith("lava_loica|lody")).toBe(true); }
    expect(Object.keys(f.glb ?? {})).toHaveLength(9);
  });

  it("gera uma Familia com 3 medidas e 9 variantes", () => expect(variantesDe(paraFamilia(exemploLodyFrasa()))).toHaveLength(9));

  it("o resumo conta referências distintas: dois produtos com o mesmo SKU dão «9 produtos = 8 referências»", () => {
    const f = prepararParaEdicao(exemploLodyFrasa());
    const g = alterarVariante(f, "lody50", "oro", { sku: "LOD-40-CO" });
    expect(resumoDeProdutos(g).texto).toBe("9 produtos = 8 referências");
  });

  it("singular: 1 produto = 1 referência", () => {
    const f = juntarAcabamentoAoProduto(juntarProduto(vazia()), "m1", { nome: "Inox", codigo: "IX" });
    expect(resumoDeProdutos(f).texto).toBe("1 produto = 1 referência");
  });
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
    expect(resumoDeProdutos(f).texto).toBe("9 produtos = 9 referências");
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
    expect(acabamentosDoProduto(f, "m1")).toHaveLength(3);
    expect(f.medidas[0].dim).toEqual([44, 44, 20]);
  });
  it("duas atribuições na mesma medida × acabamento: a segunda fica de fora e há um conflito legível", () => {
    const dup = { ...atrib9[0], produtoId: "p-40-CO2" };
    const { familia: f, conflitos } = familiaDeProdutos(nova(), [...refs9.slice(0, 1), { ...refs9[0], id: "p-40-CO2", n: "Lava-louças Lody 40 - Cobre (bis)" }], [atrib9[0], dup]);
    expect(Object.values(f.celulas)).toHaveLength(1);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]).toMatch(/mesma medida .*40 cm.* e o mesmo acabamento .*Cobre/);
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
  it("SKU e preço de uma célula de produto são só de leitura: alterarVariante ignora-os mas aceita ativo", () => {
    const { familia: f } = familiaDeProdutos(nova(), refs9, atrib9);
    const g = alterarVarianteCat(f, "m1", "a1", { sku: "OUTRO", preco: 1, ativo: false });
    expect(g.celulas["m1|a1"]).toMatchObject({ sku: "LLCCI-40CO", preco: 140, ativo: false, produtoId: "p-40-CO" });
  });
  it("prepararParaEdicao não apaga o SKU de um produto do catálogo", () => {
    const { familia: f } = familiaDeProdutos(nova(), refs9, atrib9);
    const g = prepararParaEdicao({ ...f, regraSku: { modo: "auto", sep: "-" } });
    expect(skuDaCelula(g, "m1", "a1")).toBe("LLCCI-40CO");
  });
});
