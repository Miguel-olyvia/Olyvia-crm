// As regras das Encomendas Clientes (RULES do mockup 4, 5, 6, 13 e 14): reserva FIFO, baixa por venda no momento definido, uma PO por fornecedor e por origem,
// pacotes expandidos, sem fornecedor, eliminar com estorno e a edição de uma EC manual. Valores esperados medidos no motor original do HTML.
import { describe, expect, it } from "vitest";
import { fresca, recusa } from "./ajudaTestes";
import { ecPorId } from "./base";
import { criarEc, ecEstado, ecLinhaInfo, ecSegmentos, editarEcManual, eliminarEc, livreEm, mudarArmazemEc, pedirEmFalta, reservadoEm, reservas, reverterSaida, sairLinha, simularVenda } from "./ec";
import { qtyAt } from "./stock";
import { poStatus } from "./po";
import type { Inventario } from "./tipos";

const ec = (db: Inventario, id: string) => ecPorId(db, id)!;

describe("RULES 4 · reserva FIFO: disponível é o stock menos as reservas anteriores", () => {
  it("a EC mais antiga fica com o stock; as encomendas a caminho não contam", () => {
    const db = fresca();
    const l = ec(db, "EC-0087").lines.find((x) => x.sku === "PV-450")!;
    expect(reservas(db).ready[l.id]).toBe(28);
    expect(qtyAt(db, "PV-450", "LIS")).toBe(28);
    expect(reservadoEm(db, "PV-450", "LIS")).toBe(28);
    expect(livreEm(db, "PV-450", "LIS")).toBe(0);
  });

  it("um armazém que não serve clientes não tem nada pronto a sair, mas a EC continua a reservar o que quer", () => {
    const db = fresca();
    const l = ec(db, "EC-0086").lines.find((x) => x.sku === "LR-50")!;
    expect(reservas(db).ready[l.id]).toBe(60);
    db.warehouses.find((w) => w.id === "POR")!.serves = false;
    db.v += 1;
    expect(reservas(db).ready[l.id]).toBe(0);
    expect(reservadoEm(db, "LR-50", "POR")).toBe(60);
  });

  it("o progresso de uma EC divide-se em servido, em stock, à espera de PO e em falta", () => {
    const db = fresca();
    const e = criarEc(db, { origin: { k: "manual", ref: null }, client: "Teste", wh: "LIS", lines: [{ sku: "KIT-PV4", qty: 1 }, { sku: "TR-50", qty: 3 }] });
    expect(ecSegmentos(db, e)).toEqual({ s: 0, st: 21, po: 4, mi: 3, tot: 28 });
  });
});

describe("RULES 5 · baixa por venda no momento definido, nunca nos dois", () => {
  it("com a baixa no contrato, uma proposta aceite não gera encomenda; o contrato gera", () => {
    const db = fresca();
    const antes = db.ecs.length;
    const linhas = [{ sku: "TR-50", qty: 1 }];
    expect(recusa(() => simularVenda(db, { kind: "PR", client: "Cliente X", addr: "", wh: "LIS", lines: linhas }))).toBe("Com a definição atual esta origem não gera encomenda. Nada foi criado.");
    expect(db.ecs).toHaveLength(antes);
    const e = simularVenda(db, { kind: "CT", client: "Cliente X", addr: "", wh: "LIS", lines: linhas });
    expect(e.origin.ref).toBe("CT-2026-044");
    expect(e.diag).toMatchObject({ text: "Diagnóstico criado na simulação." });
  });

  it("com a baixa na proposta, é o contrato que não gera", () => {
    const db = fresca();
    db.settings.deduction = "proposal";
    expect(recusa(() => simularVenda(db, { kind: "CT", client: "Cliente X", addr: "", wh: "LIS", lines: [{ sku: "TR-50", qty: 1 }] }))).toBe("Com a definição atual esta origem não gera encomenda. Nada foi criado.");
    const e = simularVenda(db, { kind: "PR", client: "Cliente X", addr: "", wh: "LIS", lines: [{ sku: "TR-50", qty: 1 }] });
    expect(e.origin.ref).toBe("PR-2026-309");
  });

  it("a venda direta cria a encomenda e fica registada com a sua proforma", () => {
    const db = fresca();
    const e = simularVenda(db, { kind: "VD", client: "Cliente X", addr: "", wh: "LIS", lines: [{ sku: "TR-50", qty: 1 }] });
    expect(e.origin).toMatchObject({ k: "VD", ref: "VD-0022", proforma: "PF-2026-0034" });
    expect(db.vds[db.vds.length - 1]).toEqual({ ref: "VD-0022", state: "confirmed" });
  });

});

