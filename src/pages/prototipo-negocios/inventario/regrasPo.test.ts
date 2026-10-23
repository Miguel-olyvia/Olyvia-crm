// As regras das encomendas a fornecedor e da receção (RULES do mockup 7, 8, 9 e 10): o estado calcula-se pelas receções, receber nunca passa do que falta,
// a repartição entre a EC e o stock, reverter com motivo, passar para stock só com a EC inativa, anular o resto (e desfazer) e o bloqueio do portal.
import { describe, expect, it } from "vitest";
import { fresca, recusa } from "./ajudaTestes";
import { ecPorId, poPorId } from "./base";
import { eliminarEc, sairLinha } from "./ec";
import { aceitarDataPrometida, editarPacksLinha, eliminarPo, enviarPo, poLate, poLocked, poOpen, poPorIdObrigatoria, poRem, poStatus, retirarDoPortal } from "./po";
import { anularResto, desfazerAnulacao, passarParaStock, receberLinhas, reverterRececao } from "./receber";
import { qtyAt } from "./stock";
import type { Inventario, Po } from "./tipos";

const po = (db: Inventario, id: string): Po => poPorIdObrigatoria(db, id);
/** A PO da Silva & Filhos (alfa, 10 painéis, 8 já recebidos, ligada à EC-0087): falta receber 2. */
const poAlfa = (db: Inventario): Po => po(db, "PO-2026-0137");

describe("RULES 7 · o estado da PO é calculado pelas receções", () => {
  it("Recebida e Parcialmente recebida nunca se escolhem: nascem das linhas", () => {
    const db = fresca();
    expect(poStatus(po(db, "PO-2026-0132"))).toBe("received");
    expect(poStatus(poAlfa(db))).toBe("partial");
    expect(poStatus(po(db, "PO-2026-0141"))).toBe("ordered");
    expect(poStatus(po(db, "PO-2026-0143"))).toBe("pending");
    expect(poStatus(po(db, "PO-2026-0134"))).toBe("cancelled");
  });

  it("uma PO encomendada com tudo anulado e nada recebido fica Cancelada", () => {
    const db = fresca();
    const p = po(db, "PO-2026-0141");
    anularResto(db, p, p.lines.map((l) => l.id), "Fornecedor sem produto", "");
    expect(poStatus(p)).toBe("cancelled");
  });

  it("está atrasada quando a entrega prevista já passou e ainda está em aberto", () => {
    const db = fresca();
    expect(poLate(po(db, "PO-2026-0137"))).toBe(true);
    expect(poLate(po(db, "PO-2026-0132"))).toBe(false);
    expect(poOpen(po(db, "PO-2026-0132"))).toBe(false);
  });

  it("aprovar e enviar: com portal ativo publica-se no portal; sem portal segue o PDF por email; só uma pendente com linhas", () => {
    const db = fresca();
    const alfa = po(db, "PO-2026-0144");
    enviarPo(db, alfa);
    expect(alfa).toMatchObject({ status: "ordered", portal: { state: "sent" } });
    expect(alfa.log[alfa.log.length - 1].t).toBe("Aprovada por Admin Demo: publicada no portal do fornecedor e email enviado");
    const gama = po(db, "PO-2026-0143");
    enviarPo(db, gama);
    expect(gama.portal.state).toBe("email");
    expect(recusa(() => enviarPo(db, gama))).toBe("Só uma encomenda pendente pode ser aprovada.");
    const vazia = { ...po(db, "PO-2026-0145"), lines: [] };
    expect(recusa(() => enviarPo(db, vazia))).toBe("A encomenda não tem linhas.");
  });
});

