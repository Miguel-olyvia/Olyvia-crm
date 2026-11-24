// 17/11 (A-Z na Mudelar): os produtos da árvore dos PRODUTOS («Sanitas», «Bases Duche») contam no ramo do motor («Canalização › Louças e torneiras»).
import { describe, expect, it } from "vitest";
import type { No } from "./v2/catalogoModelo";
import { nosDeProdutoDoRamo, nosDoObjeto, ramoDaCategoriaProduto } from "./ramoDosProdutos";
import { ativosDoPacote, emFaltaProdutos, nosDoRamo, obrigacoes, pacoteSubstituido, partesDoModelo, produtoDeOutroRamo, produtosDoRamo, ramoDaTroca, type ProdVisita } from "./produtosVisita";
import { filtroDoRamo } from "./real/pesquisaProdutos";
import { responderTroca } from "./selecao";

const ARVORE: No[] = [
  { id: "can", n: "Canalização", pai: null }, { id: "lt", n: "Louças e torneiras", pai: "can" },
  { id: "rev", n: "Revestimentos", pai: null }, { id: "par", n: "Parede", pai: "rev" },
  // a árvore dos produtos da Mudelar (só de produtos)
  { id: "ls", n: "Loiças Sanitárias", pai: null, soProduto: true }, { id: "san", n: "Sanitas", pai: "ls", soProduto: true },
  { id: "lav", n: "Lavatórios", pai: "ls", soProduto: true }, { id: "kit", n: "Kit´s para Sanitários", pai: "ls", soProduto: true },
  { id: "db", n: "Duche & Banho", pai: null, soProduto: true }, { id: "bd", n: "Bases Duche", pai: "db", soProduto: true },
  { id: "cer", n: "Cerâmico", pai: "rev", soProduto: true }, { id: "pav", n: "Pavimento", pai: "rev" },
  { id: "por", n: "Porcelânico", pai: "rev", soProduto: true },
  { id: "esp", n: "Espelhos", pai: null, soProduto: true },
];

// 24/11 (contrato real MD 1610): o porcelânico Surface Arena (RP0010) vai à parede; a pergunta «mantém o revestimento?» não o achava.
describe("o cerâmico e o porcelânico na parede e no chão (24/11)", () => {
  it("o porcelânico é do chão (principal) e também da parede; o cerâmico da parede e também do chão", () => {
    expect(ramoDaCategoriaProduto("Porcelânico")).toEqual(["Revestimentos", "Pavimento"]);
    expect(nosDeProdutoDoRamo(ARVORE, "Revestimentos", "Parede").sort()).toEqual(["cer", "por"]);
    expect(nosDeProdutoDoRamo(ARVORE, "Revestimentos", "Pavimento").sort()).toEqual(["cer", "por"]);
  });
  it("na estimativa do modelo, um porcelânico conta só numa parte (a do chão), nunca nas duas", () => {
    const prod: ProdVisita[] = [{ id: "p1", n: "SURFACE ARENA", un: "m2", custo: 20, q: 10, no: "por" }];
    const mat = { custo: 1000, preco: 1500, partes: [{ d: "parede", peso: 0.5, ramo: ["Revestimentos", "Parede"] as [string, string] }, { d: "chão", peso: 0.5, ramo: ["Revestimentos", "Pavimento"] as [string, string] }] };
    const [parede, chao] = partesDoModelo(mat, prod, undefined, [], ARVORE);
    expect(parede.custo).toBe(500);
    expect(chao.custo).toBe(300);
    // sem a parte do chão, conta na da parede
    const [soParede] = partesDoModelo({ ...mat, partes: [mat.partes[0]] }, prod, undefined, [], ARVORE);
    expect(soParede.custo).toBe(300);
  });
});

