import { describe, expect, it } from "vitest";
import { acoes, seed } from "./motor";

// 27/11 (teste do 1029): numa organização real o aviso do pagamento validado mostrava o número provisório do ecrã («RC 2026/301»)
describe("o aviso do recibo numa organização real (27/11)", () => {
  const validarCom = (real: boolean) => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1031)!;
    const avisos: { msg: string; sub?: string }[] = [];
    const A = acoes(S, (a) => { avisos.push(a as { msg: string; sub?: string }); }, (fn) => fn(), real ? { abrir: () => {} } : undefined);
    A.aceitar(d.id);
    S.role = "comercial"; A.enviarContrato(d.id); A.assinar(d.id);
    S.role = "financeiro"; d.fin.fatura = { n: "FT TESTE/" + d.id, q: "hoje" }; A.validar(d.id);
    return avisos.map((a) => a.msg);
  };
  it("no protótipo, o número do recibo", () => {
    expect(validarCom(false).some((m) => /^Recibo RC 2026\/\d+ emitido$/.test(m))).toBe(true);
  });
  it("numa organização real, sem o número provisório", () => {
    const M = validarCom(true);
    expect(M).toContain("Recibo emitido");
    expect(M.some((m) => /RC 2026\//.test(m))).toBe(false);
  });
});