describe("RULES 8 · receção: nunca mais do que falta e repartição EC/stock", () => {
  it("recusa receber mais do que falta e não regista nada", () => {
    const db = fresca();
    const p = poAlfa(db);
    const antes = db.moves.length;
    expect(recusa(() => receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 3 }], "LIS", null))).toBe("Nunca mais do que falta: Painel fotovoltaico 450 W tem 2 un por receber.");
    expect(db.moves).toHaveLength(antes);
    expect(recusa(() => receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 0 }], "LIS", null))).toBe("Indique pelo menos uma quantidade a receber.");
  });

  it("a parte para a EC fica reservada (não livre) e a PO passa a Recebida", () => {
    const db = fresca();
    const p = poAlfa(db);
    const r = receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 2 }], "LIS", null);
    expect(r.res.map((x) => ({ qty: x.qty, toEC: x.toEC, toStock: x.toStock, ec: x.ec }))).toEqual([{ qty: 2, toEC: 2, toStock: 0, ec: "EC-0087" }]);
    expect(poStatus(p)).toBe("received");
    expect(qtyAt(db, "PV-450", "LIS")).toBe(30);
    expect(p.log[p.log.length - 1].t).toBe("Receção em Armazém Central (Lisboa): 2 un PV-450 → Recebida");
  });

  it("receber só numa PO em aberto, num armazém que exista e com a guia aberta", () => {
    const db = fresca();
    const fechada = po(db, "PO-2026-0132");
    expect(recusa(() => receberLinhas(db, fechada, [{ lineId: fechada.lines[0].id, qty: 1 }], "POR", null))).toBe("PO-2026-0132 não está em aberto (estado: Recebida).");
    const p = poAlfa(db);
    expect(recusa(() => receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 1 }], "XXX", null))).toBe("Escolha o armazém de destino.");
    expect(recusa(() => receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 1 }], "LIS", "GR 2026/290"))).toBe("A guia GR 2026/290 não está aberta.");
  });

  it("com a guia aberta, a receção liga a PO à guia e fica no histórico dela", () => {
    const db = fresca();
    const p = poAlfa(db);
    receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 2 }], "LIS", "GR 2026/311");
    const g = db.guias.find((x) => x.id === "GR 2026/311")!;
    expect(g.pos).toContain("PO-2026-0137");
    expect(g.history[g.history.length - 1].t).toBe("Receção de PO-2026-0137: 2× PV-450");
  });

});

describe("RULES 8 · receção: nunca mais do que falta e repartição EC/stock (continuação)", () => {
  it("uma EC que expede de outro armazém gera um pedido de transferência ao receber", () => {
    const db = fresca();
    const p = poAlfa(db);
    const antes = db.transfers.length;
    receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 2 }], "POR", null);
    const t = db.transfers[antes];
    expect(t).toMatchObject({ sku: "PV-450", from: "POR", to: "LIS", qty: 2, ec: "EC-0087", auto: true, state: "pending" });
  });

  it("reverter exige motivo (≥3) e tira do stock; a PO volta a Parcialmente recebida", () => {
    const db = fresca();
    const p = poAlfa(db);
    receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 2 }], "LIS", null);
    const rec = p.receipts.filter((x) => x.state === "Ativa").pop()!;
    expect(recusa(() => reverterRececao(db, p, rec.id, "a"))).toBe("Motivo obrigatório (mínimo 3 caracteres).");
    reverterRececao(db, p, rec.id, "engano");
    expect(poStatus(p)).toBe("partial");
    expect(qtyAt(db, "PV-450", "LIS")).toBe(28);
    expect(rec).toMatchObject({ state: "Revertida", reason: "engano" });
    expect(recusa(() => reverterRececao(db, p, rec.id, "outra vez"))).toBe("Receção não está ativa.");
  });

  it("não reverte unidades que já saíram para o cliente", () => {
    const db = fresca();
    const p = po(db, "PO-2026-0136");
    const rec = p.receipts.find((x) => x.state === "Ativa")!;
    expect(rec.toEC).toBe(60);
    const ec = ecPorId(db, rec.ec!)!;
    const l = ec.lines.find((x) => x.sku === "LR-50")!;
    sairLinha(db, ec, l, 60, "POR");
    expect(recusa(() => reverterRececao(db, p, rec.id, "engano"))).toBe("Estas unidades já saíram para o cliente em EC-0086. Reverta a saída primeiro.");
  });

  it("passar para stock só com a Encomenda Cliente inativa", () => {
    const db = fresca();
    const p = poAlfa(db);
    const rec = p.receipts.find((x) => x.state === "Ativa")!;
    expect(recusa(() => passarParaStock(db, p, rec.id))).toBe("Só é possível com a Encomenda Cliente inativa (EC-0087 está ativa).");
    eliminarEc(db, ecPorId(db, "EC-0087")!, "contrato anulado", { contrato: true });
    passarParaStock(db, p, rec.id);
    expect(rec.released).toBe(true);
    expect(p.receipts[p.receipts.length - 1]).toMatchObject({ type: "Passagem para stock", qty: 8, toEC: 0, toStock: 8 });
    expect(recusa(() => passarParaStock(db, p, rec.id))).toBe("Nada para passar a stock.");
  });
});

