// Testes da etapa "Necessidades do cliente" (14/10/2026): a ordem dos mais usados, a dedução da ilustração,
// a escolha guiada que gera as linhas do orçamento, o resumo e a pesquisa com o tamanho do Catálogo real (~2.200 produtos).
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LINHAS, acoes, seed, type Negocio } from "./motor";
import { catalogo0, type Catalogo, type No, type Produto } from "./v2/catalogoModelo";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";
import { PREFIXO_PROD, ligarCatalogo, obrigacoes } from "./produtosVisita";
import { ICONES_SERVICO, ILUSTRACOES, IconeServico, Ilustracao, iconeDoServico, ilustracaoDe } from "./ilustracoes";
import {
  categorias, filtrarProdutos, gruposServicos, ilustracaoDoCatalogo, mostraCartoes, nomeCurto, objetoDaPergunta, ordenarParaObjeto,
  passoGuiado, procurarServicos, resumoNecessidades, tilesServicos, tocarProdutoGuiado, type TileServico,
} from "./necessidades";

const K0 = catalogo0();
const prodN = (K: Catalogo, n: string) => K.produtos.find((p) => p.n === n)!;

function preencher(d: Negocio, gs: Grupo[]) {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
}
function preparar() {
  const S = seed();
  ligarCatalogo(() => K0);
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1035)!; // Hugo Matos, WC na Visita, com medidas (pav 5, pcs 3)
  preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
  return { S, A, d };
}
afterEach(() => ligarCatalogo(null));

/* ------------------------------------------------------------------ textos */
describe("os textos", () => {
  it("o nome curto tira o ruído da tabela", () => {
    expect(nomeCurto("Mão de Obra Construção de Nicho (valor por unidade)")).toBe("Construção de nicho");
    expect(nomeCurto("Instalação de Sanita Compacta")).toBe("Sanita compacta");
  });
  it("o objeto da pergunta, com e sem artigo", () => {
    expect(objetoDaPergunta("O cliente mantém a sanita?")).toEqual({ comArtigo: "a sanita", nome: "Sanita" });
    expect(objetoDaPergunta("Qual é a cor?")).toBeNull();
  });
});

/* ------------------------------------------------------------------ os mais usados primeiro */
const tile = (sid: string, oficio: string, usos: number, o: Partial<TileServico> = {}): TileServico => ({
  sid, n: sid, curto: sid, oficio, icone: "outro", origem: "catalogo", on: false, qt: 0, un: "un", preco: 10, medida: null, usos, linhas: ["wc"], ...o,
});
const arvore: No[] = [{ id: "o1", n: "Canalização", pai: null }, { id: "o2", n: "Eletricidade", pai: null }] as No[];

describe("os serviços: os mais usados primeiro", () => {
  const tiles = [
    tile("a", "Canalização", 3), tile("b", "Canalização", 14), tile("c", "Canalização", 9), tile("d", "Canalização", 1),
    tile("e", "Canalização", 20, { linhas: ["coz"] }), // de outra linha: não se sugere
    tile("p", "Canalização", 0, { origem: "pacote", on: true, usos: Number.MAX_SAFE_INTEGER }),
    tile("x", "Eletricidade", 5), tile("y", "Pintura", 2),
  ];
  it("os do pacote e os escolhidos à frente, depois os mais pedidos desta linha, até ao máximo", () => {
    const g = gruposServicos(tiles, arvore, "wc", { max: 3 });
    expect(g.map((x) => x.oficio)).toEqual(["Canalização", "Eletricidade", "Pintura"]); // a ordem da árvore; os de fora no fim
    expect(g[0].tiles.map((t) => t.sid)).toEqual(["p", "b", "c"]);
    expect(g[0].total).toBe(6);
  });
  it("um escolhido conta como fixo, mesmo pouco usado", () => {
    const t2 = tiles.map((t) => (t.sid === "d" ? { ...t, on: true } : t));
    expect(gruposServicos(t2, arvore, "wc", { max: 3 })[0].tiles.map((t) => t.sid)).toEqual(["p", "b", "d"]);
  });
  it("'Ver mais' mostra o ofício inteiro, pelos mais pedidos", () => {
    expect(gruposServicos(tiles, arvore, "wc", { todos: true })[0].tiles.map((t) => t.sid)).toEqual(["p", "e", "b", "c", "a", "d"]);
  });
  it("a pesquisa: sem acentos, os que começam pela pesquisa primeiro", () => {
    const ts = [tile("1", "Canalização", 50, { n: "Substituição de torneira", curto: "Substituição de torneira" }), tile("2", "Canalização", 1, { n: "Torneira de cozinha", curto: "Torneira de cozinha" })];
    expect(procurarServicos(ts, "torneira").map((t) => t.sid)).toEqual(["2", "1"]);
    expect(procurarServicos(ts, "CANALIZACAO cozinha").map((t) => t.sid)).toEqual(["2"]);
    expect(procurarServicos(ts, "  ")).toEqual([]);
  });
  it("na visita real: os do pacote vêm marcados e cada mosaico tem ícone", () => {
    const { S, d } = preparar();
    const ts = tilesServicos(S, K0, d);
    const pacote = ts.filter((t) => t.origem === "pacote");
    expect(pacote.map((t) => t.sid)).toEqual(LINHAS.wc.map.map(([s]) => s).filter((s) => S.svc[s]));
    expect(ts.find((t) => t.sid === "c13")).toMatchObject({ origem: "catalogo", on: false, icone: "loucas" });
    expect(ts.every((t) => (ICONES_SERVICO as readonly string[]).includes(t.icone))).toBe(true);
    expect(new Set(ts.map((t) => t.sid)).size).toBe(ts.length); // sem repetidos
  });
});