// 24/11 (contrato real MD 1605): «O cliente mantém o pavimento?» → «Mantém» tirava também o porcelânico escolhido para a parede.
describe("o «Mantém» de uma troca não tira o produto que é da outra (24/11)", () => {
  const AZULEJO: ProdVisita = { id: "RP0041", n: "Revestimento BRANCO - PURO NATURAL", un: "m2", custo: 14.84, q: 2, no: "por", svc: "sRev" };
  const LADRILHO: ProdVisita = { id: "RP0099", n: "Pavimento porcelânico", un: "m2", custo: 15, q: 5, no: "por", svc: "sPav" };
  const SANITA: ProdVisita = { id: "SAN1", n: "Sanita compacta", un: "un", custo: 90, q: 1, no: "san", svc: "sSan" };
  it("o porcelânico com a instalação do revestimento é da parede; com a do pavimento, do chão; o de um só ramo não muda", () => {
    expect(produtoDeOutroRamo(ARVORE, { sid: "sPav", no: "pav" }, AZULEJO)).toBe(true);
    expect(produtoDeOutroRamo(ARVORE, { sid: "sPav", no: "pav" }, LADRILHO)).toBe(false);
    expect(produtoDeOutroRamo(ARVORE, { sid: "sRev", no: "par" }, AZULEJO)).toBe(false);
    expect(produtoDeOutroRamo(ARVORE, { sid: "sLt", no: "lt" }, SANITA)).toBe(false);
    expect(produtoDeOutroRamo(ARVORE, { sid: "sPav", no: "pav" }, { ...AZULEJO, svc: undefined })).toBe(false);
  });
  it("«Mantém o pavimento» tira o ladrilho do chão e deixa o azulejo da parede", () => {
    const d = { id: "n1", visita: { prod: [AZULEJO, LADRILHO], manter: {} as Record<string, "sim" | "nao"> } } as never as Parameters<typeof responderTroca>[2];
    const tirados: string[] = [];
    const A = { manter: (_: string, sid: string, r: "sim" | "nao") => { d.visita.manter = { ...d.visita.manter, [sid]: r }; },
      tirarProduto: (_: string, id: string) => { tirados.push(id); d.visita.prod = (d.visita.prod ?? []).filter((x) => x.id !== id); } } as never;
    const r = responderTroca(A, { arvore: ARVORE } as never, d, { sid: "sPav", no: "pav", pergunta: "O cliente mantém o pavimento?" }, "sim");
    expect(tirados).toEqual(["RP0099"]);
    expect(r.tirados.map((p) => p.id)).toEqual(["RP0099"]);
    expect((d.visita.prod ?? []).map((p) => p.id)).toEqual(["RP0041"]);
  });
});

// 24/11 (contrato real MD 1588): «O cliente mantém o lavatório?» → «Mantém» tirava a base, a coluna e a torneira do mesmo ramo.
describe("o «Mantém» de uma pergunta com objeto só tira o objeto (24/11)", () => {
  it("«Mantém o lavatório» tira o lavatório e deixa a base de duche; sem objeto conhecido, o ramo todo", () => {
    const BASE: ProdVisita = { id: "DBBD0008", n: "Base de Duche STONE PLUS 70x140", un: "un", custo: 117, q: 1, no: "bd", svc: "sBase" };
    const LAV: ProdVisita = { id: "LAV1", n: "Lavatório de pousar", un: "un", custo: 60, q: 1, no: "lav", svc: "sLav" };
    const d = { id: "n2", visita: { prod: [BASE, LAV], manter: {} as Record<string, "sim" | "nao"> } } as never as Parameters<typeof responderTroca>[2];
    const tirados: string[] = [];
    const A = { manter: () => {}, tirarProduto: (_: string, id: string) => { tirados.push(id); d.visita.prod = (d.visita.prod ?? []).filter((x) => x.id !== id); } } as never;
    responderTroca(A, { arvore: ARVORE } as never, d, { sid: "sLav", no: "lt", pergunta: "O cliente mantém o lavatório?" }, "sim");
    expect(tirados).toEqual(["LAV1"]);
    // sem objeto que o Catálogo conheça, tira o ramo todo da troca (a base sai)
    responderTroca(A, { arvore: ARVORE } as never, d, { sid: "sLt", no: "lt", pergunta: "O cliente mantém as louças?" }, "sim");
    expect(tirados).toEqual(["LAV1", "DBBD0008"]);
  });
});

