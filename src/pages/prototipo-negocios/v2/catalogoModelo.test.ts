import { afterEach, describe, expect, it } from "vitest";
import { CATALOGO, OFICIOS } from "../catalogo";
import { LINHAS, seed } from "../motor";
import { HOJE, custoReceita, custos0, listaCatalogo, margemSobrePreco, precoReceita, receitaDe } from "./custosModelo";
import {
  EX0, REGRAS_LINHAS, alertasPacote, caminho, catalogo0, consumivelDe, contaPacote, contarNo, criarPacote, criarProduto, dentroDe, escolherAlternativa,
  filtrarCombo, garantirValor, juntarAlternativa, juntarLinha, juntarNo, moverLinha, moverNo, mudarCusto, mudarRegra, noDoServico, oficioDe, oficios,
  opcoesPacote, produtoDesatualizado, propagarProduto, quantidade, regraDaUnidade, renomearNo, retirarAlternativa, retirarLinha, retirarNo, subs, textoRegra,
} from "./catalogoModelo";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./catalogoStore";
import { reporCustos } from "./custosStore";

describe("catálogo · regras de quantidade", () => {
  it("fixo, por medida, com fator e arredondamento; e o texto", () => {
    const m = { pav: 4, par: 14.5, pts: 3, pcs: 2 };
    expect(quantidade({ k: "fixo", q: 1 }, m)).toBe(1);
    expect(quantidade({ k: "por", med: "pav", f: 1, arred: false }, m)).toBe(4);
    expect(quantidade({ k: "por", med: "par", f: 1.1, arred: true }, m)).toBe(16);
    expect(quantidade({ k: "por", med: "par", f: 1.1, arred: false }, m)).toBe(15.95);
    expect(textoRegra({ k: "fixo", q: 1 })).toBe("fixo 1");
    expect(textoRegra({ k: "por", med: "pav", f: 1, arred: false })).toBe("1 por m² de pavimento");
    expect(textoRegra({ k: "por", med: "par", f: 1.1, arred: true })).toBe("1,1 por m² de paredes, arredondado");
  });
  it("a regra por omissão sai da unidade", () => {
    expect(regraDaUnidade("m²")).toEqual({ k: "por", med: "pav", f: 1, arred: false });
    expect(regraDaUnidade("pt")).toMatchObject({ med: "pts" });
    expect(regraDaUnidade("pç")).toMatchObject({ med: "pcs" });
    expect(regraDaUnidade("un")).toEqual({ k: "fixo", q: 1 });
  });
  it("as regras dos materiais batem com as funções dos LINHAS do motor", () => {
    const medidas = [{ pav: 4, par: 14, pts: 3, pcs: 3 }, { pav: 9.5, par: 22, pts: 2, pcs: 9 }, { pav: 0, par: 0, pts: 0, pcs: 0 }];
    for (const L of Object.values(LINHAS)) for (const [n, , f] of L.mats) {
      if (!REGRAS_LINHAS[n]) continue;
      for (const m of medidas.slice(0, 2)) expect(quantidade(REGRAS_LINHAS[n], m)).toBe(f(m));
    }
  });
});

