import { describe, expect, it, vi } from "vitest";
import { seed, type Estado } from "./motor";
import { EQUIP_MUDELAR, EXIGE_MUDELAR } from "./dados/catalogoMudelar";
import { custos0, receitaDe, type Custos } from "./v2/custosModelo";
import { catalogo0, type Catalogo, type Produto } from "./v2/catalogoModelo";
import {
  centroInicial, chaveRef, contarProblemas, ligacoesDe, montarCatalogo, problemasCatalogo, problemasPorNo, procurarNos, type Mapa,
} from "./ligacoes";

// Estes testes usam só os dados de exemplo: sem os 317 serviços nem os produtos reais da Mudelar (14/10),
// que têm os seus testes em dados/catalogoMudelar.test.ts.
// as regras "exige produto" que vieram da Mudelar (as de exemplo, em EXIGE0, ganham-lhes)
const daMudelarExige = new Set(EXIGE_MUDELAR.map((e) => e.sid).filter((sid) => !["loucas", "pav", "moveis", "c6", "c13", "c17"].includes(sid)));
vi.mock("./catalogo", async (orig) => {
  const m = await orig<typeof import("./catalogo")>();
  return { ...m, CATALOGO_TODO: m.CATALOGO };
});
const montar = (fC?: (c: Custos) => void, fK?: (k: Catalogo) => void, fS?: (s: Estado) => void) => {
  const S = seed(), C = custos0(), K = catalogo0();
  fS?.(S);
  K.produtos = K.produtos.filter((p) => !p.sku);
  K.exigeProduto = Object.fromEntries(Object.entries(K.exigeProduto ?? {}).filter(([sid]) => !daMudelarExige.has(sid)));
  const daMudelar = new Set(EQUIP_MUDELAR.map((e) => e.id));
  C.equip = C.equip.filter((e) => !daMudelar.has(e.id));
  fC?.(C); fK?.(K);
  return montarCatalogo(S, C, K);
};
// Um serviço sem receita, criado no próprio teste: desde 14/10 os c1..c41 têm a receita da Mudelar.
const SEM_RECEITA = "x-sem-receita";
const comSemReceita = (S: Estado) => { S.svc[SEM_RECEITA] = { n: "Serviço de teste sem receita", un: "un", h: 1, eh: 25, eq: 0, cons: 0, preco: 46.25, perfil: "Canalização" }; };
const grupo = (m: Mapa | null, id: string) => m!.grupos.find((g) => g.id === id)!;
const nomes = (m: Mapa | null, id: string) => grupo(m, id).itens.map((l) => l.n);

describe("ligacoes · o catálogo do mapa", () => {
  it("junta serviços (em uso e do Catálogo real), produtos sem os consumíveis, equipamentos, técnicos e consumíveis", () => {
    const K = montar();
    expect(K.servicos.some((s) => s.id === "canal")).toBe(true);
    expect(K.servicos.some((s) => s.id === "c13")).toBe(true);
    expect(K.produtos.some((p) => p.n === "Sanita suspensa com estrutura")).toBe(true);
    // a fita é consumível de uma receita: aparece como consumível, não como produto
    expect(K.produtos.some((p) => p.n === "Fita e vedante")).toBe(false);
    expect(K.consumiveis.some((c) => c.n === "Fita e vedante")).toBe(true);
    expect(K.equip.find((e) => e.n === "Prensa de multicamada")!.eh).toBeCloseTo(0.85, 2);
  });
  it("o centro por omissão é um produto que traz um serviço", () => {
    const K = montar();
    const c = centroInicial(K)!;
    expect(c.t).toBe("prod");
    expect(K.produtos.find((p) => p.id === c.id)!.servico).toBeTruthy();
  });
});