/* ------------------------------------------------------------------ a ilustração */
describe("a dedução da ilustração", () => {
  const p = (o: Partial<Produto>): Produto => ({ id: "x", n: "Kyoto 80", custo: 10, un: "un", no: null, ...o } as Produto);
  it("o img do Catálogo manda", () => {
    expect(ilustracaoDoCatalogo(K0.arvore, p({ n: "Sanita qualquer", img: "espelho" }))).toBe("espelho");
  });
  it("sem img: a subcategoria, depois o nome, depois o ramo da árvore", () => {
    expect(ilustracaoDoCatalogo([], p({ sub: "Toalheiros" }))).toBe("toalheiro");
    expect(ilustracaoDoCatalogo([], p({ sub: "Colunas ", n: "Coluna ALTA LUX c/pés 1 Porta" }))).toBe("movel-wc"); // não é porta
    expect(ilustracaoDoCatalogo([], p({ n: "Misturadora de banheira" }))).toBe("torneira"); // não é banheira
    const no = K0.arvore.find((x) => x.n === "Louças e torneiras")!;
    expect(ilustracaoDoCatalogo(K0.arvore, p({ n: "Modelo X", no: no.id }))).not.toBe("generico");
    expect(ilustracaoDoCatalogo([], p({ n: "Modelo X" }))).toBe("generico");
  });
  it("as palavras com e sem acento, e as que enganam", () => {
    expect(ilustracaoDe("Loiças Sanitárias")).toBe("sanita");
    expect(ilustracaoDe("Máquina lavar loiça INDESIT")).toBe("eletrodomestico");
    expect(ilustracaoDe("Armário Superior de cozinha em vidro")).toBe("armario-cozinha");
    expect(ilustracaoDe("Armário inferior MELAMINA")).toBe("armario-cozinha"); // "lamina" não é ferramenta
    expect(ilustracaoDe("Bases de Duche")).toBe("base-duche");
    expect(ilustracaoDe("Espelho LED BARI")).toBe("espelho");
    expect(ilustracaoDe("Porta-rolos")).toBe("acessorio-wc");
  });
  it("todos os produtos do arranque têm uma ilustração própria", () => {
    for (const x of K0.produtos) expect([x.n, ilustracaoDoCatalogo(K0.arvore, x)]).not.toEqual([x.n, "generico"]);
  });
  it("o ícone do serviço: o do Catálogo, senão pelo nome, senão o do ofício", () => {
    expect(iconeDoServico("Instalação de Sanita", "Canalização", "duche")).toBe("duche");
    expect(iconeDoServico("Instalação de Coluna de Duche", "Canalização")).toBe("duche");
    expect(iconeDoServico("Coisa nova", "Pintura")).toBe("pintura");
    expect(iconeDoServico("Coisa nova", null)).toBe("outro");
  });
  it("todas as chaves fixas desenham-se, decorativas", () => {
    const { container } = render(<>{ILUSTRACOES.map((k) => <Ilustracao key={k} k={k} />)}{ICONES_SERVICO.map((k) => <IconeServico key={k} k={k} />)}</>);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(ILUSTRACOES.length + ICONES_SERVICO.length);
    for (const s of svgs) { expect(s.getAttribute("aria-hidden")).toBe("true"); expect(s.childElementCount).toBeGreaterThan(0); }
  });
});

