// As regras do livro de movimentos (RULES do mockup 1, 2, 3 e 11): o stock só muda por movimentos, quantidades inteiras, embalagem contra unidade,
// custo médio só por entradas com custo, ajuste e quebra com motivo, transferência em duas pernas. Os valores esperados vêm do motor original do HTML.
import { describe, expect, it } from "vitest";
import { fresca, recusa } from "./ajudaTestes";
import { qtyAt, aplicarMovimentos, transferir, anotarMovimento, editarLinhaStock, adicionarStock } from "./stock";
import { executarPedidoTransf } from "./ec";
import { registarMovimento } from "./movimentos";
import { linhaDeArtigo, novaPo, enviarPo, poTotals, poOpenValue } from "./po";
import { receberLinhas } from "./receber";

describe("RULES 1 · o stock só muda por movimentos e uma saída abaixo de zero falha por inteiro", () => {
  it("recusa por inteiro: a entrada do mesmo pedido também não fica registada", () => {
    const db = fresca();
    const antes = db.moves.length;
    const msg = recusa(() => aplicarMovimentos(db, [{ type: "in", sku: "PV-450", wh: "LIS", qty: 5 }, { type: "out", sku: "PV-450", wh: "LIS", qty: 999 }]));
    expect(msg).toBe("Saída abaixo de zero: Painel fotovoltaico 450 W em Armazém Central (Lisboa) tem 33 un e pediu 999. Nada foi registado.");
    expect(db.moves).toHaveLength(antes);
    expect(qtyAt(db, "PV-450", "LIS")).toBe(28);
  });

  it("cada movimento regista o saldo depois e o utilizador", () => {
    const db = fresca();
    const [m] = aplicarMovimentos(db, [{ type: "out", sku: "CD-80", wh: "LIS", qty: 5, doc: "d" }]);
    expect(m).toMatchObject({ qty: -5, bal: 235, doc: "d", user: "Admin Demo", at: "2026-10-09T10:00" });
  });

  it("do livro só se edita a nota, e fica marcada como editada", () => {
    const db = fresca();
    const [m] = aplicarMovimentos(db, [{ type: "out", sku: "CD-80", wh: "LIS", qty: 1, note: "antes" }]);
    anotarMovimento(db, m.id, "  depois  ");
    expect(db.moves.find((x) => x.id === m.id)).toMatchObject({ qty: -1, bal: 239, note: "depois", noteBy: "Admin Demo", noteEdited: "2026-10-09T10:00" });
  });

  it("a quantidade de uma linha de stock nunca se edita: só localização e limites", () => {
    const db = fresca();
    const r = db.stocks.find((s) => s.sku === "CD-80")!;
    editarLinhaStock(db, r.id, { loc: "Z-9", min: 10, max: 300, rop: 90 });
    expect(r).toMatchObject({ loc: "Z-9", min: 10, max: 300, rop: 90, qty: 240 });
    expect(recusa(() => editarLinhaStock(db, r.id, { min: 400, max: 300 }))).toBe("O mínimo não pode ser maior que o máximo.");
    expect(recusa(() => editarLinhaStock(db, r.id, { rop: -1 }))).toBe("Mínimo, máximo e ponto de encomenda: inteiros ≥ 0.");
  });

  it("adicionar stock inicial entra por um movimento de Entrada, e pacotes não têm stock próprio", () => {
    const db = fresca();
    adicionarStock(db, { sku: "TR-50", wh: "POR", loc: "X", min: 0, max: 0, rop: 0, qty: 7, cost: 138 });
    expect(qtyAt(db, "TR-50", "POR")).toBe(7);
    expect(db.moves[db.moves.length - 1]).toMatchObject({ type: "in", doc: "Stock inicial", qty: 7 });
    expect(recusa(() => adicionarStock(db, { sku: "KIT-PV4", wh: "POR", loc: "", min: 0, max: 0, rop: 0, qty: 0, cost: null }))).toBe("Pacotes não têm stock próprio: são expandidos nos componentes.");
    expect(recusa(() => adicionarStock(db, { sku: "TR-50", wh: "POR", loc: "", min: 0, max: 0, rop: 0, qty: 0, cost: null }))).toBe("Já existe uma linha para este produto neste armazém.");
  });
});

describe("RULES 2 · quantidades inteiras; compra em embalagem, stock em unidades", () => {
  it("recusa quantidades que não são inteiros positivos", () => {
    const db = fresca();
    expect(recusa(() => aplicarMovimentos(db, [{ type: "in", sku: "CD-80", wh: "LIS", qty: 1.5 }]))).toBe("Quantidade tem de ser um número inteiro de unidades, maior que zero.");
    expect(recusa(() => aplicarMovimentos(db, [{ type: "in", sku: "CD-80", wh: "LIS", qty: 0 }]))).toBe("Quantidade tem de ser um número inteiro de unidades, maior que zero.");
  });

  it("2 bobines de 100 m a 100 € são 200 un a 1,00 € (e 246 € com IVA)", () => {
    const db = fresca();
    const it = db.items.find((i) => i.ref === "ALF-CAB6-100")!;
    const p = novaPo(db, { sup: "alfa", wh: "LIS" });
    const l = linhaDeArtigo(db, it, 2);
    l.price = 100;
    p.lines.push(l);
    enviarPo(db, p);
    expect(poTotals(p)).toEqual({ sub: 200, iva: 46, total: 246 });
    expect(poOpenValue(p)).toBe(246);
    const r = receberLinhas(db, p, [{ lineId: l.id, qty: 200 }], "LIS", null);
    expect(r.res[0]).toMatchObject({ qty: 200, toEC: 0, toStock: 200 });
    expect(qtyAt(db, "CS-6", "LIS")).toBe(840);
    expect(db.moves[db.moves.length - 1]).toMatchObject({ cost: 1, doc: p.id, note: "200 un para stock" });
  });
});

