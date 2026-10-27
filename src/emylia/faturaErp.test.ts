import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerInventario } from "./inventario/loja";
import { acoes, proximo, seed, type Estado } from "./motor";
import { lerFaturaErp, resumoErp, type InfoErp } from "./erpEticadata";
import { CHAVE_VERSAO } from "./versaoPrototipo";
import { definirModoReal } from "./acessosPortal";

// 26/10: a Edge Function erp-fatura (a ponte na rede da empresa), simulada
const { invocar } = vi.hoisted(() => ({ invocar: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: invocar } } }));

// 22/10: no V1, a fatura emite-se no Eticadata e regista-se aqui; a Olyvia lê no ERP se já foi paga (erpEticadata.ts)
const info = (x: Partial<InfoErp> = {}): InfoErp => ({
  estado: "por pagar", data: "2026-10-22", total: 4269.55, pago: 0, emFalta: 4269.55, vencimento: "2026-11-05", atcud: "J6H4WGK4-12",
  nif: "", recibos: [], bd: "Emp_Z004", lidaEm: "2026-10-22T10:00:00.000Z", ...x,
});
const paga = () => info({ estado: "paga", pago: 4269.55, emFalta: 0, recibos: [{ n: "REC 1100126/430", data: "2026-10-23", valor: 4269.55, meio: "Transferência" }] });
const resposta = (corpo: unknown) => vi.fn(async () => new Response(JSON.stringify(corpo), { headers: { "Content-Type": "application/json" } }));
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe("a fatura do Eticadata no V1", () => {
  let S: Estado;
  const d = () => S.deals.find((x) => x.id === 1027)!;
  beforeEach(() => { localStorage.setItem(CHAVE_VERSAO, "0"); esquecerInventario(); S = seed(); S.role = "financeiro"; });
  afterEach(() => vi.unstubAllGlobals());

  it("o passo é registar a fatura do ERP, não emitir", () => {
    expect(proximo(d(), S)).toMatchObject({ t: "Registar a fatura do ERP", act: "registarFaturaErp", who: "financeiro" });
  });

  it("registada e por pagar: o passo é verificar no ERP, com o estado lido", () => {
    acoes(S, () => {}, (fn) => fn()).registarFaturaErp(1027, " FAT 15200126/12 ", info());
    expect(d().fin.fatura).toEqual({ n: "FAT 15200126/12", q: "22/10" });
    expect(d().fin.pago).toBe(false);
    expect(proximo(d(), S)).toMatchObject({ act: "verificarErp", btn: "Verificar no ERP" });
    expect(proximo(d(), S).sub).toContain("por pagar");
  });

  it("já paga no ERP: o recibo é o do ERP e o negócio passa à Obra", () => {
    acoes(S, () => {}, (fn) => fn()).registarFaturaErp(1027, "FAT 15200126/12", paga());
    expect(d().fin.pago).toBe(true);
    expect(d().fin.recibo).toEqual({ n: "REC 1100126/430", q: "23/10" });
    expect(d().fase).toBe(5);
    expect(d().f.comprovativo).toBe("REC 1100126/430 · Transferência");
    expect(d().f.data_pag).toBe("2026-10-23");
  });

  it("verificar no ERP: enquanto está por pagar fica à espera; quando paga, avança sozinho", async () => {
    const A = acoes(S, () => {}, (fn) => fn());
    A.registarFaturaErp(1027, "FAT 15200126/12", info());
    vi.stubGlobal("fetch", resposta({ encontrada: true, ...info({ estado: "paga em parte", pago: 2000, emFalta: 2269.55 }) }));
    A.verificarErp(1027); await esperar();
    expect(d().fin.erp?.estado).toBe("paga em parte");
    expect(d().fin.pago).toBe(false);
    vi.stubGlobal("fetch", resposta({ encontrada: true, ...paga() }));
    A.verificarErp(1027); await esperar();
    expect(d().fin.pago).toBe(true);
    expect(d().fase).toBe(5);
  });

  it("23/10: registada sem confirmar (sem ligação), a verificação em segundo plano valida-a quando o ERP a dá como paga", async () => {
    const A = acoes(S, () => {}, (fn) => fn());
    A.registarFaturaErp(1027, "FAT 15200126/12", null);
    expect(d().fin.erp).toBeFalsy();
    // ainda sem ligação: fica igual, sem avisos (calado)
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } })));
    const avisos: string[] = [];
    const A2 = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
    A2.verificarErp(1027, true); await esperar();
    expect(d().fin.pago).toBe(false);
    expect(avisos).toEqual([]);
    // o PC volta à rede da empresa e o ERP já tem o recibo
    vi.stubGlobal("fetch", resposta({ encontrada: true, ...paga() }));
    A2.verificarErp(1027, true); await esperar();
    expect(d().fin.pago).toBe(true);
    expect(d().fin.recibo).toEqual({ n: "REC 1100126/430", q: "23/10" });
    expect(d().fase).toBe(5);
  });

  it("23/10: paga no ERP mas com outro NIF (número mal escrito): não se valida sozinha, nem ao registar nem em segundo plano", async () => {
    d().f.nif_fat = "123456789";
    const avisos: string[] = [];
    const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
    A.registarFaturaErp(1027, "FAT 15200126/12", { ...paga(), nif: "999999990" });
    expect(d().fin.pago).toBe(false);
    expect(avisos).toContain("O NIF da fatura no ERP não é o do negócio");
    vi.stubGlobal("fetch", resposta({ encontrada: true, ...paga(), nif: "999999990" }));
    A.verificarErp(1027, true); await esperar();
    expect(d().fin.pago).toBe(false);
    // com o NIF certo, sim
    vi.stubGlobal("fetch", resposta({ encontrada: true, ...paga(), nif: "123 456 789" }));
    A.verificarErp(1027, true); await esperar();
    expect(d().fin.pago).toBe(true);
  });

  it("sem ligação ao ERP: regista-se na mesma e o pagamento valida-se à mão, como antes", () => {
    acoes(S, () => {}, (fn) => fn()).registarFaturaErp(1027, "FAT 15200126/12", null);
    expect(d().fin.fatura?.n).toBe("FAT 15200126/12");
    expect(proximo(d(), S)).toMatchObject({ act: "validar", btn: "Validar pagamento" });
  });

  it("só o Financeiro regista", () => {
    S.role = "comercial";
    acoes(S, () => {}, (fn) => fn()).registarFaturaErp(1027, "FAT 15200126/12", info());
    expect(d().fin.fatura).toBeNull();
  });
});

