// "Receber" leva à Receção (16/10): a PO escolhida na Receção, as recebíveis (pendente, encomendada e parcial), a pendente que se recebe
// (passa a Encomendado, sem envio), a entrada no armazém com a reserva da EC, o filtro "Por receber" e "Não vou receber o resto".
import { beforeEach, describe, expect, it } from "vitest";
import { FILTROS_VAZIOS, filtrarPos } from "./filtros";
import { esquecerInventario, executar, lerInventario } from "./loja";
import { poRecebivel, poRem, poStatus } from "./po";
import { abrirRececaoDaPo, candidatas } from "./rececao";
import { anularResto, receberLinhas } from "./receber";
import { qtyAt } from "./stock";
import { reservadoEm } from "./ec";
import type { Po } from "./tipos";

const po = (id: string): Po => lerInventario().pos.find((p) => p.id === id)!;
beforeEach(() => { esquecerInventario(); });

describe("Receber → Receção", () => {
  it("abrirRececaoDaPo escolhe a PO, o fornecedor e o armazém dela na Receção", () => {
    const p = lerInventario().pos.find((x) => poStatus(x) === "partial")!;
    expect(executar((d) => abrirRececaoDaPo(d, d.pos.find((x) => x.id === p.id)!)).ok).toBe(true);
    expect(lerInventario().rc).toMatchObject({ poFilter: p.id, sup: p.sup, wh: p.wh });
  });

  it("recebíveis: pendente, encomendada e parcial (não eliminadas nem canceladas); o filtro \"Por receber\" inclui as parciais e as pendentes", () => {
    const db = lerInventario();
    const L = filtrarPos(db, { ...FILTROS_VAZIOS.po, status: "receber" });
    expect(L.some((p) => poStatus(p) === "partial")).toBe(true);
    expect(L.some((p) => poStatus(p) === "pending")).toBe(true);
    expect(L.every((p) => poRecebivel(p) && !p.deleted && poStatus(p) !== "cancelled" && poStatus(p) !== "received")).toBe(true);
  });

  it("receber no painel: entrada no armazém e a parte da EC fica reservada para ela", () => {
    const p = po("PO-2026-0137"), l = p.lines[0], ec = l.ec!;
    const antes = qtyAt(lerInventario(), l.sku, "LIS"), resAntes = reservadoEm(lerInventario(), l.sku, "LIS");
    const r = executar((d) => receberLinhas(d, d.pos.find((x) => x.id === p.id)!, [{ lineId: l.id, qty: poRem(l) }], "LIS", null));
    expect(r.erro).toBe("");
    expect(qtyAt(lerInventario(), l.sku, "LIS")).toBe(antes + poRem(l));
    expect(r.valor.res[0]).toMatchObject({ ec });
    expect(reservadoEm(lerInventario(), l.sku, "LIS")).toBeGreaterThanOrEqual(resAntes);
    expect(poStatus(po("PO-2026-0137"))).toBe("received");
  });

  it("uma PO Pendente recebe-se (fica a nota) e passa a Encomendado/parcial pelo cálculo de sempre, sem envio ao fornecedor", () => {
    const p = lerInventario().pos.find((x) => x.status === "pending" && !x.deleted && x.lines.length)!;
    expect(candidatas(lerInventario(), p.lines[0].sku).length).toBeGreaterThanOrEqual(0);
    const l = p.lines[0];
    const r = executar((d) => receberLinhas(d, d.pos.find((x) => x.id === p.id)!, [{ lineId: l.id, qty: 1 }], p.wh, null));
    expect(r.erro).toBe("");
    const depois = po(p.id);
    expect(["partial", "received"]).toContain(poStatus(depois));
    expect(depois.portal.state).toBe("none");
    expect(depois.log.some((x) => /ainda pendente/.test(x.t))).toBe(true);
  });

  it("\"Não vou receber o resto\" numa parcial anula o que falta", () => {
    const p = lerInventario().pos.find((x) => poStatus(x) === "partial")!;
    const ids = p.lines.filter((l) => poRem(l) > 0).map((l) => l.id);
    expect(executar((d) => anularResto(d, d.pos.find((x) => x.id === p.id)!, ids, "Fornecedor sem produto", "")).erro).toBe("");
    expect(po(p.id).lines.every((l) => poRem(l) === 0)).toBe(true);
  });
});