describe("RULES 3 · o custo médio ponderado só se recalcula com entradas com custo", () => {
  it("a entrada com custo pondera pelo stock total; sem custo, não muda", () => {
    const db = fresca();
    const p = db.products.find((x) => x.sku === "CS-6")!;
    aplicarMovimentos(db, [{ type: "in", sku: "CS-6", wh: "LIS", qty: 100 }]);
    expect(p.avg).toBe(0.95);
    aplicarMovimentos(db, [{ type: "in", sku: "CS-6", wh: "LIS", qty: 200, cost: 1 }]);
    expect(p.avg).toBeCloseTo((758 * 0.95 + 200 * 1) / 958, 10);
    const media = p.avg;
    aplicarMovimentos(db, [{ type: "out", sku: "CS-6", wh: "LIS", qty: 50 }]);
    expect(p.avg).toBe(media);
  });

  it("o custo médio do mockup depois de receber a bobine a 100 € é 0,96165501165...", () => {
    const db = fresca();
    const it = db.items.find((i) => i.ref === "ALF-CAB6-100")!;
    const p = novaPo(db, { sup: "alfa", wh: "LIS" });
    const l = linhaDeArtigo(db, it, 2);
    l.price = 100;
    p.lines.push(l);
    enviarPo(db, p);
    receberLinhas(db, p, [{ lineId: l.id, qty: 200 }], "LIS", null);
    expect(db.products.find((x) => x.sku === "CS-6")?.avg).toBeCloseTo(0.9616550116550117, 12);
  });
});

describe("RULES 11 · ajuste e quebra exigem motivo; transferência são duas pernas", () => {
  it("sem motivo, o ajuste e a quebra recusam", () => {
    const db = fresca();
    expect(recusa(() => registarMovimento(db, { type: "adjust", wh: "LIS", from: "LIS", to: "POR", sign: "+", reason: "", lines: [{ sku: "CD-80", qty: 1 }] }))).toBe("Motivo obrigatório em ajustes.");
    expect(recusa(() => registarMovimento(db, { type: "loss", wh: "LIS", from: "LIS", to: "POR", reason: "", lines: [{ sku: "CD-80", qty: 1 }] }))).toBe("Motivo obrigatório em quebras.");
  });

  it("a transferência regista saída na origem e entrada no destino com o mesmo documento", () => {
    const db = fresca();
    const antes = db.moves.length;
    expect(transferir(db, "CD-80", "LIS", "POR", 10)).toBe("TR-0009");
    expect(db.moves.slice(antes).map((m) => `${m.type}${m.wh}${m.qty}:${m.bal}`)).toEqual(["toutLIS-10:230", "tinPOR10:10"]);
    expect(db.moves.slice(antes).every((m) => m.doc === "TR-0009")).toBe(true);
    expect(recusa(() => transferir(db, "CD-80", "LIS", "LIS", 1))).toBe("Origem e destino têm de ser diferentes.");
  });

  it("um pedido de transferência não passa sem stock na origem; com stock, executa e fica feito", () => {
    const db = fresca();
    const t8 = db.transfers.find((t) => t.id === "TR-0008")!;
    expect(recusa(() => executarPedidoTransf(db, t8))).toBe("Insuficiente na origem: Armazém Norte (Porto) tem 12 un de Radiador alumínio 600 mm (elemento).");
    expect(t8.state).toBe("pending");
    const t7 = db.transfers.find((t) => t.id === "TR-0007")!;
    executarPedidoTransf(db, t7);
    expect(t7.state).toBe("done");
    expect(recusa(() => executarPedidoTransf(db, t7))).toBe("Pedido já tratado.");
  });

  it("registar movimento dá resultado parcial: a linha que falha não bloqueia as outras", () => {
    const db = fresca();
    const r = registarMovimento(db, { type: "out", wh: "LIS", from: "LIS", to: "POR", note: "x", doc: "d", lines: [{ sku: "CD-80", qty: 5 }, { sku: "BC-08", qty: 50 }, { sku: "VT-15", qty: 2 }] });
    expect(r.ok).toEqual([0, 2]);
    expect(r.failed).toEqual([{ i: 1, msg: "Saída abaixo de zero: Bomba de calor ar-água 8 kW em Armazém Central (Lisboa) tem 1 un e pediu 50. Nada foi registado." }]);
    expect(qtyAt(db, "CD-80", "LIS")).toBe(235);
    expect(qtyAt(db, "VT-15", "LIS")).toBe(34);
  });
});
