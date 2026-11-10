// 10/11 (Rúben: «medidas antes da fatura»): aceite a proposta, o negócio fica no Negócio; o supervisor retifica as medidas e as Operações
// aprovam o plano; só então passa ao Financeiro. A venda direta passa logo. Os negócios lidos da base acertam a fase pela mesma regra.
import { describe, expect, it } from "vitest";
import { acertarFaseDasMedidas, acoes, proximo, seed, type Estado, type Negocio } from "./motor";
import { faltaParaArrancar, semEncomendaCliente } from "./preparacaoObra";

const aceitePorMedir = () => {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1031)!; // proposta enviada, por aceitar
  const A = acoes(S, () => {}, (fn) => fn());
  A.aceitar(d.id);
  return { S, d, A };
};

const aprovar = (S: Estado, d: Negocio, A: ReturnType<typeof acoes>) => {
  S.role = "operacoes";
  A.retificarMedidas(d.id);
  A.resolverConflitos(d.id);
  A.aprovarPlano(d.id);
};

describe("medidas antes da fatura (10/11)", () => {
  it("aceite, fica no Negócio com o plano por aprovar; o próximo passo são as medidas", () => {
    const { S, d } = aceitePorMedir();
    expect(d.fase).toBe(3);
    expect(d.obra.plano?.estado).toBe("por aprovar");
    expect(proximo(d, S).t).toMatch(/medidas/i);
    expect(semEncomendaCliente(d)).toMatch(/medidas aceites/);
    expect(faltaParaArrancar(d)[0]).toBe("retificar as medidas");
  });
  it("o plano não se aprova sem as medidas", () => {
    const { S, d, A } = aceitePorMedir();
    S.role = "operacoes";
    A.aprovarPlano(d.id);
    expect(d.obra.plano?.estado).toBe("por aprovar");
    expect(d.fase).toBe(3);
  });
  it("com as medidas aceites e o plano aprovado, passa ao Financeiro (sem pagamento)", () => {
    const { S, d, A } = aceitePorMedir();
    aprovar(S, d, A);
    expect(d.f.retif_aceite).toBeTruthy();
    expect(d.obra.plano?.estado).toBe("aprovado");
    expect(d.fin.pago).toBe(false);
    expect(d.fase).toBe(4);
    expect(proximo(d, S).t).toMatch(/fatura/i);
  });
  it("o contrato não se gera antes do plano aprovado", () => {
    const { S, d, A } = aceitePorMedir();
    S.role = "comercial";
    A.enviarContrato(d.id);
    expect(d.orc?.contrato).toBeFalsy();
  });
  it("a venda direta aceite passa logo ao Financeiro", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1030)!;
    acoes(S, () => {}, (fn) => fn()).aceitar(d.id);
    expect(d.fase).toBe(4);
  });
});

describe("a fase lida da base (acertarFaseDasMedidas)", () => {
  it("aceite no Financeiro sem fatura nem medidas volta ao Negócio", () => {
    const { d } = aceitePorMedir();
    d.fase = 4;
    expect(acertarFaseDasMedidas(d)).toBe(true);
    expect(d.fase).toBe(3);
  });
  it("já faturado fica no Financeiro", () => {
    const { d } = aceitePorMedir();
    d.fase = 4; d.fin.fatura = { n: "FT 1", q: "hoje" };
    expect(acertarFaseDasMedidas(d)).toBe(false);
    expect(d.fase).toBe(4);
  });
  it("no Negócio com as medidas aceites e o plano aprovado passa ao Financeiro", () => {
    const { d } = aceitePorMedir();
    d.f.retif_aceite = "2026-11-10"; d.obra.plano!.estado = "aprovado";
    expect(acertarFaseDasMedidas(d)).toBe(true);
    expect(d.fase).toBe(4);
  });
});
