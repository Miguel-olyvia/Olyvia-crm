// F3: do negócio para o Inventário real, sem rede: as páginas filtradas pela encomenda de cliente, a EC lida da base no formato do motor, a
// prontidão real no passo «À espera dos materiais», a anulação pelo servidor (financeiroReal.ts) e o motor a navegar em vez do Inventário de exemplo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acoes, proximo, seed, type Aviso, type LigacaoReal, type Negocio } from "../motor";
import { contratosDasEcs, lerProntidoes, ligacaoInventario, urlDoInventario } from "./inventarioReal";
import { financeiroDe, gravarFinanceiro, novasNoFinanceiro } from "./financeiroReal";
import { obraDaEc } from "./negocioReal";
import { faltaMateriaisReal, limparProntidoes, prontaReal, prontidaoDe, textoProntidaoReal } from "../inventario/prontidaoReal";
import { faltaParaArrancar } from "../preparacaoObra";

const sbCom = (resposta: { data: unknown; error: unknown }) => {
  const rpc = vi.fn().mockResolvedValue(resposta);
  return { sb: { rpc } as unknown as SupabaseClient, rpc };
};

describe("o Inventário real", () => {
  it("abre a encomenda de cliente, a receção filtrada pela EC e as compras dela", () => {
    expect(urlDoInventario("ec", "c-1")).toBe("/client-orders?open=c-1");
    expect(urlDoInventario("rececao", "c-1")).toBe("/receiving?ec=c-1");
    expect(urlDoInventario("compras", "c-1")).toBe("/client-orders?open=c-1");
    expect(urlDoInventario("compras", null)).toBe("/purchase-orders");
    expect(urlDoInventario("inventario", null)).toBe("/client-orders");
    const navegar = vi.fn();
    ligacaoInventario(navegar).abrir("rececao", "c-9");
    expect(navegar).toHaveBeenCalledWith("/receiving?ec=c-9");
  });
});

describe("a encomenda de cliente lida da base", () => {
  beforeEach(() => limparProntidoes());
  it("entra no motor como obra.ec (com o contrato) e as das adendas como ecsAjuste", () => {
    const o = obraDaEc({ contract_id: "c-1", order_number: "EC-2026-0003", emitida_em: "2026-10-28T10:00:00", emitida_por: "Sandra",
      adendas: [{ referencia: "AD 2026/1001-1", contract_id: "c-2", order_number: "EC-2026-0004", emitida_em: "2026-10-29T10:00:00", emitida_por: "Sandra" }] });
    expect(o.ec).toMatchObject({ n: "EC-2026-0003", contrato: "c-1", estado: "emitida", emitida: { por: "Sandra" } });
    expect(o.ecsAjuste?.[0]).toMatchObject({ n: "EC-2026-0004", adenda: "AD 2026/1001-1", contrato: "c-2" });
    expect(obraDaEc(null)).toEqual({});
    expect(contratosDasEcs([{ obra: o } as unknown as Negocio])).toEqual(["c-1", "c-2"]);
  });
  it("a prontidão real diz o que falta e quando está pronta", async () => {
    const { sb, rpc } = sbCom({ data: [{ contract_id: "c-1", lines_ready: 1, units_in_stock_reserved: 2, units_on_po: 3, units_missing: 1, units_served: 0, units_needed: 6 }], error: null });
    await lerProntidoes(sb, "org", ["c-1", "c-1"]);
    expect(rpc).toHaveBeenCalledWith("rpc_client_order_list_readiness", { p_organization_id: "org", p_contract_ids: ["c-1"] });
    const p = prontidaoDe("c-1");
    expect(prontaReal(p)).toBe(false);
    expect(faltaMateriaisReal(p).join(" | ")).toMatch(/encomendar ao fornecedor 1 unidade.*receber no armazém 3 unidades/);
    expect(textoProntidaoReal("EC-1", p)).toBe("Encomenda de cliente EC-1: 2 unidades reservadas · 3 unidades a chegar · 1 unidade por encomendar.");
    expect(faltaMateriaisReal(undefined)[0]).toContain("a ler");
    expect(prontaReal({ ...p!, aChegar: 0, emFalta: 0 })).toBe(true);
  });
  it("«À espera dos materiais» lê a prontidão real da EC", async () => {
    const S = seed();
    const d = S.deals.find((x) => x.fin.pago && x.obra.plano)!;
    d.obra.ec = obraDaEc({ contract_id: "c-7", order_number: "EC-7", emitida_em: null, emitida_por: null }).ec!;
    await lerProntidoes(sbCom({ data: [{ contract_id: "c-7", units_in_stock_reserved: 4, units_on_po: 2, units_missing: 0, units_needed: 6 }], error: null }).sb, "org", ["c-7"]);
    expect(faltaParaArrancar(d).join(" ")).toContain("receber no armazém 2 unidades");
    await lerProntidoes(sbCom({ data: [{ contract_id: "c-7", units_in_stock_reserved: 6, units_on_po: 0, units_missing: 0, units_needed: 6 }], error: null }).sb, "org", ["c-7"]);
    expect(faltaParaArrancar(d).some((x) => /unidade/.test(x))).toBe(false);
  });
});

