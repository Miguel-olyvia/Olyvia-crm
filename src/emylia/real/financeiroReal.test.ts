// O Financeiro pelas funções do servidor (20261231999700): o que se envia (fatura antes do pagamento), o que volta ao negócio (o recibo da
// base, a chave da fatura) e que uma segunda gravação não volta a enviar o que já foi.
import { describe, expect, it, vi } from "vitest";
import type { Negocio } from "../motor";
import { financeiroDe, gravarFinanceiro, novasNoFinanceiro } from "./financeiroReal";

const ORG = "11111111-1111-4111-a111-111111111111", NEG = "22222222-2222-4222-a222-222222222222";
const neg = (o: Partial<Negocio>): Negocio => ({ f: {}, fin: { fatura: null, pago: false, recibo: null }, adendas: [], ...o } as unknown as Negocio);

describe("financeiroDe", () => {
  it("a V1: a fatura única é a 1.ª prestação ('unica'); com o pagamento validado, o pagamento (valor, data e comprovativo)", () => {
    const d = neg({ f: { valor_recebido: "1234,50", data_pag: "2026-10-28", comprovativo: "TRF 991" } as Negocio["f"],
      fin: { fatura: { n: " FAT 1/538 ", q: "28/10" }, pago: true, recibo: { n: "RC 2026/1", q: "hoje" } } });
    expect(financeiroDe(d)).toEqual([
      { k: "fatura", chave: "unica", numero: "FAT 1/538", erp: null },
      { k: "pagamento", fatura: "FAT 1/538", valor: 1234.5, data: "2026-10-28", referencia: "TRF 991", conta: null, reciboErp: null },
    ]);
  });

  it("com a leitura do Eticadata, os dados do ERP vão com a fatura e o recibo é o do ERP", () => {
    const erp = { estado: "paga", data: "2026-10-20", total: 500, pago: 500, emFalta: 0, vencimento: "2026-11-20", atcud: "A-1", nif: "123", bd: "X", lidaEm: "2026-10-28",
      recibos: [{ n: "REC 7", data: "2026-10-21", valor: 500, meio: "TRF" }] };
    const d = neg({ fin: { fatura: { n: "FAT 9", q: "20/10" }, pago: true, recibo: null, erp } as Negocio["fin"] });
    const [f, p] = financeiroDe(d);
    expect(f).toMatchObject({ k: "fatura", erp: { atcud: "A-1", total: 500 } });
    expect(p).toMatchObject({ k: "pagamento", reciboErp: "REC 7" });
  });

  it("as tranches (sem as da demonstração) e as parcelas das adendas; as faturas antes dos pagamentos", () => {
    const d = neg({
      fin: { fatura: null, pago: false, recibo: null, tranches: [
        { id: "x1", numero: "FT 1", data: "2026-10-01", valor: 100, tranche: "t1", pagamento: { data: "2026-10-02", conta: "PT50", ref: "R1" } },
        { id: "x2", numero: "FT 2", data: "2026-10-05", valor: 50, tranche: "t2" },
        { id: "demo-t3", numero: "FT 3", data: "2026-10-05", valor: 50, tranche: "t3", daDemo: true },
      ] } as Negocio["fin"],
      adendas: [{ n: "AD-1001-1", faturas: [{ n: "FT 8", q: "2026-10-09", i: 0, l: "50%", p: 0.5, v: 80, recibo: { n: "RC 2026/9", q: "x" } }] }] as unknown as Negocio["adendas"],
    });
    expect(financeiroDe(d).map((o) => (o.k === "fatura" ? `F ${o.chave} ${o.numero}` : `P ${o.fatura}`))).toEqual(
      ["F t1 FT 1", "F t2 FT 2", "F AD-1001-1#0 FT 8", "P FT 1", "P FT 8"]);
  });

  it("só o que é novo desde a última gravação", () => {
    const antes = neg({ fin: { fatura: { n: "FAT 1", q: "x" }, pago: false, recibo: null } });
    const depois = neg({ fin: { fatura: { n: "FAT 1", q: "x" }, pago: true, recibo: { n: "RC 2026/4", q: "hoje" } } });
    expect(novasNoFinanceiro(antes, depois).map((o) => o.k)).toEqual(["pagamento"]);
    expect(novasNoFinanceiro(depois, depois)).toEqual([]);
    expect(novasNoFinanceiro(null, depois).map((o) => o.k)).toEqual(["fatura", "pagamento"]);
  });
});