describe("catálogo · a árvore de classificação", () => {
  it("arranca com os ofícios do Catálogo real e subs", () => {
    const K = catalogo0();
    expect(oficios(K.arvore).map((n) => n.n)).toEqual(OFICIOS);
    const rev = oficios(K.arvore).find((n) => n.n === "Revestimentos")!;
    expect(subs(K.arvore, rev.id).map((n) => n.n)).toEqual(["Parede", "Pavimento", "Colas e argamassas"]);
    expect(caminho(K.arvore, K.classe.revest)).toBe("Revestimentos › Parede");
    expect(caminho(K.arvore, null)).toBe("Sem classificação");
    // todos os serviços do Catálogo têm classificação
    for (const c of CATALOGO) expect(K.classe[c.id]).toBeTruthy();
  });
  it("juntar ofício e sub: nome obrigatório, sem repetir entre irmãos, sub só debaixo de ofício", () => {
    let A = catalogo0().arvore;
    const r = juntarNo(A, "Serralharia");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    A = r.A;
    expect(A[A.length - 1].n).toBe("Serralharia");
    expect(juntarNo(A, "  ").ok).toBe(false);
    expect(juntarNo(A, "serralharia")).toEqual({ ok: false, erro: "Já existe «serralharia» aqui." });
    const s = juntarNo(A, "Portões", r.id);
    expect(s.ok && caminho(s.A, s.id)).toBe("Serralharia › Portões");
    if (!s.ok) return;
    expect(juntarNo(s.A, "Outro", s.id).ok).toBe(false);
    // o mesmo nome noutro ofício pode
    const can = oficios(A).find((n) => n.n === "Canalização")!;
    expect(juntarNo(s.A, "Portões", can.id).ok).toBe(true);
    // o sub fica junto do ofício
    const r2 = juntarNo(A, "Pedra", oficios(A).find((n) => n.n === "Revestimentos")!.id);
    expect(r2.ok && r2.A.findIndex((x) => x.id === r2.id)).toBe(r2.ok ? r2.A.findIndex((x) => x.n === "Colas e argamassas") + 1 : -1);
  });
  it("renomear e mover (o ofício leva os subs; no limite não mexe)", () => {
    const A = catalogo0().arvore;
    const rev = oficios(A).find((n) => n.n === "Revestimentos")!;
    const r = renomearNo(A, rev.id, "Ladrilhos");
    expect(r.ok && caminho(r.A, subs(r.A, rev.id)[0].id)).toBe("Ladrilhos › Parede");
    expect(renomearNo(A, rev.id, "Canalização").ok).toBe(false);
    const subiu = moverNo(A, rev.id, -1);
    expect(oficios(subiu).map((n) => n.n).slice(0, 3)).toEqual(["Demolições", "Revestimentos", "Canalização"]);
    // os subs vêm logo a seguir ao ofício
    const i = subiu.findIndex((x) => x.id === rev.id);
    expect(subiu.slice(i + 1, i + 4).map((x) => x.n)).toEqual(["Parede", "Pavimento", "Colas e argamassas"]);
    expect(moverNo(A, oficios(A)[0].id, -1)).toBe(A);
    const par = subs(A, rev.id)[0];
    expect(subs(moverNo(A, par.id, 1), rev.id).map((x) => x.n)).toEqual(["Pavimento", "Parede", "Colas e argamassas"]);
    expect(subs(moverNo(A, par.id, -1), rev.id).map((x) => x.n)).toEqual(["Parede", "Pavimento", "Colas e argamassas"]);
  });
  it("retirar um sub passa o que lá estava para o ofício; retirar um ofício deixa sem classificação", () => {
    const K = catalogo0();
    const rev = oficios(K.arvore).find((n) => n.n === "Revestimentos")!, par = subs(K.arvore, rev.id)[0];
    const K2 = retirarNo(K, par.id);
    expect(K2.classe.revest).toBe(rev.id);
    expect(K2.produtos.find((p) => p.n === "Cerâmico de parede 30×60")!.no).toBe(rev.id);
    const K3 = retirarNo(K, rev.id);
    expect(K3.classe.revest).toBeUndefined();
    expect(K3.arvore.some((x) => x.pai === rev.id)).toBe(false);
    expect(K3.produtos.find((p) => p.n === "Cerâmico de parede 30×60")!.no).toBeNull();
  });
  it("contar e filtrar por ofício (o ofício conta os subs)", () => {
    const K = catalogo0(), sids = [...Object.keys(seed().svc), ...CATALOGO.map((c) => c.id)];
    const rev = oficios(K.arvore).find((n) => n.n === "Revestimentos")!;
    const n = contarNo(K, rev.id, sids);
    expect(n.svc).toBeGreaterThanOrEqual(2);
    expect(n.mat).toBeGreaterThanOrEqual(3);
    expect(dentroDe(K.arvore, K.classe.pav, rev.id)).toBe(true);
    expect(oficioDe(K.arvore, K.classe.pav)!.id).toBe(rev.id);
    expect(noDoServico(K, "zzz", "Pintura")).toBe(oficios(K.arvore).find((x) => x.n === "Pintura")!.id);
  });
});

describe("catálogo · criar ao escrever", () => {
  it("filtra sem acentos e propõe criar só o que não existe", () => {
    expect(filtrarCombo(["Würth", "Weber", "Roca"], "w")).toEqual({ opcoes: ["Würth", "Weber"], criar: "w" });
    expect(filtrarCombo(["Würth", "Weber"], "WURTH").criar).toBeNull();
    expect(filtrarCombo(["Würth"], "  ")).toEqual({ opcoes: ["Würth"], criar: null });
    expect(garantirValor(["kg"], "KG")).toEqual({ lista: ["kg"], v: "kg" });
    expect(garantirValor(["kg"], " bidão ")).toEqual({ lista: ["kg", "bidão"], v: "bidão" });
  });
});

