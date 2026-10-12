// As regras das guias, contagens, armazéns, fornecedores (preços e catálogo) e a loja em memória (RULES do mockup 12 e as restantes). Valores medidos no motor original.
import { afterEach, describe, expect, it } from "vitest";
import { fresca, recusa } from "./ajudaTestes";
import { contagemPorId, guiaPorId } from "./base";
import { alternarArmazem, decidirPreco, definirArmazemPorDefeito, definirPreferido, desligarCatalogo, eliminarArmazem, eliminarFornecedor, guardarArmazem, ligarCatalogo, removerArtigo } from "./cadastros";
import { cancelarContagem, contarLinha, criarContagem, estatisticasContagem, finalizarContagem, infoLinha, preencherEsperado, resolverLinha } from "./contagens";
import { cancelarGuia, fecharGuia, guardarGuia, reabrirGuia, resumoGuia } from "./guias";
import { esquecerInventario, executar, lerInventario } from "./loja";
import { aplicarMovimentos, qtyAt } from "./stock";

const contagem = (db: ReturnType<typeof fresca>, id: string) => contagemPorId(db, id)!;
const guia = (db: ReturnType<typeof fresca>, id: string) => guiaPorId(db, id)!;
afterEach(() => esquecerInventario());

describe("RULES 12 · a contagem só fecha sem diferenças por resolver", () => {
  it("o esperado soma o que se moveu durante a contagem e a diferença é contada − esperado", () => {
    const db = fresca();
    const c = contagem(db, "INV-2026-014");
    expect(c.lines.map((l) => [l.sku, l.sys, l.counted, infoLinha(db, c, l)])).toEqual([
      ["PV-450", 28, null, { moved: 0, exp: 28, diff: null, pending: true }],
      ["INV-H5", 4, 4, { moved: 0, exp: 4, diff: 0, pending: false }],
      ["CS-6", 640, 638, { moved: 0, exp: 640, diff: -2, pending: true }],
      ["ST-04", 5, 5, { moved: 0, exp: 5, diff: 0, pending: false }],
    ]);
    aplicarMovimentos(db, [{ type: "out", sku: "ST-04", wh: "LIS", qty: 1 }]);
    expect(infoLinha(db, c, c.lines[3])).toEqual({ moved: -1, exp: 4, diff: 1, pending: true });
  });

  it("não finaliza com linhas por contar ou resolver", () => {
    const db = fresca();
    expect(recusa(() => finalizarContagem(db, contagem(db, "INV-2026-014")))).toBe("Faltam 2 linha(s) por contar ou resolver.");
    expect(estatisticasContagem(db, contagem(db, "INV-2026-014"))).toEqual({ done: 3, disc: 1, pend: 2, total: 4 });
  });

});

describe("RULES 12 · a contagem só fecha sem diferenças por resolver (continuação)", () => {
  it("ajustado gera um movimento de ajuste ao finalizar; aceite sem ajuste não gera", () => {
    const db = fresca();
    const c = contagem(db, "INV-2026-014");
    contarLinha(db, c, 0, 28);
    resolverLinha(db, c, 2, "adjusted");
    expect(finalizarContagem(db, c)).toBe(1);
    expect(c.state).toBe("final");
    expect(db.moves[db.moves.length - 1]).toMatchObject({ type: "adjm", sku: "CS-6", qty: -2, doc: "INV-2026-014", note: "Contagem: diferença ajustada" });
    expect(qtyAt(db, "CS-6", "LIS")).toBe(638);
    expect(recusa(() => contarLinha(db, c, 0, 5))).toBe("Contagem fechada: quantidades corrigem-se com um ajuste.");
  });

  it("'Recontagem' mantém a linha por resolver; contar sem diferença limpa a resolução", () => {
    const db = fresca();
    const c = contagem(db, "INV-2026-014");
    resolverLinha(db, c, 2, "recount");
    expect(infoLinha(db, c, c.lines[2]).pending).toBe(true);
    contarLinha(db, c, 2, 640);
    expect(c.lines[2].res).toBe("");
    expect(recusa(() => contarLinha(db, c, 2, -1))).toBe("Contada: inteiro ≥ 0.");
  });

  it("nova contagem: pré-preenchida ou cega, uma em curso por armazém e categoria", () => {
    const db = fresca();
    const c = criarContagem(db, { wh: "POR", cat: "Isolamento", init: "system" });
    expect(c.id).toBe("INV-2026-015");
    expect(c.lines.every((l) => l.counted === l.sys)).toBe(true);
    expect(recusa(() => criarContagem(db, { wh: "POR", cat: "Isolamento", init: "blank" }))).toBe("Já existe uma contagem em curso que cobre este armazém/categoria.");
    expect(recusa(() => criarContagem(db, { wh: "FAR", cat: "", init: "blank" }))).toBe("Não há produtos em stock para este armazém/categoria.");
    const aberta = contagem(db, "INV-2026-014");
    preencherEsperado(db, aberta);
    expect(aberta.lines[0].counted).toBe(28);
    cancelarContagem(db, aberta, "armazém fechado");
    expect(aberta).toMatchObject({ state: "cancelled", cancelReason: "armazém fechado" });
  });
});