/* ------------------------------------------------------------------ a escolha guiada */
describe("a escolha guiada: \"Mantém a sanita?\" → Não → a sanita → as linhas", () => {
  it("os passos: perguntar → escolher → escolhido; Sim fica em mantém", () => {
    const { S, A, d } = preparar();
    A.extra(d.id, "c13", 1); // junta a instalação da sanita (pergunta: "O cliente mantém a sanita?")
    const o = () => obrigacoes(K0, ["c13"], d.visita)[0];
    expect(passoGuiado(o())).toBe("perguntar");
    expect(mostraCartoes(passoGuiado(o()), false)).toBe(false);
    A.manter(d.id, "c13", "nao");
    expect(passoGuiado(o())).toBe("escolher");
    expect(mostraCartoes("escolher", false)).toBe(true);
    expect(tocarProdutoGuiado(A, K0, d, o(), prodN(K0, "Sanita compacta"))).toBe("juntou");
    expect(passoGuiado(o())).toBe("escolhido");
    expect(mostraCartoes("escolhido", false)).toBe(false); // só com "Juntar ou trocar"
    expect(mostraCartoes("escolhido", true)).toBe(true);
    A.manter(d.id, "c13", "sim");
    expect(passoGuiado(o())).toBe("mantem");
    expect(S.svc.c13).toBeTruthy();
  });
  it("escolher sem responder é dizer 'Não'; tocar outra vez tira", () => {
    const { A, d } = preparar();
    const o = obrigacoes(K0, ["c13"], d.visita)[0];
    const sanita = prodN(K0, "Sanita compacta");
    tocarProdutoGuiado(A, K0, d, o, sanita);
    expect(d.visita.manter?.c13).toBe("nao");
    expect(d.visita.prod?.map((p) => p.id)).toEqual([sanita.id]);
    expect(tocarProdutoGuiado(A, K0, d, o, sanita)).toBe("tirou");
    expect(d.visita.prod).toEqual([]);
  });
  it("o produto escolhido gera a linha do produto (ao PVP) e a do serviço que traz", () => {
    const { S, A, d } = preparar();
    const K = { ...K0, produtos: K0.produtos.map((p) => (p.n === "Sanita suspensa com estrutura" ? { ...p, pvp: 410 } : p)) };
    ligarCatalogo(() => K);
    A.manter(d.id, "pav", "sim");
    const loucas = obrigacoes(K, ["loucas"], d.visita)[0];
    expect(loucas.pergunta).toBeTruthy();
    tocarProdutoGuiado(A, K, d, loucas, prodN(K, "Sanita suspensa com estrutura"));
    expect(d.visita.manter?.loucas).toBe("nao");
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
    const linhas = d.orc!.linhas;
    expect(linhas.some((l) => l.t === "svc" && l.sid === "c13")).toBe(true); // a instalação, trazida pela sanita
    expect(linhas.find((l) => l.t === "mat" && l.d === PREFIXO_PROD + "Sanita suspensa com estrutura")).toMatchObject({ custo: 285, preco: 410 });
    // o resumo conta o serviço trazido e o produto ao PVP
    const r = resumoNecessidades(S, d, ["c13"]);
    expect(r).toMatchObject({ servicos: 1, produtos: 1 });
    expect(r.total).toBeCloseTo(S.svc.c13.preco + 410, 2);
  });
});

/* ------------------------------------------------------------------ outros produtos, com o tamanho real */
describe("outros produtos: ~2.200 produtos", () => {
  const SUBS = ["Bases Duche", "Resguardos", "Móveis de lavatório", "Espelhos", "Torneiras", "Revestimentos", "Cozinha", "Loiças"];
  const MARCAS = ["Roca", "Sanindusa", "GME", "Manillons Torrent"];
  const muitos: Produto[] = Array.from({ length: 2200 }, (_, i) => ({
    id: `r${i}`, n: `${SUBS[i % SUBS.length]} modelo ${i}`, custo: 50 + (i % 90), un: "un", no: null, marca: MARCAS[i % MARCAS.length], sub: SUBS[i % SUBS.length], sku: `SKU${i}`,
  } as Produto));
  it("as categorias, das maiores para as menores", () => {
    const c = categorias(muitos, []);
    expect(c).toHaveLength(SUBS.length);
    expect(c.reduce((a, x) => a + x.q, 0)).toBe(2200);
    expect(c[0].q).toBeGreaterThanOrEqual(c.at(-1)!.q);
  });
  it("filtra por pesquisa, categoria e marca, depressa", () => {
    filtrarProdutos(muitos, [], { q: "x" }); // aquece a cache do texto
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) filtrarProdutos(muitos, [], { q: "espelhos modelo", marca: "GME" });
    const ms = (performance.now() - t0) / 20;
    expect(ms).toBeLessThan(30);
    expect(filtrarProdutos(muitos, [], { q: "ESPELHOS", cat: "Espelhos" })).toHaveLength(275);
    expect(filtrarProdutos(muitos, [], { q: "sku17" }).map((p) => p.id)).toContain("r17");
  });
  it("na escolha guiada, os que batem com a pergunta vêm primeiro (ordem estável)", () => {
    const ps = [{ n: "Bidé" }, { n: "Sanita compacta" }, { n: "Lavatório" }, { n: "Sanita suspensa" }] as Produto[];
    expect(ordenarParaObjeto(ps, "a sanita").map((p) => p.n)).toEqual(["Sanita compacta", "Sanita suspensa", "Bidé", "Lavatório"]);
  });
});
