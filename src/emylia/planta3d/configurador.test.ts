// Configurador de famílias (protótipo, só em memória): a matriz cor × medida, o preço e o SKU por célula, a validação e o registo.
import { afterEach, describe, expect, it } from "vitest";
import { FAMILIAS, acabamentosDaMedida, familiaPorId, familiasDaCategoria, modeloDaFamilia, resolverVariante, temGlbDoFabricante, variantesDe } from "./familias";
import { registarFamilias, todasAsFamilias } from "./familias";
import {
  acabamentosDoProduto, alterarVariante, aplicarAcabamentoATodos, celulaKey, copiarAcabamentosParaOutros, criarFamiliaVazia, exemploKeran, exemploLodyFrasa, ficheirosCompativeis,
  juntarAcabamentoAoProduto, juntarProduto, linhasDeVariantes, paraFamilia, prepararParaEdicao, resumoDeProdutos, skuDaCelula, tirarAcabamentoDoProduto, tirarProduto, validar, type FamiliaCfg,
} from "./configurador";
import { FICHEIROS_3D, chaveFicheiro } from "./modelosHtml/ficheiros";

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