describe("Guias do fornecedor: anunciado contra recebido", () => {
  it("o resumo da GR 2026/311 tem 1 divergência (falta de 2) e fechar pede nota", () => {
    const db = fresca();
    const g = guia(db, "GR 2026/311");
    expect(resumoGuia(db, g)).toEqual({ rows: [{ sku: "PV-450", ann: 10, rec: 8, diff: -2, kind: "falta" }], div: 1, annT: 10, recT: 8, anyRec: true });
    expect(recusa(() => fecharGuia(db, g, ""))).toBe("A guia tem 1 divergência(s): escreva uma nota para fechar (mínimo 3 caracteres).");
    fecharGuia(db, g, "faltaram 2");
    expect(g).toMatchObject({ state: "closed", note: "faltaram 2" });
    reabrirGuia(db, g);
    expect(g.state).toBe("open");
    expect(recusa(() => reabrirGuia(db, g))).toBe("Só guias fechadas podem ser reabertas.");
  });

  it("sem receções, uma guia fecha sem nota e cancela com motivo; com receções ativas não cancela", () => {
    const db = fresca();
    expect(recusa(() => cancelarGuia(db, guia(db, "GR 2026/311"), "motivo claro"))).toBe("A guia tem receções ativas. Reverta-as na encomenda antes de cancelar.");
    const g = guia(db, "GR 2026/312");
    expect(recusa(() => cancelarGuia(db, g, "ab"))).toBe("Motivo obrigatório (mínimo 3 caracteres).");
    cancelarGuia(db, g, "duplicada");
    expect(g).toMatchObject({ state: "cancelled", note: "duplicada" });
    expect(recusa(() => cancelarGuia(db, g, "duplicada"))).toBe("Já cancelada.");
  });

  it("o número da guia é único por fornecedor (sem distinguir maiúsculas) e só guias abertas se editam", () => {
    const db = fresca();
    expect(recusa(() => guardarGuia(db, { no: "gr 2026/311", sup: "alfa", date: "2026-10-09", wh: "LIS", ann: [] }))).toBe("Guia duplicada: GR 2026/311 de Fornecedor Alfa Materiais já existe (aberta). Use a existente.");
    expect(recusa(() => guardarGuia(db, { no: " ", sup: "alfa", date: "2026-10-09", wh: "LIS", ann: [] }))).toBe("Indique o número da guia.");
    expect(recusa(() => guardarGuia(db, { orig: "GR 2026/290", no: "GR 2026/290", sup: "eps", date: "2026-09-10", wh: "POR", ann: [] }))).toBe("Só guias abertas podem ser editadas.");
    const g = guardarGuia(db, { no: "GR 2026/400", sup: "alfa", date: "2026-10-09", wh: "LIS", ann: [{ sku: "CS-6", qty: 0 }, { sku: "PV-450", qty: 3 }] });
    expect(g.ann).toEqual([{ sku: "PV-450", qty: 3 }]);
  });
});

describe("Armazéns e definições", () => {
  it("o armazém por defeito não se desliga nem se elimina; sem stock nem encomendas a expedir daí, elimina-se", () => {
    const db = fresca();
    expect(recusa(() => alternarArmazem(db, "LIS", "active", false))).toBe("É o armazém por defeito: escolha outro nas Definições primeiro.");
    expect(recusa(() => eliminarArmazem(db, "LIS"))).toBe("É o armazém por defeito.");
    expect(recusa(() => eliminarArmazem(db, "POR"))).toBe("Tem stock: transfira-o primeiro.");
    expect(recusa(() => alternarArmazem(db, "POR", "serves", false))).toBe("Há encomendas clientes a expedir daqui: mude-lhes o armazém de expedição primeiro.");
    eliminarArmazem(db, "FAR");
    expect(db.warehouses.find((w) => w.id === "FAR")).toMatchObject({ deleted: true, active: false });
    expect(recusa(() => definirArmazemPorDefeito(db, "FAR"))).toBe("O armazém por defeito tem de estar ativo e servir clientes.");
    definirArmazemPorDefeito(db, "POR");
    expect(db.settings.defaultWh).toBe("POR");
  });

  it("gravar valida código único, código postal e email, e obtém as coordenadas pelo código postal", () => {
    const db = fresca();
    const d = { name: "Novo", code: "ARM-01", addr: "", cp: "9999", city: "", manager: "", phone: "", email: "mau", cap: "", active: true, serves: true };
    expect(recusa(() => guardarArmazem(db, d, null))).toBe("Código já usado.");
    expect(recusa(() => guardarArmazem(db, { ...d, code: "ARM-09" }, null))).toBe("Formato 0000-000.");
    expect(recusa(() => guardarArmazem(db, { ...d, code: "ARM-09", cp: "1000-001" }, null))).toBe("Email inválido.");
    const w = guardarArmazem(db, { ...d, code: "ARM-09", cp: "1000-001", email: "a@b.pt" }, null);
    expect(w.lat).toBeCloseTo(38.72, 2);
    expect(recusa(() => guardarArmazem(db, { ...d, code: "ARM-01", cp: "", email: "", active: false }, "LIS"))).toBe("É o armazém por defeito: tem de estar ativo e servir clientes.");
  });
});