describe("RULES 5 · baixa por venda no momento definido, nunca nos dois (continuação)", () => {
  it("só serve de armazéns que servem clientes", () => {
    const db = fresca();
    expect(recusa(() => criarEc(db, { origin: { k: "manual", ref: null }, client: "X", wh: "FAR", lines: [{ sku: "TR-50", qty: 1 }] }))).toBe("Armazém Sul (Faro) não serve clientes. Escolha outro armazém de expedição.");
    expect(recusa(() => criarEc(db, { origin: { k: "manual", ref: null }, client: " ", wh: "LIS", lines: [{ sku: "TR-50", qty: 1 }] }))).toBe("Indique o cliente.");
    expect(recusa(() => criarEc(db, { origin: { k: "manual", ref: null }, client: "X", wh: "LIS", lines: [{ sku: "TR-50", qty: 1.5 }] }))).toBe("Quantidades inteiras e maiores que zero (TR-50).");
  });

  it("a saída de uma linha pronta regista o movimento; reverter estorna e o original fica no livro", () => {
    const db = fresca();
    const e = criarEc(db, { origin: { k: "manual", ref: null }, client: "Teste", wh: "LIS", lines: [{ sku: "KIT-PV4", qty: 1 }] });
    const l = e.lines.find((x) => x.sku === "ST-04")!;
    sairLinha(db, e, l, 1, "LIS");
    expect(l.served).toBe(1);
    expect(ecLinhaInfo(db, e, l).st).toBe("served");
    expect(qtyAt(db, "ST-04", "LIS")).toBe(4);
    expect(recusa(() => sairLinha(db, e, l, 1, "LIS"))).toBe("Linha já servida.");
    reverterSaida(db, e, l);
    expect(l.served).toBe(0);
    expect(qtyAt(db, "ST-04", "LIS")).toBe(5);
    expect(db.moves[db.moves.length - 1]).toMatchObject({ type: "in", note: "Estorno de saída" });
    expect(recusa(() => reverterSaida(db, e, l))).toBe("Sem saídas para reverter.");
  });

  it("no armazém de expedição só sai o que está pronto (reserva FIFO)", () => {
    const db = fresca();
    const e = ec(db, "EC-0087");
    const l = e.lines.find((x) => x.sku === "PV-450")!;
    expect(recusa(() => sairLinha(db, e, l, 29, "LIS"))).toBe("Só há 28 un prontas a sair em Armazém Central (Lisboa) para esta linha (reserva FIFO).");
    sairLinha(db, e, l, 28, "LIS");
    expect(qtyAt(db, "PV-450", "LIS")).toBe(0);
  });
});

describe("RULES 6 · uma PO por fornecedor e por origem, pacotes expandidos, sem fornecedor", () => {
  it("um pacote expande-se nos componentes e o que falta vai para a PO do preferencial (enviada direta)", () => {
    const db = fresca();
    const e = criarEc(db, { origin: { k: "manual", ref: null }, client: "Teste", wh: "LIS", lines: [{ sku: "KIT-PV4", qty: 1 }, { sku: "TR-50", qty: 3 }] });
    expect(e.id).toBe("EC-0094");
    expect(e.lines.map((l) => [l.sku, l.qty, l.stockQty, l.nosupQty, l.fromKit])).toEqual([
      ["PV-450", 4, 0, 0, "Kit solar 4 painéis (pacote)"], ["ST-04", 1, 1, 0, "Kit solar 4 painéis (pacote)"], ["CS-6", 20, 20, 0, "Kit solar 4 painéis (pacote)"], ["TR-50", 3, 0, 3, null],
    ]);
    const pos = db.pos.filter((p) => p.origin.ec === e.id);
    expect(pos.map((p) => `${p.id}:${p.status}:${p.lines.map((l) => l.sku + l.packs).join(",")}`)).toEqual(["PO-2026-0146:ordered:PV-4504"]);
    expect(ecEstado(db, e)).toBe("nosup");
  });

  it("com aprovação, as linhas do mesmo fornecedor e da mesma EC ficam numa só PO, sem duplicar ao pedir de novo", () => {
    const db = fresca();
    db.settings.autoPO = "approval";
    const e = criarEc(db, { origin: { k: "manual", ref: null }, client: "Teste", wh: "LIS", lines: [{ sku: "PV-450", qty: 100 }, { sku: "TM-16", qty: 500 }] });
    const pos = db.pos.filter((p) => p.origin.ec === e.id);
    expect(pos).toHaveLength(1);
    expect(pos[0]).toMatchObject({ sup: "alfa", status: "pending", auto: true, lines: [expect.objectContaining({ sku: "PV-450" }), expect.objectContaining({ sku: "TM-16", packs: 2 })] });
    expect(pedirEmFalta(db, e)).toEqual({ n: 0, pos: [] });
    expect(db.pos.filter((p) => p.origin.ec === e.id)).toHaveLength(1);
    expect(pos[0].lines).toHaveLength(2);
  });

  it("sem fornecedor preferencial a linha fica 'Sem fornecedor' e a EC também", () => {
    const db = fresca();
    const e = ec(db, "EC-0092");
    expect(e.lines[0]).toMatchObject({ sku: "AQS-200", nosupQty: 1, stockQty: 0 });
    expect(ecEstado(db, e)).toBe("nosup");
    expect(ecLinhaInfo(db, e, e.lines[0]).st).toBe("nosup");
  });

  it("mudar o armazém de expedição recalcula as reservas, mas não com saídas feitas", () => {
    const db = fresca();
    const e = ec(db, "EC-0091");
    mudarArmazemEc(db, e, "LIS");
    expect(e.wh).toBe("LIS");
    expect(recusa(() => mudarArmazemEc(db, ec(db, "EC-0085"), "POR"))).toBe("Já há saídas.");
    expect(recusa(() => mudarArmazemEc(db, e, "FAR"))).toBe("Armazém não serve clientes.");
  });
});

