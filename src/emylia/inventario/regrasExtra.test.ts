// Mais regras do mockup: o percurso e as linhas de uma PO, os avisos ao preencher um movimento, as linhas de stock e os pedidos de transferência.
import { describe, expect, it } from "vitest";
import { fresca, recusa } from "./ajudaTestes";
import { cancelarPedidoTransf, eliminarLinhaStock, restaurarLinhaStock } from "./cadastros";
import { avisosLinha } from "./movimentos";
import { adicionarLinhaPo, motivoBloqueioPo, percursoPo, poPorIdObrigatoria, removerLinhaPo, retirarDoPortal } from "./po";
import type { Inventario, Po } from "./tipos";

const po = (db: Inventario, id: string): Po => poPorIdObrigatoria(db, id);

describe("Linhas e percurso de uma PO", () => {
  it("o percurso passa de rascunho a recebida e mostra o parcial", () => {
    const db = fresca();
    const nomes = (p: Po): string[] => percursoPo(p).map((x) => `${x.nome}:${x.estado}`);
    expect(nomes(po(db, "PO-2026-0143"))).toEqual(["Rascunho:atual", "Encomendada:depois", "Vista pelo fornecedor:depois", "Confirmada:depois", "Parcialmente recebida:depois", "Recebida:depois"]);
    expect(nomes(po(db, "PO-2026-0137"))).toEqual(["Criada a partir de EC-0087:feito", "Encomendada:feito", "Vista pelo fornecedor:feito", "Confirmada:feito", "Parcialmente recebida:atual", "Recebida:depois"]);
    expect(percursoPo(po(db, "PO-2026-0137"))[4].detalhe).toBe("8 de 10 un");
    expect(percursoPo(po(db, "PO-2026-0132")).every((x) => x.estado === "feito")).toBe(true);
  });

  it("as linhas só se mexem quando a encomenda o permite, e só se acrescentam artigos do fornecedor", () => {
    const db = fresca();
    const p = po(db, "PO-2026-0143");
    expect(motivoBloqueioPo(p)).toBeNull();
    expect(motivoBloqueioPo(po(db, "PO-2026-0137"))).toBe("Publicada no portal do fornecedor: linhas, fornecedor, data e estado bloqueados");
    expect(motivoBloqueioPo(po(db, "PO-2026-0132"))).toBe("Encomenda recebida: as linhas refletem o que entrou no livro");
    expect(motivoBloqueioPo(po(db, "PO-2026-0134"))).toBe("Encomenda cancelada");
    expect(recusa(() => adicionarLinhaPo(db, p, "TR-50"))).toBe("Sem artigo correspondente em Gama Elétrica. Ligue-o em Fornecedores › Artigos e preços.");
    adicionarLinhaPo(db, p, "VT-15");
    expect(p.lines.map((l) => l.sku)).toEqual(["CD-80", "VT-15"]);
    removerLinhaPo(db, p, p.lines[1].id);
    expect(p.lines).toHaveLength(1);
  });

  it("uma linha ligada a uma EC ou com receções não se remove", () => {
    const db = fresca();
    const p = po(db, "PO-2026-0137");
    expect(recusa(() => removerLinhaPo(db, p, p.lines[0].id))).toBe("Publicada no portal do fornecedor: linhas, fornecedor, data e estado bloqueados.");
    retirarDoPortal(db, p, "vou corrigir");
    expect(recusa(() => removerLinhaPo(db, p, p.lines[0].id))).toBe("Linha com receções: reverta a receção primeiro.");
    const q = po(db, "PO-2026-0141");
    retirarDoPortal(db, q, "vou corrigir");
    expect(recusa(() => removerLinhaPo(db, q, q.lines[0].id))).toBe(`Linha ligada a ${q.lines[0].ec}: a quantidade para a EC tem de ser encomendada.`);
  });
});

describe("Avisos enquanto se preenche um movimento", () => {
  const ctx = { type: "out" as const, wh: "LIS", from: "LIS" };
  it("avisa o que vai falhar, o que consome stock reservado e as saídas sem EC", () => {
    const db = fresca();
    const bc = avisosLinha(db, ctx, [{ sku: "BC-08", qty: 50 }], 0);
    expect(bc[0]).toEqual({ tom: "bad", msg: "Saída abaixo de zero: só há 1 un em Armazém Central (Lisboa). Esta linha vai falhar." });
    expect(bc[1]).toMatchObject({ tom: "warn", msg: expect.stringContaining("Saída sem EC num produto com reservas") });
    expect(avisosLinha(db, ctx, [{ sku: "PV-450", qty: 5 }], 0)[0]).toMatchObject({ tom: "warn", msg: expect.stringContaining("Consome stock reservado: livre 0, reservado 28") });
    expect(avisosLinha(db, ctx, [{ sku: "KIT-PV4", qty: 1 }], 0)).toEqual([{ tom: "bad", msg: "Pacote: registe os componentes (o pacote não tem stock)." }]);
    expect(avisosLinha(db, ctx, [{ sku: "CD-80", qty: 1 }, { sku: "CD-80", qty: 1 }], 1)).toContainEqual({ tom: "warn", msg: "Produto repetido noutra linha." });
    expect(avisosLinha(db, ctx, [{ sku: "", qty: 1 }], 0)).toEqual([]);
    expect(avisosLinha(db, { ...ctx, type: "in" }, [{ sku: "BC-08", qty: 50 }], 0)).toEqual([]);
  });
});

describe("Linhas de stock e pedidos de transferência", () => {
  it("só se elimina uma linha sem stock nem reservas, e restaura-se sem duplicar", () => {
    const db = fresca();
    const kf = db.stocks.find((s) => s.sku === "KF-10" && s.wh === "LIS")!;
    expect(recusa(() => eliminarLinhaStock(db, db.stocks.find((s) => s.sku === "CD-80")!.id))).toBe("Tem 240 un. Registe um ajuste ou transferência para zero antes de eliminar.");
    eliminarLinhaStock(db, kf.id);
    expect(kf.deleted).toBe(true);
    restaurarLinhaStock(db, kf.id);
    expect(kf.deleted).toBe(false);
  });

  it("cancelar um pedido de transferência exige motivo e só vale uma vez", () => {
    const db = fresca();
    expect(recusa(() => cancelarPedidoTransf(db, "TR-0007", "ab"))).toBe("Motivo obrigatório (mínimo 3 caracteres).");
    cancelarPedidoTransf(db, "TR-0007", "já não é preciso");
    expect(db.transfers[0]).toMatchObject({ state: "cancelled", reason: "já não é preciso" });
    expect(recusa(() => cancelarPedidoTransf(db, "TR-0007", "já não é preciso"))).toBe("Pedido já tratado.");
  });
});