describe("Fornecedores: preços, preferido e catálogo", () => {
  it("aceitar um preço atualiza o artigo e, sendo o preferido, o custo do produto; recusar guarda a nota; só se decide uma vez", () => {
    const db = fresca();
    const pc = db.prices.find((p) => db.items.find((i) => i.id === p.itemId)?.ref === "ALF-PV450")!;
    decidirPreco(db, pc.id, true);
    expect(db.items.find((i) => i.ref === "ALF-PV450")?.price).toBe(124.5);
    expect(db.products.find((p) => p.sku === "PV-450")?.cost).toBe(124.5);
    expect(recusa(() => decidirPreco(db, pc.id, true))).toBe("Alteração já decidida.");
    const outro = db.prices.find((p) => p.state === "pending")!;
    decidirPreco(db, outro.id, false, "demasiado caro");
    expect(outro).toMatchObject({ state: "rejected", note: "demasiado caro" });
  });

  it("marcar o preferido desmarca os outros do mesmo produto; remover com encomendas em aberto recusa", () => {
    const db = fresca();
    const zs = db.items.find((i) => i.ref === "ZS-450M")!;
    definirPreferido(db, zs.id);
    expect(db.items.filter((i) => i.sku === "PV-450").map((i) => [i.ref, i.pref])).toEqual([["ALF-PV450", false], ["ZS-450M", true]]);
    const alf = db.items.find((i) => i.ref === "ALF-PV450")!;
    expect(recusa(() => removerArtigo(db, alf.id))).toBe("Há encomendas em aberto com este artigo: receba-as ou anule o resto primeiro.");
  });

  it("ligar um artigo do catálogo cria o artigo (não preferido se já há um); desligar volta a 'por ligar'", () => {
    const db = fresca();
    const c = db.catalog.find((x) => x.ref === "ZS-ST4")!;
    ligarCatalogo(db, c.id, "ST-04");
    expect(db.items.find((i) => i.ref === "ZS-ST4")).toMatchObject({ sup: "zeta", sku: "ST-04", pref: false });
    expect(c).toMatchObject({ state: "linked", link: "ST-04" });
    expect(recusa(() => ligarCatalogo(db, c.id, "ST-04"))).toBe("Esta referência já está ligada.");
    desligarCatalogo(db, c.id);
    expect(c).toMatchObject({ state: "unlinked", link: null });
  });

  it("um fornecedor com encomendas em aberto não se elimina", () => {
    const db = fresca();
    expect(recusa(() => eliminarFornecedor(db, "alfa"))).toBe("Tem encomendas em aberto: receba-as ou anule o resto primeiro.");
    eliminarFornecedor(db, "gama");
    expect(db.suppliers.find((s) => s.id === "gama")?.deleted).toBe(true);
  });
});

describe("A loja em memória", () => {
  it("uma regra recusada não muda nada; uma ação bem feita substitui a base por uma cópia", () => {
    const antes = lerInventario();
    const moves = antes.moves.length;
    const r = executar((db) => aplicarMovimentos(db, [{ type: "out", sku: "BC-08", wh: "LIS", qty: 99 }]));
    expect(r.ok).toBe(false);
    expect(lerInventario()).toBe(antes);
    const ok = executar((db) => aplicarMovimentos(db, [{ type: "out", sku: "CD-80", wh: "LIS", qty: 1 }]));
    expect(ok.ok).toBe(true);
    expect(lerInventario()).not.toBe(antes);
    expect(antes.moves).toHaveLength(moves);
    expect(lerInventario().moves).toHaveLength(moves + 1);
  });

  it("repor volta aos dados de exemplo", () => {
    executar((db) => aplicarMovimentos(db, [{ type: "out", sku: "CD-80", wh: "LIS", qty: 1 }]));
    esquecerInventario();
    expect(lerInventario().moves).toHaveLength(25);
  });

  it("um erro que não é de uma regra não se engole", () => {
    expect(() => executar(() => { throw new TypeError("bug"); })).toThrow("bug");
  });
});
