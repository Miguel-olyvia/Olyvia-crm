import { afterEach, describe, expect, it } from "vitest";
import { acoes, criarOrc, seed, tot, type Negocio } from "./motor";
import { catalogo0, retirarNo, type Catalogo } from "./v2/catalogoModelo";
import {
  PREFIXO_CLIENTE, PREFIXO_PROD, fotografia, juntarProduto, ligarCatalogo, materiaisDoModelo, obrigacoes, qtdSugerida, servicosTrazidos,
  tirarProduto, trazidosParaOrc,
} from "./produtosVisita";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";

const K0 = catalogo0();
const prodN = (K: Catalogo, n: string) => K.produtos.find((p) => p.n === n)!;
const no = (K: Catalogo, n: string) => K.arvore.find((x) => x.n === n)!.id;

function preencher(d: Negocio, gs: Grupo[]) {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
}

afterEach(() => ligarCatalogo(null));

describe("Catálogo: relações entre serviços e produtos", () => {
  it("o arranque traz obrigações, perguntas e produtos que trazem serviço (e produtos só vendidos)", () => {
    expect(K0.exigeProduto!.loucas).toBe(no(K0, "Louças e torneiras"));
    expect(K0.exigeProduto!.pav).toBe(no(K0, "Pavimento"));
    expect(K0.exigeProduto!.demol).toBeUndefined(); // serviço sem produto
    expect(K0.perguntaManter!.c13).toBe("O cliente mantém a sanita?");
    expect(prodN(K0, "Sanita suspensa com estrutura")).toMatchObject({ servico: "c13", fatorServico: 1 });
    expect(prodN(K0, "Espelho simples 60×80").servico).toBeUndefined(); // produto sem serviço
    expect(K0.produtos.find((p) => p.id === "m1")!.n).toBe("Cerâmico de parede 30×60"); // os ids de antes não mudam
  });
  it("retirar o nó passa a obrigação para o ofício", () => {
    const K = retirarNo(K0, no(K0, "Louças e torneiras"));
    expect(K.exigeProduto!.loucas).toBe(no(K0, "Canalização"));
  });
  it("estado antigo sem os campos novos: sem relações", () => {
    const K: Catalogo = { ...K0, exigeProduto: undefined, perguntaManter: undefined, qtdDe: undefined };
    expect(obrigacoes(K, ["loucas", "pav"], {})).toEqual([]);
  });
});

describe("serviços trazidos por produtos", () => {
  const sanita = fotografia(prodN(K0, "Sanita suspensa com estrutura"), 2);
  const espelho = fotografia(prodN(K0, "Espelho simples 60×80"), 1);
  it("a quantidade do serviço é a do produto × fator, e diz de onde veio", () => {
    const t = servicosTrazidos([sanita, espelho, { ...fotografia(prodN(K0, "Sanita compacta"), 1) }]);
    expect(t.c13).toEqual({ q: 3, de: ["Sanita suspensa com estrutura", "Sanita compacta"] });
    expect(Object.keys(t)).toEqual(["c13"]);
  });
  it("tirar o produto tira o serviço; posto à mão fica (e a quantidade à mão manda)", () => {
    const prod = juntarProduto([], sanita);
    expect(trazidosParaOrc(prod, [], {}).map(([s]) => s)).toEqual(["c13"]);
    expect(trazidosParaOrc(prod, [], { c13: 1 })).toEqual([]); // à mão: não repete
    expect(trazidosParaOrc(tirarProduto(prod, sanita.id), [], {})).toEqual([]);
  });
  it("a quantidade sugerida sai das medidas (pavimento × 1,1, arredondado)", () => {
    const pav = prodN(K0, "Pavimento cerâmico 60×60");
    expect(qtdSugerida(K0, pav, ["pav"], { pav: 5, par: 0, pts: 0, pcs: 0 })).toBe(6);
    expect(qtdSugerida(K0, pav, ["demol"], { pav: 5, par: 0, pts: 0, pcs: 0 })).toBe(1);
  });
});

describe("a pergunta antes do produto obrigatório", () => {
  const sids = ["c13"];
  const sanita = fotografia(prodN(K0, "Sanita compacta"), 1);
  it("sem resposta: falta responder", () => {
    expect(obrigacoes(K0, sids, {})[0]).toMatchObject({ estado: "pergunta", cumprida: false });
  });
  it("Sim: o cliente mantém, sem produto", () => {
    expect(obrigacoes(K0, sids, { manter: { c13: "sim" } })[0]).toMatchObject({ estado: "mantem", cumprida: true });
  });
  it("Não: é preciso o produto do Catálogo", () => {
    expect(obrigacoes(K0, sids, { manter: { c13: "nao" } })[0]).toMatchObject({ estado: "falta", cumprida: false });
    expect(obrigacoes(K0, sids, { manter: { c13: "nao" }, prod: [sanita] })[0]).toMatchObject({ estado: "produto", cumprida: true, por: ["Sanita compacta"] });
  });
  it("Não + o cliente compra: só conta quando o cliente fornece materiais", () => {
    const v = { manter: { c13: "nao" as const }, clienteCompra: { c13: "Sanita" } };
    expect(obrigacoes(K0, sids, v, false)[0].estado).toBe("falta");
    expect(obrigacoes(K0, sids, v, true)[0]).toMatchObject({ estado: "cliente", cumprida: true });
  });
});

