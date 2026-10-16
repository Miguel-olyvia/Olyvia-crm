// A viatura ligada a uma obra e o transporte por fases (16/10): liga-se sempre, carrega-se só com a obra pronta, carregar move armazém → carrinha,
// entregar move carrinha → obra (saída da EC), desligar não deixa stock perdido e a ligação aparece na ficha da obra.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acoes, seed } from "../motor";
import { FINANCEIRO, emFalta, type Grupo } from "../campos";
import { esquecerInventario, executar as executarInv, lerInventario } from "../inventario/loja";
import { enviarPo } from "../inventario/po";
import { receberLinhas } from "../inventario/receber";
import { qtyAt } from "../inventario/stock";
import { esquecerFrota, executar as executarFrota, lerFrota } from "./loja";
import { obrasDoEstado } from "./pontes";
import { carregarFase, desligarObra, entregarFase, fasesTransporte, faltaParaCarregar, ligacoesObra, ligarObra } from "./transporteObra";
import { ViaturasObra } from "./ViaturasObra";

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
/** 1027 (Tiago Almeida) pago: a EC está no Inventário, com móveis a encomendar ao fornecedor; o plano por aprovar. */
function obraPaga() {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  preencher(d, FINANCEIRO); A.emitir(d.id); A.validar(d.id);
  const o = () => obrasDoEstado(S).find((x) => x.id === 1027)!;
  return { S, A, d, o };
}
const carrinha = () => lerFrota().viaturas.find((v) => v.armazem && v.armazemId)!;
/** Aprova e recebe todas as encomendas a fornecedor da EC (o que falta chega ao armazém). */
function receberTudo() {
  const r = executarInv((db) => {
    for (const p of db.pos.filter((x) => x.originKey === "CT 2026/1027")) {
      enviarPo(db, p);
      receberLinhas(db, p, p.lines.map((l) => ({ lineId: l.id, qty: l.packs })), "LIS", null);
    }
  });
  expect(r.erro).toBe("");
}

beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerFrota(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("viatura ligada a uma obra e transporte por fases", () => {
  it("liga-se com a obra por preparar, mas não se carrega (diz o que falta)", () => {
    const { o } = obraPaga();
    const v = carrinha();
    expect(executarFrota((F) => ligarObra(F, v.id, 1027)).ok).toBe(true);
    expect(ligacoesObra(lerFrota(), 1027).map((x) => x.vid)).toEqual([v.id]);
    const falta = faltaParaCarregar(lerInventario(), o());
    expect(falta.join(" ")).toMatch(/receber no armazém/);
    expect(falta.join(" ")).toMatch(/aprovar o plano/);
    const f = fasesTransporte(lerInventario(), o())[0];
    const r = executarInv((db) => carregarFase(db, o(), v, f.fase));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não está pronta/);
  });

  it("obra pronta: carregar move armazém → carrinha; entregar move carrinha → obra; desligar não perde stock", () => {
    const { A, o } = obraPaga();
    const v = carrinha();
    executarFrota((F) => ligarObra(F, v.id, 1027));
    receberTudo();
    A.aprovarPlano(1027);
    expect(faltaParaCarregar(lerInventario(), o())).toEqual([]);
    const fases = fasesTransporte(lerInventario(), o());
    expect(fases.length).toBeGreaterThan(0);
    const f = fases[0], l = f.linhas[0];
    const lis0 = qtyAt(lerInventario(), l.sku, "LIS"), van0 = qtyAt(lerInventario(), l.sku, v.armazemId!);
    expect(executarInv((db) => carregarFase(db, o(), v, f.fase)).erro).toBe("");
    expect(qtyAt(lerInventario(), l.sku, "LIS")).toBe(lis0 - l.qty);
    expect(qtyAt(lerInventario(), l.sku, v.armazemId!)).toBe(van0 + l.qty);
    expect(fasesTransporte(lerInventario(), o())[0].estado).toBe("na carrinha");
    // a carregar a fase seguinte, a primeira (já a bordo) não conta como falta
    expect(faltaParaCarregar(lerInventario(), o())).toEqual([]);
    // com material da obra na carrinha não se desliga (não fica stock perdido)
    const des = executarFrota((F) => desligarObra(F, lerInventario(), v.id, o()));
    expect(des.ok).toBe(false);
    expect(ligacoesObra(lerFrota(), 1027)).toHaveLength(1);
    // entregar na obra: sai da carrinha (saída da EC)
    expect(executarInv((db) => entregarFase(db, o(), f.fase)).erro).toBe("");
    expect(qtyAt(lerInventario(), l.sku, v.armazemId!)).toBe(van0);
    const e = lerInventario().ecs.find((x) => x.id === "EC-1027")!;
    expect(e.lines.find((x) => x.id === l.lineId)!.served).toBe(l.qty);
    expect(fasesTransporte(lerInventario(), o())[0].estado).toBe("entregue");
    // já sem nada a bordo, desliga-se
    expect(executarFrota((F) => desligarObra(F, lerInventario(), v.id, o())).ok).toBe(true);
    expect(ligacoesObra(lerFrota(), 1027)).toHaveLength(0);
  });

  it("a ligação aparece na ficha da obra, com o estado de cada fase", () => {
    const { d } = obraPaga();
    const v = carrinha();
    executarFrota((F) => ligarObra(F, v.id, 1027));
    render(<ViaturasObra obra={1027} ec={d.obra.ec?.ref} estado={d.obra.plano?.estado} />);
    expect(screen.getByRole("group", { name: "Viatura ligada à obra" })).toHaveTextContent(v.mat);
    expect(screen.getByRole("list", { name: "Transporte por fases" })).toHaveTextContent(/por carregar/);
  });
});