describe("a leitura do ERP (lerFaturaErp)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("fora do PC da rede (a rota não existe): sem ligação", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } })));
    expect(await lerFaturaErp("FAT 1/1")).toMatchObject({ ok: false, motivo: "sem_ligacao" });
  });
  it("a fatura não existe no ERP", async () => {
    vi.stubGlobal("fetch", resposta({ encontrada: false, numero: "FAT 1/1", bd: "Emp_Z004" }));
    expect(await lerFaturaErp("FAT 1/1")).toMatchObject({ ok: false, motivo: "nao_existe" });
  });
  it("sem organização real, não pergunta à ponte", async () => {
    invocar.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } })));
    expect(await lerFaturaErp("FAT 1/1")).toMatchObject({ ok: false, motivo: "sem_ligacao" });
    expect(invocar).not.toHaveBeenCalled();
  });
  it("o resumo diz o estado, o que falta e quando vence", () => {
    expect(resumoErp(info())).toBe("por pagar · vence a 05/11 · 4269,55 € em falta");
    expect(resumoErp(paga())).toBe("paga a 23/10");
  });
});

describe("26/10: a leitura pela ponte (site publicado, ou este PC fora da rede do ERP)", () => {
  const ORG = "11111111-2222-4333-8444-555555555555";
  const foraDaRede = () => vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } })));
  beforeEach(() => { invocar.mockReset(); definirModoReal(ORG, "Mudelar"); });
  afterEach(() => { vi.unstubAllGlobals(); definirModoReal(null); });

  it("fora da rede, com organização real: pergunta à erp-fatura e lê a fatura paga", async () => {
    foraDaRede();
    invocar.mockResolvedValue({ data: { encontrada: true, ...paga() }, error: null });
    const r = await lerFaturaErp(" FAT 15200126/538 ");
    expect(invocar).toHaveBeenCalledWith("erp-fatura", { body: { organizacao_id: ORG, numero: "FAT 15200126/538" } });
    expect(r).toMatchObject({ ok: true, info: { estado: "paga", recibos: [{ n: "REC 1100126/430" }] } });
  });

  it("a fatura não existe no ERP, pela ponte", async () => {
    foraDaRede();
    invocar.mockResolvedValue({ data: { encontrada: false, numero: "FAT 1/1", bd: "Emp_B004" }, error: null });
    expect(await lerFaturaErp("FAT 1/1")).toMatchObject({ ok: false, motivo: "nao_existe", msg: expect.stringContaining("Emp_B004") });
  });

  it("a ponte ainda não configurada (ou em baixo): sem ligação, com o motivo da função", async () => {
    foraDaRede();
    const context = { json: async () => ({ erro: "A ponte do Eticadata ainda nao esta configurada." }) };
    invocar.mockResolvedValue({ data: null, error: Object.assign(new Error("503"), { context }) });
    expect(await lerFaturaErp("FAT 1/1")).toEqual({ ok: false, motivo: "sem_ligacao", msg: "A ponte do Eticadata ainda nao esta configurada." });
  });

  it("este PC na rede do ERP: lê aqui e não gasta a ponte", async () => {
    vi.stubGlobal("fetch", resposta({ encontrada: true, ...paga() }));
    expect(await lerFaturaErp("FAT 15200126/538")).toMatchObject({ ok: true });
    expect(invocar).not.toHaveBeenCalled();
  });
});