describe("a linha de materiais do modelo com produtos escolhidos", () => {
  it("desce pelo custo dos produtos (preço na mesma proporção); sem produtos fica igual; se cobrir tudo, sai", () => {
    const mat = { custo: 1400, preco: 2168 };
    expect(materiaisDoModelo(mat, [])).toEqual(mat);
    const r = materiaisDoModelo(mat, [fotografia(prodN(K0, "Sanita suspensa com estrutura"), 1)])!;
    expect(r.custo).toBe(1115);
    expect(r.preco).toBeCloseTo(2168 * (1115 / 1400), 2);
    expect(materiaisDoModelo(mat, [{ ...fotografia(prodN(K0, "Sanita compacta"), 10) }])).toBeNull();
  });
});

describe("na visita: portão, orçamento e reabrir", () => {
  const preparar = () => {
    const S = seed();
    ligarCatalogo(() => K0);
    const avisos: string[] = [];
    const A = acoes(S, (a) => avisos.push(a.msg + " · " + (a.sub || "")), (fn) => fn());
    const d = S.deals.find((x) => x.id === 1035)!; // Hugo Matos, WC na Visita, com medidas (pav 5, pcs 3)
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    return { S, A, d, avisos };
  };

  it("os negócios de exemplo não mudam de orçamento (sem produtos na visita)", () => {
    const S = seed();
    ligarCatalogo(() => K0);
    for (const d of S.deals.filter((x) => x.orc)) {
      const o = criarOrc(d, structuredClone(S));
      expect(o.linhas.filter((l) => l.t === "svc")).toEqual(d.orc!.linhas.filter((l) => l.t === "svc"));
    }
    expect(tot(S.deals.find((x) => x.id === 1050)!, S).pf).toBeGreaterThan(0);
  });

  it("o portão pede as respostas e os produtos em falta, e fecha quando estão", () => {
    const { A, d, avisos } = preparar();
    A.fecharVisita(d.id);
    expect(d.fase).toBe(2);
    expect(d.valida?.grupos).toContain("nec");
    expect(avisos.at(-1)).toMatch(/Falta responder: o cliente mantém a sanita e a base de duche\?/);
    A.manter(d.id, "loucas", "sim");
    A.manter(d.id, "pav", "nao");
    A.fecharVisita(d.id);
    expect(d.fase).toBe(2);
    expect(avisos.at(-1)).toMatch(/Falta escolher: produto de Revestimentos › Pavimento/);
    A.produto(d.id, prodN(K0, "Pavimento cerâmico 60×60"), 6);
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
  });

  it("o orçamento leva os produtos, os serviços trazidos e a linha do modelo reduzida", () => {
    const { S, A, d } = preparar();
    A.manter(d.id, "loucas", "nao"); A.manter(d.id, "pav", "sim");
    A.produto(d.id, prodN(K0, "Sanita suspensa com estrutura"), 1);
    A.produto(d.id, prodN(K0, "Espelho simples 60×80"), 1);
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
    const o = d.orc!;
    const svc = o.linhas.flatMap((l) => (l.t === "svc" ? [l.sid] : []));
    expect(svc).toContain("c13"); // trazido pela sanita
    expect(S.svc.c13.n).toBe("Instalação de Sanita Compacta");
    const mats = o.linhas.flatMap((l) => (l.t === "mat" ? [l] : []));
    expect(mats.find((l) => l.d === PREFIXO_PROD + "Sanita suspensa com estrutura")).toMatchObject({ custo: 285, preco: 380 });
    expect(mats.find((l) => l.d === PREFIXO_PROD + "Espelho simples 60×80")).toBeTruthy();
    expect(mats.find((l) => l.d.startsWith("cerâmico"))!.custo).toBe(1400 - 285 - 35);
  });

  it("o cliente compra (com materiais do cliente): linha a zero", () => {
    const { A, d } = preparar();
    d.f.materiais_cliente = "Sim";
    A.manter(d.id, "loucas", "nao"); A.manter(d.id, "pav", "sim");
    A.clienteCompra(d.id, "loucas", "Louças e torneiras, para Montagem de louças");
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
    expect(d.orc!.linhas).toContainEqual({ t: "mat", d: PREFIXO_CLIENTE + "Louças e torneiras, para Montagem de louças", custo: 0, preco: 0 });
  });

  it("reabrir o levantamento: volta à Visita e, ao fechar, refaz o orçamento guardando preços e desconto", () => {
    const { A, d } = preparar();
    A.manter(d.id, "loucas", "sim"); A.manter(d.id, "pav", "sim");
    A.fecharVisita(d.id);
    const o = d.orc!;
    const i = o.linhas.findIndex((l) => l.t === "svc" && l.sid === "revest");
    (o.linhas[i] as { pu: number }).pu = 30;
    o.desconto = 5;
    A.reabrirVisita(d.id);
    expect(d.fase).toBe(2);
    expect(d.visita.fechada).toBe(false);
    d.visita.med.par = 18;
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
    const l = d.orc!.linhas.find((x) => x.t === "svc" && x.sid === "revest")!;
    expect(l).toMatchObject({ q: 18, pu: 30 });
    expect(d.orc!.desconto).toBe(5);
  });

  it("não se reabre depois de a proposta ser enviada", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1031)!; // proposta enviada
    A.reabrirVisita(d.id);
    expect(d.fase).toBe(3);
    expect(d.visita.fechada).toBe(true);
  });
});