describe("o ramo do motor das categorias de produto", () => {
  it("pelo nome, sem acentos nem apóstrofos", () => {
    expect(ramoDaCategoriaProduto("Sanitas")).toEqual(["Canalização", "Louças e torneiras"]);
    expect(ramoDaCategoriaProduto("kits para sanitarios")).toEqual(["Canalização", "Louças e torneiras"]);
    expect(ramoDaCategoriaProduto("Cerâmico")).toEqual(["Revestimentos", "Parede"]);
    expect(ramoDaCategoriaProduto("Coisa nova")).toBeNull();
  });
  it("os nós de um ramo dos serviços incluem as categorias de produto que lhe pertencem", () => {
    expect(nosDeProdutoDoRamo(ARVORE, "Canalização", "Louças e torneiras").sort()).toEqual(["bd", "kit", "lav", "san"]);
    const r = nosDoRamo(ARVORE, "lt");
    for (const id of ["lt", "san", "lav", "bd"]) expect(r.has(id)).toBe(true);
    expect(r.has("esp")).toBe(false);
    // um nó só de produtos fica como estava
    expect([...nosDoRamo(ARVORE, "san")]).toEqual(["san"]);
  });
  it("a sanita da Mudelar desconta a parte «louças» da estimativa do modelo e cumpre a obrigação", () => {
    const prod: ProdVisita[] = [{ id: "p1", n: "SANITA BOHEMIC", un: "un", custo: 105, q: 1, no: "san" }];
    const mat = { custo: 1000, preco: 1500, partes: [{ d: "louças", peso: 0.5, ramo: ["Canalização", "Louças e torneiras"] as [string, string] }, { d: "parede", peso: 0.5, ramo: ["Revestimentos", "Parede"] as [string, string] }] };
    const [loucas, parede] = partesDoModelo(mat, prod, undefined, [], ARVORE);
    expect(loucas.custo).toBe(395);
    expect(loucas.por.map((x) => x.id)).toEqual(["p1"]);
    expect(parede.custo).toBe(500);
    const K = { arvore: ARVORE, exigeProduto: { loucas: "lt" }, produtos: [] } as never;
    expect(emFaltaProdutos(K, ["loucas"], { prod } as never)).toEqual([]);
    expect(emFaltaProdutos(K, ["loucas"], { prod: [] } as never)).toHaveLength(1);
  });
  it("a pesquisa no servidor de um ramo dos serviços vai pelas categorias de produto dele (nunca pelo id do ramo, que dava lista vazia)", () => {
    // várias categorias com pais diferentes: uma pesquisa por cada subcategoria (antes, sem filtro: abria com banheiras)
    expect(filtroDoRamo(ARVORE, "lt")).toEqual({ subcategorias: ["san", "lav", "kit", "bd"] });
    // 24/11: a parede leva o cerâmico e o porcelânico; aqui são as categorias de produto todas dos «Revestimentos»: a categoria inteira
    expect(filtroDoRamo(ARVORE, "par")).toEqual({ categoria: "rev" });
    // um nó só de produtos: como antes
    expect(filtroDoRamo(ARVORE, "san")).toEqual({ subcategoria: "san" });
  });
});

describe("17/11: a visita do Estúdio sem mão de obra a dobrar", () => {
  const classe = { revest: "parede", c4: "parede", pav: "pavimento", c6: "pavimento", loucas: "loucas", sSusp: "loucas", canal: "aguas" };
  const P = (id: string, svc: string, q = 1): ProdVisita => ({ id, n: id, un: "un", custo: 10, q, no: null, svc, fator: 1 });
  it("o serviço do pacote sai quando um produto traz OUTRO serviço do mesmo ramo; o próprio serviço não conta", () => {
    const prod = [P("rev", "c4", 22), P("san", "sSusp"), P("x", "pav")];
    expect([...pacoteSubstituido(["revest", "pav", "loucas", "canal"], prod, classe)].sort()).toEqual(["loucas", "revest"]);
  });
  it("ativosDoPacote só tira com os produtos dados (o motor só os dá numa visita do Estúdio)", () => {
    const map: [string, "par" | "pav"][] = [["revest", "par"], ["pav", "pav"]];
    const med = { par: 20, pav: 4 } as never;
    expect(ativosDoPacote(map as never, med, [])).toEqual(["revest", "pav"]);
  });
  it("com «inteiras» (visita do Estúdio), a parte com produtos escolhidos fica toda coberta", () => {
    const prod: ProdVisita[] = [{ id: "p1", n: "SANITA", un: "un", custo: 105, q: 1, no: "san" }];
    const mat = { custo: 1000, preco: 1500, partes: [{ d: "louças", peso: 0.5, ramo: ["Canalização", "Louças e torneiras"] as [string, string] }, { d: "parede", peso: 0.5, ramo: ["Revestimentos", "Parede"] as [string, string] }] };
    const [loucas, parede] = partesDoModelo(mat, prod, undefined, [], ARVORE, true);
    expect(loucas.custo).toBe(0);
    expect(parede.custo).toBe(500);
  });
});