describe("anular o contrato pelo servidor (financeiroReal)", () => {
  it("a anulação feita no negócio vai depois das faturas e dos pagamentos, uma vez", async () => {
    const d = { fin: { fatura: null, pago: false, recibo: null }, f: {}, adendas: [], anulado: { q: "28/10", por: "Direção", motivo: "Cliente desistiu", origem: "negocio" } } as unknown as Negocio;
    expect(financeiroDe(d)).toEqual([{ k: "anular", motivo: "Cliente desistiu" }]);
    expect(novasNoFinanceiro(d, d)).toEqual([]);
    expect(financeiroDe({ ...d, anulado: { ...d.anulado!, origem: "inventario" } })).toEqual([]);
    const { sb, rpc } = sbCom({ data: { anulado: true }, error: null });
    await gravarFinanceiro(sb, "org", "neg", d, financeiroDe(d));
    expect(rpc).toHaveBeenCalledWith("neg_anular_contrato", { p_org: "org", p_negocio: "neg", p_motivo: "Cliente desistiu" });
  });
  it("com uma PO já encomendada a base recusa e a mensagem chega", async () => {
    const d = { fin: { fatura: null, pago: false, recibo: null }, f: {}, adendas: [], anulado: { q: "", por: "", motivo: "Desistiu", origem: "negocio" } } as unknown as Negocio;
    const { sb } = sbCom({ data: null, error: { code: "NE011", message: "Há encomendas a fornecedor já encomendadas (PO-1)" } });
    await expect(gravarFinanceiro(sb, "org", "neg", d, financeiroDe(d))).rejects.toThrow("já encomendadas");
  });
});

describe("o motor numa organização real", () => {
  it("não emite a EC no Inventário de exemplo e abre o Inventário real pela EC do negócio", () => {
    const S = seed();
    S.role = "direcao";
    const d = S.deals.find((x) => x.fase === 4)!;
    d.fin.fatura = d.fin.fatura ?? { n: "FT 2026/900", q: "28/10" };
    Object.assign(d.f, { conta: "Banco A · conta à ordem", data_pag: "2026-10-28", valor_recebido: "100", comprovativo: "TRF 1" });
    const avisos: Aviso[] = [];
    const real: LigacaoReal = { abrir: vi.fn() };
    const A = acoes(S, (a) => avisos.push(a), (fn) => fn(), real);
    A.validar(d.id);
    // como no 2.0: o recibo, a passagem à Obra e o plano; a EC fica para a base (ao gravar)
    expect(d.fin.pago).toBe(true);
    expect(d.fase).toBe(5);
    expect(d.obra.ec ?? null).toBeNull();
    expect(avisos.some((a) => /não foi emitida/.test(a.msg))).toBe(false);
    d.obra.ec = obraDaEc({ contract_id: "c-9", order_number: "EC-2026-0009", emitida_em: null, emitida_por: null }).ec!;
    A.abrirInv(d.id);
    expect(real.abrir).toHaveBeenCalledWith("ec", "c-9");
    A.abrirRececao(d.id);
    expect(real.abrir).toHaveBeenCalledWith("rececao", "c-9");
    A.abrirComprasObra(d.id);
    expect(real.abrir).toHaveBeenCalledWith("compras", "c-9");
    expect(S.view).not.toBe("inventario");
  });
  it("na Obra sem plano o passo é gerar o plano, e gerá-lo deixa-o por aprovar", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 5 && x.orc)!;
    d.obra.plano = null;
    expect(proximo(d, S).act).toBe("gerarPlano");
    acoes(S, () => undefined, (fn) => fn()).gerarPlano(d.id);
    expect(d.obra.plano?.estado).toBe("por aprovar");
  });
});
