import { afterEach, describe, expect, it } from "vitest";
import { acoes, seed, type Negocio } from "./motor";
import { itemCatalogo } from "./catalogo";
import { catalogo0 } from "./v2/catalogoModelo";
import { ligarCatalogo } from "./produtosVisita";
import {
  atualizar, contextoVisita, executar, ferramentas, medidasCompletas, medidasDoTexto, procurarProdutos, rascunhoVazio, servicosDoTexto, simular, sistema,
  textoDe, validarNaVisita,
} from "./conversaIA";

const K = catalogo0();
afterEach(() => ligarCatalogo(null));

/** Um negócio de casa de banho com a visita por fazer (sem medidas nem escolhas). */
function wcLimpo() {
  const S = seed();
  const d = S.deals.find((x) => x.linha === "wc")!;
  d.visita = { ...d.visita, med: { pav: 0, par: 0, pts: 0, pcs: 0 }, off: [], extra: {}, prod: [], manter: {}, nec: [], fechada: false };
  return { S, d };
}
const uso = (name: string, input: unknown, id = "t1") => ({ type: "tool_use", id, name, input }) as never;

describe("o que se manda ao Claude", () => {
  it("o system tem o Catálogo inteiro com ids, as medidas da linha e as perguntas", () => {
    const { S, d } = wcLimpo();
    const s = sistema(S, K, d);
    expect(s).toContain("c13 | Sanita compacta | Canalização | un");
    expect(s).toMatch(/demol \| .*pacote: a quantidade é a medida "pav"/);
    expect(s).toContain("- pav: Pavimento (m²)");
    expect(s).toContain("c13: O cliente mantém a sanita?");
    expect(s.split("\n").filter((l) => /^s-/.test(l)).length).toBeGreaterThan(300); // os serviços da Mudelar
  });
  it("as ferramentas são estritas e as chaves das medidas são as da linha", () => {
    const { d } = wcLimpo();
    const fs = ferramentas(d) as { name: string; strict: boolean; input_schema: { properties: Record<string, { items?: { properties: { chave?: { enum: string[] } } } }> } }[];
    expect(fs.map((f) => f.name)).toEqual(["procurar_produtos", "atualizar_levantamento", "mostrar_produtos", "sugerir_respostas"]);
    expect(fs.every((f) => f.strict)).toBe(true);
    expect(fs[1].input_schema.properties.medidas.items!.properties.chave!.enum).toEqual(["pav", "par", "ptf", "ptq", "pcs"]);
  });
  it("o contexto da volta diz o que já está e o que está proposto", () => {
    const { d } = wcLimpo();
    d.visita.extra.c3 = 1;
    const r = { ...rascunhoVazio(), servicos: { c13: { q: 1, motivo: "" } }, medidas: { pav: 5 } };
    const c = contextoVisita(d, r);
    expect(c).toContain("Pavimento (m²): 5");
    expect(c).toContain("Na visita: c3 ×1");
    expect(c).toContain("Proposto por validar: c13 ×1");
  });
});

describe("as ferramentas", () => {
  it("procurar: as palavras no nome primeiro e o plural não falha", () => {
    const ps = procurarProdutos(K, "bases de duche", 5);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.every((p) => /duche/i.test(p.n + " " + (p.sub ?? "")))).toBe(true);
    expect(procurarProdutos(K, "", 5)).toEqual([]);
  });
  it("atualizar: junta, muda, tira com 0 e recusa ids inventados", () => {
    const { S, d } = wcLimpo();
    const p = procurarProdutos(K, "sanita", 1)[0];
    let x = atualizar(rascunhoVazio(), { servicos: [{ id: "c13", quantidade: 1 }, { id: "inventado", quantidade: 2 }], produtos: [{ id: p.id, quantidade: 1 }],
      medidas: [{ chave: "pav", valor: 4.5 }, { chave: "xyz", valor: 1 }], manter: [{ servico: "c13", resposta: "nao" }], notas: ["Branco mate", " "] }, S, K, d);
    expect(x.r.servicos.c13.q).toBe(1);
    expect(x.r.produtos[p.id].q).toBe(1);
    expect(x.r.medidas).toEqual({ pav: 4.5 });
    expect(x.r.manter).toEqual({ c13: "nao" });
    expect(x.r.notas).toEqual(["Branco mate"]);
    expect(x.ignorados).toEqual(["serviço inventado", "medida xyz"]);
    expect(x.novos).toContain("s:c13");
    x = atualizar(x.r, { servicos: [{ id: "c13", quantidade: 0 }] }, S, K, d);
    expect(x.r.servicos.c13).toBeUndefined();
  });
  it("executar: um tool_result por chamada; os cartões só com ids que existem", () => {
    const { S, d } = wcLimpo();
    const ids = procurarProdutos(K, "base duche", 3).map((p) => p.id);
    const v = executar([
      uso("procurar_produtos", { texto: "base duche", max: 3 }, "a"),
      uso("mostrar_produtos", { pergunta: "Qual base?", para_servico: "", produtos: [...ids, "nao-existe"] }, "b"),
      uso("sugerir_respostas", { opcoes: ["Sim", "Não"] }, "c"),
      uso("atualizar_levantamento", { servicos: [{ id: "c10", quantidade: 1, motivo: "coluna" }], produtos: [], medidas: [], manter: [], notas: [] }, "d"),
    ], rascunhoVazio(), S, K, d);
    expect(v.resultados.map((r) => r.tool_use_id)).toEqual(["a", "b", "c", "d"]);
    expect(String(v.resultados[0].content).split("\n")).toHaveLength(3);
    expect(v.cartoes).toEqual([{ k: "produtos", pergunta: "Qual base?", para: null, ids }, { k: "respostas", opcoes: ["Sim", "Não"] }]);
    expect(v.rascunho.servicos.c10.q).toBe(1);
  });
});