describe("RULES 9 · anular o resto com motivo obrigatório; desfazer possível", () => {
  it("sem motivo recusa; com 'Outro' pede nota; anular fecha a PO e a EC perde a parte anulada", () => {
    const db = fresca();
    const p = poAlfa(db);
    const id = p.lines[0].id;
    expect(recusa(() => anularResto(db, p, [id], "", ""))).toBe("Escolha o motivo para não receber o resto.");
    expect(recusa(() => anularResto(db, p, [id], "Outro", ""))).toBe('Com motivo "Outro", escreva uma nota (mínimo 3 caracteres).');
    anularResto(db, p, [id], "Fornecedor sem produto", "");
    expect(poStatus(p)).toBe("received");
    expect(p.lines[0]).toMatchObject({ cancelled: 2, ecUnits: 8, ecRecv: 8, recv: 8 });
  });

  it("desfazer devolve a quantidade e a EC recupera o que lhe faltava", () => {
    const db = fresca();
    const p = poAlfa(db);
    anularResto(db, p, [p.lines[0].id], "Fornecedor sem produto", "");
    desfazerAnulacao(db, p, p.cancels[0].id, false);
    expect(poStatus(p)).toBe("partial");
    expect(p.lines[0]).toMatchObject({ cancelled: 0, ecUnits: 10 });
    expect(recusa(() => desfazerAnulacao(db, p, p.cancels[0].id, false))).toBe("Anulação já desfeita.");
    expect(poRem(p.lines[0])).toBe(2);
  });

  it("só se anula numa encomenda em aberto e com quantidade por receber", () => {
    const db = fresca();
    const fechada = po(db, "PO-2026-0132");
    expect(recusa(() => anularResto(db, fechada, [fechada.lines[0].id], "Fornecedor sem produto", ""))).toBe("A encomenda não está em aberto.");
    const p = poAlfa(db);
    receberLinhas(db, p, [{ lineId: p.lines[0].id, qty: 2 }], "LIS", null);
    expect(recusa(() => anularResto(db, p, [p.lines[0].id], "Fornecedor sem produto", ""))).toBe("A encomenda não está em aberto.");
  });
});

describe("RULES 10 · a publicação no portal bloqueia a encomenda", () => {
  it("publicada no portal, as linhas ficam bloqueadas até se retirar do portal (com motivo)", () => {
    const db = fresca();
    const p = po(db, "PO-2026-0144");
    enviarPo(db, p);
    expect(poLocked(p)).toBe(true);
    expect(recusa(() => editarPacksLinha(db, p, p.lines[0].id, 5))).toBe("Publicada no portal: retire-a do portal para editar.");
    expect(recusa(() => retirarDoPortal(db, p, "ab"))).toBe("Indique o motivo (mínimo 3 caracteres).");
    retirarDoPortal(db, p, "preço errado");
    expect(poLocked(p)).toBe(false);
    editarPacksLinha(db, p, p.lines[0].id, 5);
    expect(p.lines[0].packs).toBe(5);
  });

  it("editar a quantidade respeita o já recebido e o que a EC precisa", () => {
    const db = fresca();
    const p = poAlfa(db);
    retirarDoPortal(db, p, "vou corrigir");
    expect(recusa(() => editarPacksLinha(db, p, p.lines[0].id, 7))).toBe("Abaixo do já recebido/anulado (8 un): reverta a receção primeiro.");
    expect(recusa(() => editarPacksLinha(db, p, p.lines[0].id, 0))).toBe("Quantidade inteira (embalagens) ≥ 1.");
  });

  it("a data prometida pelo fornecedor só passa a entrega depois de aceite", () => {
    const db = fresca();
    const p = poAlfa(db);
    expect(p.portal).toMatchObject({ state: "confirmed", promised: "2026-10-12" });
    aceitarDataPrometida(db, p);
    expect(p).toMatchObject({ due: "2026-10-12", promiseAccepted: true });
    expect(poLate(p)).toBe(false);
  });

  it("eliminar uma PO exige motivo, não passa com receções ativas, e retira-a do portal", () => {
    const db = fresca();
    expect(recusa(() => eliminarPo(db, poAlfa(db), "ab"))).toBe("Motivo obrigatório (mínimo 3 caracteres).");
    expect(recusa(() => eliminarPo(db, poAlfa(db), "engano nosso"))).toBe("Tem receções ativas: reverta-as antes de eliminar.");
    const p = po(db, "PO-2026-0144");
    enviarPo(db, p);
    eliminarPo(db, p, "encomenda duplicada");
    expect(p.deleted).toBe(true);
    expect(p.portal.state).toBe("withdrawn");
    expect(poPorId(db, "PO-2026-0144")?.deleted).toBe(true);
  });
});