describe("gravarFinanceiro", () => {
  it("chama as funções pela ordem, e o recibo e a chave da base voltam ao negócio", async () => {
    const d = neg({ fin: { fatura: null, pago: false, recibo: null, tranches: [
      { id: "local-1", numero: "FT 1", data: "2026-10-01", valor: 100, tranche: "t1", pagamento: { data: "2026-10-02", conta: "PT50", ref: "R1" }, recibo: "RC 2026/LOCAL" },
    ] } as Negocio["fin"] });
    const rpc = vi.fn(async (fn: string) => fn === "neg_registar_fatura"
      ? { data: { chave: "f-t1", numero: "FT 1" }, error: null }
      : { data: { recibo: "RC 2026/12", ec: { emitida: true, nova: true } }, error: null });
    const avisos = await gravarFinanceiro({ rpc } as never, ORG, NEG, d, financeiroDe(d));
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["neg_registar_fatura", "neg_validar_pagamento"]);
    expect(rpc.mock.calls[0][1]).toEqual({ p_org: ORG, p_negocio: NEG, p_chave: "t1", p_numero: "FT 1", p_erp: null });
    expect(rpc.mock.calls[1][1]).toEqual({ p_org: ORG, p_negocio: NEG, p_fatura: "FT 1", p_valor: 100, p_data: "2026-10-02", p_referencia: "R1", p_recibo_erp: null, p_conta: "PT50" });
    expect(d.fin.tranches![0]).toMatchObject({ id: "f-t1", recibo: "RC 2026/12" });
    expect(avisos).toEqual(["A encomenda de cliente foi emitida no Inventário e o que falta foi pedido ao fornecedor."]);
  });

  it("na V1, o recibo da base substitui o do ecrã", async () => {
    const d = neg({ fin: { fatura: { n: "FAT 1", q: "x" }, pago: true, recibo: { n: "RC 2026/301", q: "hoje" } } });
    const rpc = vi.fn(async (fn: string) => ({ data: fn === "neg_validar_pagamento" ? { recibo: "RC 2026/3", ec: { emitida: true, nova: false } } : {}, error: null }));
    const avisos = await gravarFinanceiro({ rpc } as never, ORG, NEG, d, financeiroDe(d));
    expect(d.fin.recibo).toEqual({ n: "RC 2026/3", q: "hoje" });
    expect(avisos).toEqual([]);
  });

  it("um erro da base (ex.: sem contrato assinado) para e lança a mensagem; a função ausente só avisa", async () => {
    const d = neg({ fin: { fatura: { n: "FAT 1", q: "x" }, pago: true, recibo: null } });
    const recusa = vi.fn(async () => ({ data: null, error: { code: "P0001", message: "Ainda não há contrato assinado nem venda direta aceite: a fatura regista-se depois." } }));
    await expect(gravarFinanceiro({ rpc: recusa } as never, ORG, NEG, d, financeiroDe(d))).rejects.toThrow(/contrato assinado/);
    expect(recusa).toHaveBeenCalledTimes(1);
    const ausente = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "x" } }));
    expect(await gravarFinanceiro({ rpc: ausente } as never, ORG, NEG, d, financeiroDe(d))).toEqual(["O Financeiro ainda não está na base: a fatura e o pagamento ficam só neste ecrã."]);
  });
});

describe("gravarMudancas com o Financeiro (integração)", () => {
  it("a fatura e o pagamento vão antes do neg_guardar_negocio, e o JSON já leva o recibo da base; gravar outra vez não repete", async () => {
    const { seed } = await import("../motor");
    const { fotografarNegocios, gravarMudancas } = await import("./sincronizarNegocios");
    const S = seed();
    const d = structuredClone(S.deals[0]);
    d.id = 1001; d.adendas = [];
    d.fin = { fatura: null, pago: false, recibo: null };
    S.deals = [d];
    const foto = fotografarNegocios(S.deals);
    const refs = new Map([[1001, { id: NEG, entityId: "ent-1" }]]);
    const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
    const sb = { rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      if (fn === "neg_validar_pagamento") return { data: { recibo: "RC 2026/7", ec: { emitida: true, nova: true } }, error: null };
      return { data: {}, error: null };
    }) } as never;
    const IDS = { paraId: new Map<string, string>(), paraChave: new Map<string, string>() };
    S.deals[0].fin = { fatura: { n: "FAT 5", q: "28/10" }, pago: true, recibo: { n: "RC 2026/LOCAL", q: "hoje" } };
    const r = await gravarMudancas(sb, ORG, S, refs, foto, IDS);
    expect(r.erros).toEqual([]);
    expect(chamadas.map((c) => c.fn)).toEqual(["neg_registar_fatura", "neg_validar_pagamento", "neg_guardar_negocio"]);
    const negJson = (chamadas[2].args.p_linhas as { negocio: { recibo_numero: string; fatura_numero: string } }).negocio;
    expect(negJson).toMatchObject({ fatura_numero: "FAT 5", recibo_numero: "RC 2026/7" });
    expect(r.avisos.some((a) => a.includes("encomenda de cliente foi emitida"))).toBe(true);
    await gravarMudancas(sb, ORG, S, refs, foto, IDS);
    expect(chamadas).toHaveLength(3);
  });
});