describe("validar: o rascunho entra na visita", () => {
  it("medidas, serviços à mão, serviços do pacote, produtos, respostas e notas; os desligados ficam de fora", () => {
    const { S, d } = wcLimpo();
    ligarCatalogo(() => K);
    const A = acoes(S, () => {}, (fn) => fn());
    d.visita.off.push("loucas");
    const [p1, p2] = procurarProdutos(K, "sanita", 2);
    const r = { ...rascunhoVazio(), medidas: { pav: 5, par: 18 }, servicos: { c3: { q: 1, motivo: "" }, loucas: { q: 3, motivo: "" }, c14: { q: 1, motivo: "" } },
      produtos: { [p1.id]: { q: 1, motivo: "" }, [p2.id]: { q: 1, motivo: "" } }, manter: { c13: "nao" as const }, notas: ["Branco mate"] };
    const res = validarNaVisita(A, S, K, d, r, new Set(["s:c14", "p:" + p2.id]));
    expect(res).toEqual({ servicos: 2, produtos: 1, medidas: 2 });
    expect(d.visita.med).toMatchObject({ pav: 5, par: 18, pcs: 3 });
    expect(d.visita.off).not.toContain("loucas");
    expect(d.visita.extra).toEqual({ c3: 1 });
    expect(d.visita.prod!.map((p) => p.id)).toEqual([p1.id]);
    expect(d.visita.manter).toEqual({ c13: "nao" });
    expect(d.visita.nec).toEqual(["Branco mate"]);
  });
});

describe("o modo de demonstração", () => {
  it("lê as medidas ditas", () => {
    expect(medidasDoTexto("a casa de banho tem 2 por 2,5 e pé direito de 2,4", "wc")).toEqual({ pav: 5, par: 19.44 });
    expect(medidasDoTexto("chão 6 m2, paredes 20 m² e 3 pontos de água", "wc")).toEqual({ pav: 6, par: 20, ptf: 3, ptq: 0 });
    expect(medidasDoTexto("base de duche 80x80", "wc")).toEqual({}); // centímetros de um produto, não o chão
  });
  it("encontra serviços pelo nome curto", () => {
    const { S, d } = wcLimpo();
    expect(servicosDoTexto(S, d, "quer um teto falso em pladur e construção de nicho")).toEqual(expect.arrayContaining(["teto", "c3"]));
  });
  it("responde com texto e as mesmas ferramentas que a API: propõe e mostra produtos para escolher", () => {
    const { S, d } = wcLimpo();
    const b = simular(S, K, d, rascunhoVazio(), "Tirar a banheira e pôr base de duche, 2 por 2,5 e pé direito 2,4", 0);
    expect(textoDe(b)).toMatch(/Juntei/);
    const v = executar(b, rascunhoVazio(), S, K, d);
    expect(v.rascunho.medidas.pav).toBe(5);
    expect(v.rascunho.servicos.c1).toBeDefined();
    expect(v.cartoes[0]).toMatchObject({ k: "produtos", pergunta: "Qual base de duche?" });
  });
  it("a escolha de um cartão não se lê como medidas nem como serviços; o mesmo nome curto só entra uma vez", () => {
    const { S, d } = wcLimpo();
    const v = executar(simular(S, K, d, rascunhoVazio(), "Escolhido: Base de Duche STONE PLUS 80x80 (p-1).", 0), rascunhoVazio(), S, K, d);
    expect(v.rascunho.medidas).toEqual({});
    expect(v.rascunho.servicos).toEqual({});
    const nomes = servicosDoTexto(S, d, "teto falso em pladur").map((sid) => (S.svc[sid]?.n ?? itemCatalogo(sid)?.n ?? "").toLowerCase().replace(/\s*c\/.*$/, ""));
    expect(nomes.length).toBeGreaterThan(0);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
  it("sem nada que perceber, pede as medidas", () => {
    const { S, d } = wcLimpo();
    expect(medidasCompletas(d as Negocio, {})).toBe(false);
    const b = simular(S, K, d, rascunhoVazio(), "olá", 0);
    expect(textoDe(b)).toMatch(/medidas/);
  });
});