describe("catálogo · materiais", () => {
  it("arranca com os materiais dos pacotes e os consumíveis das receitas, com data do preço", () => {
    const K = catalogo0();
    expect(K.produtos.some((p) => p.n === "Base de duche 80×120")).toBe(true);
    expect(K.produtos.some((p) => p.n === "Cimento-cola C2TE")).toBe(true);
    expect(new Set(K.produtos.map((p) => p.n)).size).toBe(K.produtos.length);
    const cola = K.produtos.find((p) => p.n === "Cimento-cola C2TE")!;
    expect(produtoDesatualizado(cola, 6)).toBe(true);
    expect(produtoDesatualizado(mudarCusto(cola, 0.21), 6)).toBe(false);
    expect(mudarCusto(cola, 0.21).data).toBe(HOJE);
  });
  it("criar: nome único, custo e unidade; marca e unidade novas entram nas listas", () => {
    const K = catalogo0();
    const r = criarProduto(K, { n: "Primário acrílico", custo: 12.5, un: "bidão", marca: "Robbialac", fornecedor: "CIN" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.K.produtos.find((x) => x.id === r.id)!;
    expect(p).toMatchObject({ n: "Primário acrílico", custo: 12.5, un: "bidão", marca: "Robbialac", fornecedor: "CIN", data: HOJE });
    expect(r.K.unidades).toContain("bidão");
    expect(r.K.marcas).toContain("Robbialac");
    expect(r.K.fornecedores.filter((f) => f === "CIN")).toHaveLength(1);
    expect(criarProduto(r.K, { n: "primário acrílico", custo: 1, un: "un" }).ok).toBe(false);
    expect(criarProduto(K, { n: "", custo: 1, un: "un" }).ok).toBe(false);
    expect(criarProduto(K, { n: "X", custo: NaN, un: "un" }).ok).toBe(false);
    expect(criarProduto(K, { n: "X", custo: 1, un: " " }).ok).toBe(false);
  });
  it("um material passa a consumível de receita; mudar o custo leva-o às receitas e tira o desatualizado", () => {
    const S = seed(), C = custos0(), K = catalogo0();
    const cola = K.produtos.find((p) => p.n === "Cimento-cola C2TE")!;
    expect(consumivelDe(cola, "c9", 2)).toMatchObject({ id: "c9", n: "Cimento-cola C2TE", q: 2, un: "kg", preco: 0.19, fornecedor: "Weber" });
    const antes = listaCatalogo(S, C).find((i) => i.sid === "revest")!;
    expect(antes.alertas.some((a) => a.id === "desatualizado")).toBe(true);
    const novo = mudarCusto(cola, 0.22);
    const recs = propagarProduto(S, C, novo);
    expect(Object.keys(recs).sort()).toEqual(["pav", "revest"]);
    C.receitas = { ...C.receitas, ...recs };
    const depois = listaCatalogo(S, C).find((i) => i.sid === "revest")!;
    expect(depois.alertas.some((a) => a.id === "desatualizado")).toBe(false);
    expect(depois.rec.cons.find((c) => c.n === "Cimento-cola C2TE")!.preco).toBe(0.22);
    expect(depois.rec.origem).toBe("catalogo");
  });
});

describe("catálogo · pacotes", () => {
  it("arrancam dos LINHAS do motor: serviços por medida e materiais, com alternativas", () => {
    const K = catalogo0();
    expect(K.pacotes.map((p) => p.n)).toEqual([`${LINHAS.wc.n} · ${LINHAS.wc.modelo}`, `${LINHAS.coz.n} · ${LINHAS.coz.modelo}`]);
    const wc = K.pacotes[0];
    expect(wc.linhas.filter((l) => l.t === "svc").map((l) => [l.esc, l.regra.k === "por" && l.regra.med])).toEqual(LINHAS.wc.map);
    expect(wc.linhas.filter((l) => l.t === "mat")).toHaveLength(LINHAS.wc.mats.length);
    expect(wc.linhas.find((l) => l.refs.length > 1)).toBeTruthy();
  });
  it("as contas: serviços com o custo e o preço da receita × quantidade; materiais custo ÷ (1 − margem)", () => {
    const S = seed(), C = custos0(), K = catalogo0(), P = K.pacotes[0];
    const c = contaPacote(S, C, K, P);
    const demol = c.linhas.find((l) => l.ref === "demol")!;
    const rec = receitaDe(C, "demol", S.svc.demol, S.cfg.alvo)!, cr = custoReceita(rec, C, S.cfg.estrutura);
    expect(demol.q).toBe(EX0.pav);
    expect(demol.custo).toBeCloseTo(cr.total * EX0.pav, 6);
    expect(demol.preco).toBeCloseTo(precoReceita(rec, cr.total) * EX0.pav, 6);
    const base = c.linhas.find((l) => l.n === "Base de duche 80×120")!;
    expect(base.q).toBe(1);
    expect(base.pu).toBeCloseTo(210 / 0.65, 6);
    expect(c.custo).toBeCloseTo(c.linhas.reduce((a, l) => a + l.custo, 0), 6);
    expect(c.m).toBeCloseTo(margemSobrePreco(c.preco, c.custo), 9);
    // a alternativa escolhida é a que conta
    const linhaBase = P.linhas.find((l) => l.esc === base.ref)!;
    const P2 = escolherAlternativa(P, linhaBase.id, linhaBase.refs[1]);
    expect(contaPacote(S, C, K, P2).linhas.find((l) => l.id === linhaBase.id)!.n).toBe("Banheira acrílica 170×70");
    // outras medidas, outras quantidades
    expect(contaPacote(S, C, K, P, { ...EX0, pav: 10 }).linhas.find((l) => l.ref === "demol")!.q).toBe(10);
  });
  it("criar um pacote e juntar linhas, alternativas, regras; mover e retirar", () => {
    const S = seed(), C = custos0();
    const r = criarPacote(catalogo0(), "Pintura de quarto", { alvo: 35 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(criarPacote(r.K, "pintura de quarto").ok).toBe(false);
    let P = r.K.pacotes.find((p) => p.id === r.id)!;
    expect(alertasPacote(contaPacote(S, C, r.K, P), P)[0].t).toMatch(/vazio/);
    P = juntarLinha(P, "svc", "pint", "m²");
    expect(juntarLinha(P, "svc", "pint", "m²")).toBe(P);
    const tinta = r.K.produtos.find((p) => p.n === "Tinta acrílica anti-fungos")!, fita = r.K.produtos.find((p) => p.n === "Fita e lixa")!;
    P = juntarLinha(P, "mat", tinta.id, tinta.un);
    expect(P.linhas.map((l) => textoRegra(l.regra))).toEqual(["1 por m² de pavimento", "fixo 1"]);
    P = mudarRegra(P, P.linhas[1].id, { k: "por", med: "par", f: 0.25, arred: true });
    expect(contaPacote(S, C, r.K, P).linhas[1].q).toBe(Math.ceil(EX0.par * 0.25));
    P = juntarAlternativa(P, P.linhas[1].id, fita.id);
    expect(P.linhas[1].refs).toEqual([tinta.id, fita.id]);
    P = escolherAlternativa(P, P.linhas[1].id, fita.id);
    expect(P.linhas[1].esc).toBe(fita.id);
    P = retirarAlternativa(P, P.linhas[1].id, fita.id);
    expect(P.linhas[1]).toMatchObject({ refs: [tinta.id], esc: tinta.id });
    expect(retirarAlternativa(P, P.linhas[1].id, tinta.id)).toEqual(P);
    P = moverLinha(P, P.linhas[1].id, -1);
    expect(P.linhas[0].t).toBe("mat");
    expect(moverLinha(P, P.linhas[0].id, -1)).toBe(P);
    P = retirarLinha(P, P.linhas[0].id);
    expect(P.linhas).toHaveLength(1);
  });
  it("alerta da margem do pacote abaixo do mínimo (a mínima da linha, ou a geral)", () => {
    const S = seed(), C = custos0(), K = catalogo0();
    const P = { ...K.pacotes[1], margemMat: 5 };
    const c = contaPacote(S, C, K, P);
    expect(c.min).toBe(30);
    expect(alertasPacote(c, P).some((a) => a.k === "x")).toBe(c.m < 0.3);
    const semLinha = contaPacote(S, C, K, { ...P, linha: null });
    expect(semLinha.min).toBe(S.cfg.min);
  });
  it("as opções para juntar: pesquisa sem acentos, por tipo, por ofício e sem as já juntadas", () => {
    const S = seed(), K = catalogo0();
    const o = opcoesPacote(S, K, "ceramico");
    expect(o.some((x) => x.t === "mat" && x.n === "Pavimento cerâmico 60×60")).toBe(true);
    expect(o.some((x) => x.t === "svc" && x.ref === "pav")).toBe(true);
    expect(opcoesPacote(S, K, "ceramico", { t: "mat" }).every((x) => x.t === "mat")).toBe(true);
    const pint = oficios(K.arvore).find((x) => x.n === "Pintura")!;
    expect(opcoesPacote(S, K, "", { oficio: pint.id, max: 99 }).every((x) => dentroDe(K.arvore, x.no, pint.id))).toBe(true);
    expect(opcoesPacote(S, K, "", { sem: ["demol"], max: 99 }).some((x) => x.ref === "demol")).toBe(false);
    expect(opcoesPacote(S, K, "", {}).length).toBeLessThanOrEqual(12);
  });
});

describe("catálogo · a store", () => {
  afterEach(() => reporCustos());
  it("muda em memória e o reporCustos (Repor a demonstração) também a repõe", () => {
    mudarCatalogo((k) => { k.pacotes = []; });
    expect(lerCatalogo().pacotes).toHaveLength(0);
    reporCustos();
    expect(lerCatalogo().pacotes).toHaveLength(2);
    mudarCatalogo((k) => { k.marcas.push("X"); });
    reporCatalogo();
    expect(lerCatalogo().marcas).not.toContain("X");
  });
});
