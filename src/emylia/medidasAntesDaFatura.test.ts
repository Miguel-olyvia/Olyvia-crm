// 10/11 (Rúben: «medidas antes da fatura»; «o contrato fica depois do plano aprovado e antes do pagamento»; «ajustes ao plano e às medidas:
// a proposta tem de ser recriada com um novo orçamento; depois de aprovada, saltam-se o plano e as medidas»). Aceite a proposta, o negócio
// fica no Negócio: medidas, plano, contrato; assinado, o Financeiro. A venda direta passa logo. Lidos da base, acertam a fase pela mesma regra.
import { describe, expect, it } from "vitest";
import { LINHAS, acertarFaseDasMedidas, acoes, camposMedida, medida, mudancasDeValor, proximo, seed, type Estado, type Negocio } from "./motor";
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
  it("com as medidas aceites e o plano aprovado, segue o contrato; assinado, passa ao Financeiro (sem pagamento)", () => {
    const { S, d, A } = aceitePorMedir();
    aprovar(S, d, A);
    expect(d.f.retif_aceite).toBeTruthy();
    expect(d.obra.plano?.estado).toBe("aprovado");
    expect(d.fase).toBe(3);
    expect(proximo(d, S)).toMatchObject({ act: "enviarContrato", who: "comercial" });
    d.orc!.contrato = "enviado"; A.assinar(d.id);
    expect(d.fase).toBe(4);
    expect(d.obra.plano?.estado).toBe("aprovado"); // assinar não refaz o plano aprovado
    expect(d.fin.pago).toBe(false);
    expect(proximo(d, S).t).toMatch(/fatura/i);
  });
  it("as medidas mudam o valor: refaz-se a proposta; aceite a versão nova, saltam-se as medidas e o plano", () => {
    const { S, d, A } = aceitePorMedir();
    const [k] = camposMedida(LINHAS[d.linha])[0];
    const antes = medida(d.visita.med, k), v0 = d.orc!.versoes?.length ?? 0;
    S.role = "operacoes";
    A.retificarMedidas(d.id, { [k]: antes + 2 });
    A.resolverConflitos(d.id); A.aprovarPlano(d.id);
    expect(mudancasDeValor(d)[0]).toMatch(/→/);
    expect(proximo(d, S)).toMatchObject({ act: "refazerComMudancas", who: "comercial" });
    S.role = "comercial";
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBeFalsy(); // primeiro, a proposta nova
    A.refazerComMudancas(d.id);
    expect(d.orc!.versoes?.length).toBe(v0 + 1);
    expect(d.orc!.aceite).toBeFalsy();
    expect(medida(d.visita.med, k)).toBe(antes + 2); // as medidas do local passam para o orçamento
    expect(mudancasDeValor(d)).toEqual([]);
    // o cliente aceita a versão nova: as medidas e o plano ficam feitos e segue o contrato
    d.orc!.enviada = "hoje";
    A.aceitar(d.id);
    expect(d.fase).toBe(3);
    expect(d.obra.plano?.estado).toBe("aprovado");
    expect(d.f.retif_aceite).toBeTruthy();
    expect(proximo(d, S)).toMatchObject({ act: "enviarContrato" });
  });
  it("uma tarefa a mais no plano também muda o valor", () => {
    const { S, d, A } = aceitePorMedir();
    aprovar(S, d, A);
    const sid = d.obra.plano!.tasks.find((t) => t.svcs[0])!.svcs[0];
    A.novaTarefaPlano(d.id, { sid, q: 1, fase: 1 });
    expect(mudancasDeValor(d).join(" ")).toMatch(/1 tarefa a mais/);
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
  it("no Negócio com as medidas aceites e o plano aprovado fica no Negócio (falta o contrato)", () => {
    const { d } = aceitePorMedir();
    d.f.retif_aceite = "2026-11-10"; d.obra.plano!.estado = "aprovado";
    expect(acertarFaseDasMedidas(d)).toBe(false);
    expect(d.fase).toBe(3);
  });
  it("no Negócio com o contrato assinado passa ao Financeiro", () => {
    const { d } = aceitePorMedir();
    d.orc!.contrato = "assinado";
    expect(acertarFaseDasMedidas(d)).toBe(true);
    expect(d.fase).toBe(4);
  });
});