describe("RULES 13 · eliminar EC só manuais/VD, com motivo; estorna stock, liberta reservas, cancela POs e VD", () => {
  it("um contrato não se elimina e o motivo tem de ter 3 caracteres", () => {
    const db = fresca();
    expect(recusa(() => eliminarEc(db, ec(db, "EC-0086"), "motivo longo"))).toBe("Só se eliminam encomendas manuais ou de venda direta. Para contratos, anule o contrato.");
    expect(recusa(() => eliminarEc(db, ec(db, "EC-0092"), "ab"))).toBe("Motivo obrigatório (mínimo 3 caracteres).");
  });

  it("eliminar uma manual e anular um contrato: estornos, POs anuladas e transferências canceladas", () => {
    const db = fresca();
    eliminarEc(db, ec(db, "EC-0092"), "cliente desistiu");
    expect(ec(db, "EC-0092").deleted).toBe(true);
    const bc = qtyAt(db, "BC-08", "LIS");
    eliminarEc(db, ec(db, "EC-0087"), "contrato anulado", { contrato: true });
    expect(qtyAt(db, "BC-08", "LIS") - bc).toBe(1);
    expect(qtyAt(db, "AQS-200", "LIS")).toBe(2);
    const p = db.pos.find((x) => x.id === "PO-2026-0137")!;
    expect(poStatus(p)).toBe("received");
    expect(p.lines.map((l) => ({ c: l.cancelled, ecUnits: l.ecUnits }))).toEqual([{ c: 2, ecUnits: 8 }]);
    expect(p.cancels[p.cancels.length - 1]).toMatchObject({ locked: true, reason: "EC eliminada" });
    expect(db.transfers.map((t) => t.id + t.state)).toEqual(["TR-0007cancelled", "TR-0008cancelled"]);
    expect(recusa(() => eliminarEc(db, ec(db, "EC-0092"), "outra vez"))).toBe("Já eliminada.");
  });

  it("uma venda direta eliminada cancela o registo da venda", () => {
    const db = fresca();
    const e = ec(db, "EC-0088");
    expect(e.origin.k).toBe("VD");
    eliminarEc(db, e, "venda cancelada");
    expect(db.vds.find((v) => v.ref === e.origin.ref)?.state).toBe("cancelled");
  });
});

describe("RULES 14 · a edição de uma EC manual tranca as linhas já servidas", () => {
  it("só encomendas manuais se editam", () => {
    const db = fresca();
    expect(recusa(() => editarEcManual(db, ec(db, "EC-0086"), { client: "X", addr: "", notes: "" }, []))).toBe("Só encomendas manuais podem ser editadas.");
  });

  it("uma linha servida não desce abaixo do servido; subir atribui o que falta", () => {
    const db = fresca();
    const e = criarEc(db, { origin: { k: "manual", ref: null }, client: "Teste", wh: "LIS", lines: [{ sku: "ST-04", qty: 2 }] });
    const l = e.lines[0];
    sairLinha(db, e, l, 2, "LIS");
    expect(recusa(() => editarEcManual(db, e, { client: "Teste", addr: "", notes: "" }, [{ id: l.id, qty: 1 }]))).toBe("Linha ST-04 trancada: já saíram 2 un.");
    editarEcManual(db, e, { client: "  Novo nome ", addr: "Rua A", notes: "n" }, [{ id: l.id, qty: 3 }]);
    expect(e).toMatchObject({ client: "Novo nome", addr: "Rua A", notes: "n" });
    expect(l.qty).toBe(3);
    expect(l.stockQty + l.nosupQty + ecLinhaInfo(db, e, l).d.poQty).toBe(3);
  });

  it("descer corta primeiro o que não tinha fornecedor, depois o stock, depois a PO", () => {
    const db = fresca();
    const e = ec(db, "EC-0092");
    editarEcManual(db, e, { client: e.client, addr: e.addr, notes: e.notes }, [{ id: e.lines[0].id, qty: 2 }]);
    expect(e.lines[0]).toMatchObject({ qty: 2, nosupQty: 2 });
    editarEcManual(db, e, { client: e.client, addr: e.addr, notes: e.notes }, [{ id: e.lines[0].id, qty: 1 }]);
    expect(e.lines[0]).toMatchObject({ qty: 1, nosupQty: 1 });
    expect(recusa(() => editarEcManual(db, e, { client: e.client, addr: e.addr, notes: e.notes }, [{ id: e.lines[0].id, qty: 0 }]))).toBe("Quantidades inteiras e maiores que zero.");
  });
});