describe("ligacoes · ligacoesDe", () => {
  it("serviço no centro: os produtos que o trazem (com o porquê) e os do ramo que exige, com a pergunta", () => {
    const K = montar(), m = ligacoesDe({ t: "svc", id: "c13" }, K);
    expect(m!.centro.n).toBe("Instalação de Sanita Compacta");
    const P = grupo(m, "produtos");
    expect(P.nota).toMatch(/^O cliente mantém a sanita\?/);
    // 22/10: a sanita suspensa traz a instalação de sanita suspensa; quem traz a compacta é a sanita compacta
    expect(P.itens.some((l) => l.n === "Sanita suspensa com estrutura" && /traz/.test(l.porque))).toBe(false);
    const sanita = P.itens.find((l) => l.n === "Sanita compacta")!;
    expect(sanita.porque).toBe("1 un traz 1 × Instalação de Sanita Compacta");
    expect(P.itens.find((l) => l.n === "Base de duche 80×120")!.porque).toBe("Pede um de Louças e torneiras · se o cliente não mantém");
    // 14/10: a receita da Mudelar do c13 (dois passos do canalizador)
    expect(grupo(m, "tecnicos").itens).toEqual([expect.objectContaining({ n: "Canalizador", porque: "2 passos: 0,87 h/un · 18,50 €/h (média de Marco Antunes)" })]);
  });
  it("serviço com receita: equipamentos com €/h × h/un e consumíveis com a marca de opcional", () => {
    const K = montar((c) => { c.receitas.canal = { ...receitaCanal(c), cons: receitaCanal(c).cons.map((x) => (x.n === "Fita e vedante" ? { ...x, opcional: true } : x)) }; });
    const m = ligacoesDe({ t: "svc", id: "canal" }, K);
    expect(grupo(m, "equipamentos").itens[0]).toMatchObject({ n: "Prensa de multicamada", porque: "0,85 €/h · 0,4 h/pt" });
    const fita = grupo(m, "consumiveis").itens.find((l) => l.n === "Fita e vedante")!;
    expect(fita.opcional).toBe(true);
    expect(fita.porque).toMatch(/opcional$/);
    expect(grupo(m, "consumiveis").itens.find((l) => l.n === "Tubo multicamada 16 mm")!.opcional).toBeUndefined();
  });
  it("produto no centro (o vice-versa): o serviço que traz, os que o pedem, as alternativas (as do mesmo serviço primeiro) e quem instala", () => {
    // 22/10: a sanita suspensa traz a instalação de sanita suspensa (s-moissusp, só no Catálogo inteiro da Mudelar, fora destes testes);
    // o produto no centro é a sanita compacta, que traz a de sanita compacta (c13)
    const K = montar();
    expect(K.produtos.find((p) => p.n === "Sanita suspensa com estrutura")!.servico).toBe("s-moissusp");
    const id = K.produtos.find((p) => p.n === "Sanita compacta")!.id;
    const m = ligacoesDe({ t: "prod", id }, K);
    expect(grupo(m, "traz").itens).toEqual([expect.objectContaining({ n: "Instalação de Sanita Compacta", porque: "traz 1 × Instalação de Sanita Compacta" })]);
    expect(nomes(m, "pedem")).toContain("Montagem de louças");
    expect(nomes(m, "alternativas")).toContain("Sanita suspensa com estrutura");
    expect(nomes(m, "alternativas")).toContain("Base de duche 80×120");
    expect(grupo(m, "instala").itens[0]).toMatchObject({ n: "Canalizador", porque: "Instala · 2 passos: 0,87 h/un · 18,50 €/h (média de Marco Antunes)" });
  });
  it("as alternativas são as da mesma subcategoria quando o produto a tem", () => {
    const K = montar(undefined, (k) => {
      const base = k.produtos.find((p) => p.n === "Sanita compacta")!;
      k.produtos.push({ ...base, id: "t1", n: "Toalheiro A", sub: "Toalheiros", servico: undefined }, { ...base, id: "t2", n: "Toalheiro B", sub: "Toalheiros", servico: undefined });
    });
    const m = ligacoesDe({ t: "prod", id: "t1" }, K);
    expect(nomes(m, "alternativas")).toEqual(["Toalheiro B"]);
    expect(grupo(m, "alternativas").nota).toBe("Da mesma subcategoria: Toalheiros.");
  });
  it("técnico, equipamento e consumível no centro: os serviços que os usam", () => {
    const K = montar();
    expect(nomes(ligacoesDe({ t: "tec", id: "canalizador" }, K), "servicos")).toEqual(expect.arrayContaining(["Canalização", "Instalação de Sanita Compacta"]));
    const prensa = K.equip.find((e) => e.n === "Prensa de multicamada")!.id;
    const usamPrensa = grupo(ligacoesDe({ t: "equip", id: prensa }, K), "servicos").itens;
    expect(usamPrensa).toEqual(expect.arrayContaining([expect.objectContaining({ n: "Canalização", porque: "0,85 €/h · 0,4 h/pt" })]));
    // 14/10: e os c1..c41 de canalização com a receita da Mudelar
    expect(usamPrensa.map((l) => l.n)).toEqual(expect.arrayContaining(["Supressão de ponto de água", "Mão de Obra - Deslocação de Ponto de Água ML"]));
    const fita = K.consumiveis.find((c) => c.n === "Fita e vedante")!.k;
    expect(nomes(ligacoesDe({ t: "cons", id: fita }, K), "servicos")).toEqual(["Canalização"]);
  });
  it("cada elemento aparece uma só vez e nunca o próprio centro; um elemento que já não existe dá null", () => {
    const K = montar();
    for (const r of [{ t: "svc" as const, id: "c13" }, { t: "prod" as const, id: centroInicial(K)!.id }, { t: "tec" as const, id: "canalizador" }]) {
      const m = ligacoesDe(r, K)!, ks = m.grupos.flatMap((g) => g.itens.map((l) => chaveRef(l.ref)));
      expect(new Set(ks).size).toBe(ks.length);
      expect(ks).not.toContain(chaveRef(r));
    }
    expect(ligacoesDe({ t: "svc", id: "não-existe" }, K)).toBeNull();
  });
});

