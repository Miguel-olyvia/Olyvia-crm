// 17/11 (A-Z na Mudelar): os produtos da árvore dos PRODUTOS («Sanitas», «Bases Duche») contam no ramo do motor («Canalização › Louças e torneiras»).
import { describe, expect, it } from "vitest";
import type { No } from "./v2/catalogoModelo";
import { nosDeProdutoDoRamo, ramoDaCategoriaProduto } from "./ramoDosProdutos";
import { ativosDoPacote, emFaltaProdutos, nosDoRamo, pacoteSubstituido, partesDoModelo, type ProdVisita } from "./produtosVisita";
import { filtroDoRamo } from "./real/pesquisaProdutos";

const ARVORE: No[] = [
  { id: "can", n: "Canalização", pai: null }, { id: "lt", n: "Louças e torneiras", pai: "can" },
  { id: "rev", n: "Revestimentos", pai: null }, { id: "par", n: "Parede", pai: "rev" },
  // a árvore dos produtos da Mudelar (só de produtos)
  { id: "ls", n: "Loiças Sanitárias", pai: null, soProduto: true }, { id: "san", n: "Sanitas", pai: "ls", soProduto: true },
  { id: "lav", n: "Lavatórios", pai: "ls", soProduto: true }, { id: "kit", n: "Kit´s para Sanitários", pai: "ls", soProduto: true },
  { id: "db", n: "Duche & Banho", pai: null, soProduto: true }, { id: "bd", n: "Bases Duche", pai: "db", soProduto: true },
  { id: "cer", n: "Cerâmico", pai: "rev", soProduto: true },
  { id: "esp", n: "Espelhos", pai: null, soProduto: true },
];

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
    // uma só: essa
    expect(filtroDoRamo(ARVORE, "par")).toEqual({ subcategoria: "cer" });
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