describe("23/11: a troca do espelho e da porta (testarh, Mudelar)", () => {
  // a árvore como na Mudelar: o espelho e a porta só se sabem pela categoria de produto (catalogo_categoria_id nulo)
  const A: No[] = [
    { id: "carp", n: "Carpintaria", pai: null }, { id: "mwc", n: "Móveis de casa de banho", pai: "carp" }, { id: "acc", n: "Acessórios WC", pai: "carp" },
    { id: "mob", n: "Móveis & Arrumação Casa de Banho", pai: null, soProduto: true },
    { id: "esp", n: "Espelhos", pai: "mob", soProduto: true }, { id: "mlav", n: "Móveis de lavatório", pai: "mob", soProduto: true },
    { id: "por", n: "Portas", pai: null, soProduto: true }, { id: "pint", n: "Portas Interiores", pai: "por", soProduto: true },
    { id: "aces", n: "Acessórios Casa de Banho", pai: null, soProduto: true },
    { id: "pr", n: "Porta-rolos", pai: "aces", soProduto: true }, { id: "tol", n: "Toalheiros", pai: "aces", soProduto: true },
  ];
  const ESPELHO = { id: "MACBE0073", n: "Espelho Simples C/ORLA ALUMÍNIO 60x50", sku: "MACBE0073", custo: 20, un: "un", marca: "", fornecedor: "", data: "", no: "esp" };
  const PORTA = { id: "PPI0001", n: "Porta de Abrir CPL Branca 70 cm", sku: "PPI0001", custo: 80, un: "un", marca: "", fornecedor: "", data: "", no: "pint" };

  it("as categorias de produto que são o objeto da pergunta, pelo nome (o plural conta; «Porta-rolos» não)", () => {
    expect(nosDoObjeto(A, "O cliente mantém o espelho?")).toEqual(["esp"]);
    expect(nosDoObjeto(A, "O cliente mantém a porta?").sort()).toEqual(["pint", "por"]);
    expect(nosDoObjeto(A, null)).toEqual([]);
    expect(nosDoObjeto(A, "Escolher o produto")).toEqual([]);
  });

  it("os produtos da troca vêm também da categoria do objeto, mesmo que o ramo do serviço não a tenha; e cumprem a obrigação", () => {
    const K = { arvore: A, produtos: [ESPELHO, PORTA], exigeProduto: { sEsp: "acc", sPorta: "carp" }, perguntaManter: { sEsp: "O cliente mantém o espelho?", sPorta: "O cliente mantém a porta?" } } as never;
    // o ramo «Acessórios WC» não tem os espelhos: sem a pergunta, nada; com ela, o espelho
    expect(produtosDoRamo(K, "acc", new Set())).toEqual([]);
    expect(produtosDoRamo(K, "acc", new Set(), "O cliente mantém o espelho?").map((p) => p.id)).toEqual(["MACBE0073"]);
    expect(produtosDoRamo(K, "carp", new Set()).map((p) => p.id)).not.toContain("PPI0001");
    expect(produtosDoRamo(K, "carp", new Set(), "O cliente mantém a porta?").map((p) => p.id)).toContain("PPI0001");
    expect(ramoDaTroca(A, "acc", "O cliente mantém o espelho?").has("esp")).toBe(true);
    // escolhido, a troca fica resolvida (o mesmo ramo do seletor e da obrigação)
    const prod: ProdVisita[] = [{ id: "MACBE0073", n: ESPELHO.n, un: "un", custo: 20, q: 1, no: "esp" }, { id: "PPI0001", n: PORTA.n, un: "un", custo: 80, q: 1, no: "pint" }];
    expect(obrigacoes(K, ["sEsp", "sPorta"], { prod, manter: { sEsp: "nao", sPorta: "nao" } }).map((o) => o.estado)).toEqual(["produto", "produto"]);
    expect(obrigacoes(K, ["sEsp"], { prod: [], manter: { sEsp: "nao" } })[0].estado).toBe("falta");
  });

  it("a pesquisa no servidor junta a categoria do objeto ao filtro do ramo (e não repete a que o ramo já tem)", () => {
    // «Móveis de casa de banho» já vai pela categoria-mãe dos móveis (Espelhos incluídos): fica igual
    expect(filtroDoRamo(A, "mwc", "O cliente mantém o espelho?")).toEqual(filtroDoRamo(A, "mwc"));
    expect(filtroDoRamo(A, "mwc")).toEqual({ categoria: "mob" });
    // «Acessórios WC» vai pela categoria dos acessórios (Toalheiros, Porta-rolos); o espelho junta a subcategoria Espelhos
    expect(filtroDoRamo(A, "acc")).toEqual({ categoria: "aces" });
    expect(filtroDoRamo(A, "acc", "O cliente mantém o espelho?")).toEqual({ subcategorias: ["esp"], categorias: ["aces"] });
    // a porta: o ramo «Carpintaria» não tem portas no mapa; entra a categoria Portas (de topo) e a subcategoria Portas Interiores
    const f = filtroDoRamo(A, "carp", "O cliente mantém a porta?");
    expect(f.categorias).toContain("por");
    expect(f.subcategorias).toContain("pint");
  });
});