describe("ligacoes · problemasCatalogo", () => {
  it("com os dados de exemplo: serviços sem receita e produtos que se instalam sem serviço (os de um ramo exigido ficam de fora)", () => {
    const K = montar(undefined, undefined, comSemReceita), P = problemasCatalogo(K), n = contarProblemas(P);
    expect(n["svc-sem-receita"]).toBe(1);
    const sem = P.filter((p) => p.tipo === "svc-sem-receita").map((p) => p.ref.id);
    expect(sem).toEqual([SEM_RECEITA]);
    expect(sem).not.toContain("canal");
    const prod = P.filter((p) => p.tipo === "prod-sem-servico").map((p) => p.n);
    expect(prod).toEqual(expect.arrayContaining(["Espelho simples 60×80", "Conjunto de acessórios WC"]));
    // a base de duche está no ramo que «Montagem de louças» exige: o serviço do pacote instala-a
    expect(prod).not.toContain("Base de duche 80×120");
    expect(prod).not.toContain("Sanita compacta");
    expect(n["equip-sem-uso"]).toBe(0);
    expect(n["cons-sem-uso"]).toBe(0);
  });
  it("equipamento e consumível que nenhum serviço usa, e serviço que exige um produto de um ramo vazio ou que não existe", () => {
    const K = montar(
      (c) => { c.equip.push({ id: "e-novo", n: "Aspirador industrial", compra: 300, vida: 1000, residual: 0, manutAno: 0, usoAno: 600 }); c.receitas.canal = { ...receitaCanal(c), cons: receitaCanal(c).cons.filter((x) => x.n !== "Fita e vedante") }; },
      (k) => { const pint = k.arvore.find((x) => x.n === "Pintura")!.id; k.exigeProduto = { ...k.exigeProduto, [SEM_RECEITA]: pint, c7: "nó-apagado" }; },
      comSemReceita,
    );
    const P = problemasCatalogo(K), por = problemasPorNo(P);
    expect(P.find((p) => p.tipo === "equip-sem-uso")).toMatchObject({ n: "Aspirador industrial", ref: { t: "equip", id: "e-novo" } });
    expect(P.find((p) => p.tipo === "cons-sem-uso")).toMatchObject({ n: "Fita e vedante" });
    const exige = P.filter((p) => p.tipo === "svc-exige-sem-produto");
    expect(exige.map((p) => p.ref.id).sort()).toEqual(["c7", SEM_RECEITA]);
    expect(exige.find((p) => p.ref.id === SEM_RECEITA)!.t).toBe("Exige um produto de Pintura, mas não há nenhum.");
    expect(por.get(`svc:${SEM_RECEITA}`)!.map((p) => p.tipo)).toEqual(["svc-sem-receita", "svc-exige-sem-produto"]);
  });
  it("os irmãos com serviço dizem que o produto devia ter um", () => {
    const K = montar(undefined, (k) => {
      const base = k.produtos.find((p) => p.n === "Toalheiro elétrico")!;
      k.produtos.push({ ...base, id: "x1", n: "Peça sem nome", sub: "Toalheiros", servico: undefined }, { ...base, id: "x2", n: "Outra peça", sub: "Toalheiros" });
    });
    expect(problemasCatalogo(K).filter((p) => p.tipo === "prod-sem-servico").map((p) => p.ref.id)).toContain("x1");
  });
});

describe("ligacoes · escala e pesquisa", () => {
  it("aguenta o catálogo real (360 serviços e 2.200 produtos) depressa", () => {
    const t0 = performance.now();
    const K = montar(undefined, (k) => {
      const base = k.produtos.find((p) => p.n === "Sanita compacta")!;
      for (let i = 0; i < 2200; i++) k.produtos.push({ ...base, id: `x${i}`, n: `Artigo ${i}`, sku: `SKU-${i}`, sub: `Sub ${i % 40}`, servico: i % 3 ? undefined : "c13" } as Produto);
    });
    for (let i = 0; i < 320; i++) K.servicos.push({ ...K.servicos.find((s) => s.id === "c13")!, id: `s${i}`, n: `Serviço ${i}` });
    const m = ligacoesDe({ t: "svc", id: "c13" }, K)!, P = problemasCatalogo(K);
    expect(K.servicos.length).toBeGreaterThanOrEqual(360);
    expect(grupo(m, "produtos").itens.length).toBeGreaterThan(2000);
    expect(P.length).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it("procura em tudo, sem acentos, serviços primeiro e produtos também pela referência", () => {
    const K = montar(undefined, (k) => { k.produtos[2].sku = "ROCA-123"; });
    const L = procurarNos(K, "sanita");
    expect(L[0].ref.t).toBe("svc");
    expect(L.some((x) => x.ref.t === "prod")).toBe(true);
    expect(procurarNos(K, "roca-123").map((x) => x.n)).toEqual([K.produtos.find((p) => p.sku === "ROCA-123")!.n]);
    expect(procurarNos(K, "canalizacao").some((x) => x.ref.t === "tec" || x.ref.t === "svc")).toBe(true);
    expect(procurarNos(K, "  ")).toEqual([]);
  });
});

/** A receita do «canal» como está no arranque (de receitas.ts), para a mexer num teste. */
function receitaCanal(c: Custos) {
  const S = seed();
  return structuredClone(receitaDe({ ...c, receitas: {} }, "canal", S.svc.canal, S.cfg.alvo)!);
}
