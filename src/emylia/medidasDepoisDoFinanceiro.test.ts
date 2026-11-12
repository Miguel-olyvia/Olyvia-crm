// 12/11 (Rúben: «a validação das medidas das obras e a validação do plano da obra só vêm depois do Financeiro»). Aceite a proposta, o
// negócio passa a Financeiro (fatura e pagamento). Validado o pagamento, na Obra: as medidas e o plano (ao mesmo tempo); com os dois, o
// contrato; assinado, a encomenda de cliente. Se as medidas ou o plano mudarem o valor, uma adenda (o acerto) depois do contrato.
// Lidos da base, os aceites que ficaram no Negócio (do fluxo de 10/11) passam a Financeiro.
import { describe, expect, it } from "vitest";
import { LINHAS, acertarFaseDasMedidas, acertoDoValorPendente, acoes, adendaDoAcerto, camposMedida, impactoDasMedidas, impactoDoPlano, medida, medidasRetificadas, minhas, mudancasDeValor, proximo, seed, type Estado, type Negocio } from "./motor";
import { LINHA_ACERTO_PLANO, MOTIVO_ACERTO, linhasComTarefa, totalAdenda } from "./adendas";
import { faltaParaArrancar, passosPreparacao, semEncomendaCliente } from "./preparacaoObra";

const aceite = () => {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1031)!; // proposta enviada, por aceitar
  const A = acoes(S, () => {}, (fn) => fn());
  A.aceitar(d.id);
  return { S, d, A };
};
const pagar = (S: Estado, d: Negocio, A: ReturnType<typeof acoes>) => {
  S.role = "financeiro";
  d.fin.fatura = { n: "FT TESTE/" + d.id, q: "hoje" };
  A.validar(d.id);
};
const pago = () => { const r = aceite(); pagar(r.S, r.d, r.A); return r; };
const medidasEPlano = (S: Estado, d: Negocio, A: ReturnType<typeof acoes>, med?: Record<string, number>) => {
  S.role = "operacoes";
  A.retificarMedidas(d.id, med);
  A.resolverConflitos(d.id);
  A.aprovarPlano(d.id);
};
const assinar = (S: Estado, d: Negocio, A: ReturnType<typeof acoes>) => {
  S.role = "comercial";
  A.enviarContrato(d.id);
  A.assinar(d.id);
};

describe("as medidas e o plano depois do Financeiro (12/11)", () => {
  it("aceite, passa logo a Financeiro: o próximo passo é a fatura; as medidas e o plano esperam", () => {
    const { S, d } = aceite();
    expect(d.fase).toBe(4);
    expect(proximo(d, S).t).toMatch(/fatura/i);
    expect(d.obra.plano?.estado).toBe("por aprovar");
    const P = passosPreparacao(d, S);
    expect(P.find((x) => x.id === "ret")?.estado).toBe("espera");
    expect(P.find((x) => x.id === "pl-ok")?.estado).toBe("espera");
    expect(P.find((x) => x.id === "ct")?.estado).toBe("espera");
    expect(faltaParaArrancar(d)[0]).toMatch(/fatura|pagamento/);
    expect(semEncomendaCliente(d)).toMatch(/pagamento validado, das medidas/);
  });
  it("antes do pagamento, as Operações não aceitam as medidas nem aprovam o plano, e o contrato não se gera", () => {
    const { S, d, A } = aceite();
    medidasEPlano(S, d, A);
    expect(d.f.retif_aceite).toBeFalsy();
    expect(d.obra.plano?.estado).toBe("por aprovar");
    S.role = "comercial";
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBeFalsy();
    // no Hoje das Operações não aparecem antes do pagamento
    expect(minhas(S, "operacoes").filter((x) => x.d.id === d.id)).toEqual([]);
  });
  it("pago, passa à Obra: as medidas e o plano aparecem ao mesmo tempo no Hoje das Operações", () => {
    const { S, d } = pago();
    expect(d.fase).toBe(5);
    expect(d.obra.ec).toBeFalsy(); // a encomenda espera pelo plano e pelo contrato
    const acts = minhas(S, "operacoes").filter((x) => x.d.id === d.id).map((x) => x.p.act);
    expect(acts).toEqual(expect.arrayContaining(["abrirRetificacao", "aprovarPlano"]));
    expect(faltaParaArrancar(d)[0]).toBe("retificar as medidas");
  });
  it("o plano aprova-se sem esperar pelas medidas; o contrato espera pelas duas", () => {
    const { S, d, A } = pago();
    S.role = "operacoes";
    A.resolverConflitos(d.id);
    A.aprovarPlano(d.id);
    expect(d.obra.plano?.estado).toBe("aprovado");
    S.role = "comercial";
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBeFalsy();
  });
  it("medidas mudadas com o plano já aprovado: o plano volta a por aprovar e diz porquê", () => {
    const { S, d, A } = pago();
    S.role = "operacoes";
    A.resolverConflitos(d.id);
    A.aprovarPlano(d.id);
    const [k] = camposMedida(LINHAS[d.linha])[0];
    A.retificarMedidas(d.id, { [k]: medida(d.visita.med, k) + 2 });
    expect(d.obra.plano?.estado).toBe("por aprovar");
    expect(d.hist.some((l) => /Plano volta a por aprovar: as medidas mudaram/.test(l.t))).toBe(true);
  });
  it("com as medidas e o plano, o contrato; assinado, sai a encomenda de cliente (sem acerto)", () => {
    const { S, d, A } = pago();
    medidasEPlano(S, d, A);
    expect(proximo(d, S)).toMatchObject({ act: "enviarContrato", who: "comercial" });
    assinar(S, d, A);
    expect(d.orc!.contrato).toBe("assinado");
    expect(d.obra.ec).toBeTruthy();
    expect(d.fase).toBe(5);
    expect(acertoDoValorPendente(d)).toBe(false);
    expect(passosPreparacao(d, S).some((x) => x.id === "ac")).toBe(false);
  });
  it("a venda direta aceite passa logo ao Financeiro", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1030)!;
    acoes(S, () => {}, (fn) => fn()).aceitar(d.id);
    expect(d.fase).toBe(4);
  });
});

describe("o valor mudou: o acerto numa adenda (12/11)", () => {
  const comMedidaMaior = () => {
    const r = pago();
    const [k] = camposMedida(LINHAS[r.d.linha])[0];
    medidasEPlano(r.S, r.d, r.A, { [k]: medida(r.d.visita.med, k) + 2 });
    return r;
  };
  it("o contrato gera-se com o valor da proposta; assinado, o comercial tem «preparar a adenda» e o arranque espera", () => {
    const { S, d, A } = comMedidaMaior();
    expect(mudancasDeValor(d)[0]).toMatch(/→/);
    assinar(S, d, A);
    expect(d.orc!.contrato).toBe("assinado");
    expect(acertoDoValorPendente(d)).toBe(true);
    expect(minhas(S, "comercial").filter((x) => x.d.id === d.id).map((x) => x.p.act)).toContain("adendaDoValor");
    expect(faltaParaArrancar(d)).toContain("decidir o acerto do valor (a adenda)");
  });
  it("«Preparar a adenda»: em rascunho, com o serviço a mais ao preço da proposta; a proposta e o contrato ficam", () => {
    const { S, d, A } = comMedidaMaior();
    assinar(S, d, A);
    const v0 = d.orc!.versoes?.length ?? 0;
    expect(A.adendaDoValor(d.id)).toBeTruthy();
    const a = adendaDoAcerto(d)!;
    expect(a.estado).toBe("rascunho");
    expect(a.motivo).toBe(MOTIVO_ACERTO);
    const svc = a.linhas.find((x) => !x.livre)!;
    expect(svc).toBeTruthy();
    const naProposta = d.orc!.linhas.find((l) => l.t === "svc" && l.sid === svc.sid);
    expect(naProposta?.t === "svc" ? naProposta.pu : NaN).toBe(svc.pu);
    expect(d.orc!.versoes?.length ?? 0).toBe(v0);
    expect(d.orc!.contrato).toBe("assinado");
    expect(acertoDoValorPendente(d)).toBe(false);
    expect(faltaParaArrancar(d)).not.toContain("decidir o acerto do valor (a adenda)");
    expect(passosPreparacao(d, S).find((x) => x.id === "ac")).toMatchObject({ estado: "feito" });
  });
  it("o total da adenda é o que as medidas mudam no orçamento (o número que o comercial vê)", () => {
    const { S, d, A } = comMedidaMaior();
    const mi = impactoDasMedidas(d, S, medidasRetificadas(d))!;
    assinar(S, d, A);
    A.adendaDoValor(d.id);
    const a = adendaDoAcerto(d)!;
    expect(totalAdenda(a.linhas, a.desconto)).toBeCloseTo(mi.medidas, 0);
  });
  it("as horas a mais do plano entram como valor, sem nova tarefa ao assinar a adenda", () => {
    const { S, d, A } = pago();
    S.role = "operacoes";
    const ti = d.obra.plano!.tasks.findIndex((t) => t.svcs[0] && S.svc[t.svcs[0]]?.h > 0);
    A.ajustarTarefa(d.id, ti, { h: d.obra.plano!.tasks[ti].h + 4 });
    medidasEPlano(S, d, A);
    expect(impactoDoPlano(d, S).horas).toBeCloseTo(4, 1);
    assinar(S, d, A);
    A.adendaDoValor(d.id);
    const a = adendaDoAcerto(d)!;
    expect(a.linhas.some((x) => x.n === LINHA_ACERTO_PLANO)).toBe(true);
    expect(linhasComTarefa(a).some((x) => x.n === LINHA_ACERTO_PLANO)).toBe(false);
  });
  it("«Seguir sem adenda» fica registado e o negócio segue", () => {
    const { S, d, A } = comMedidaMaior();
    assinar(S, d, A);
    A.semAdendaDoValor(d.id);
    expect(d.f.acerto_valor).toBe("sem adenda");
    expect(acertoDoValorPendente(d)).toBe(false);
    expect(d.hist.some((l) => /Sem adenda do acerto/.test(l.t))).toBe(true);
  });
  it("só quem edita o orçamento prepara a adenda", () => {
    const { S, d, A } = comMedidaMaior();
    assinar(S, d, A);
    S.role = "operacoes";
    expect(A.adendaDoValor(d.id)).toBeNull();
    expect(acertoDoValorPendente(d)).toBe(true);
  });
});

describe("a fase lida da base (acertarFaseDasMedidas)", () => {
  it("aceite no Negócio (do fluxo de 10/11) passa ao Financeiro", () => {
    const { d } = aceite();
    d.fase = 3;
    expect(acertarFaseDasMedidas(d)).toBe(true);
    expect(d.fase).toBe(4);
  });
  it("com as medidas e o plano já feitos no Negócio também passa (o contrato vem depois do pagamento)", () => {
    const { d } = aceite();
    d.fase = 3; d.f.retif_aceite = "2026-11-10"; d.obra.plano!.estado = "aprovado";
    expect(acertarFaseDasMedidas(d)).toBe(true);
    expect(d.fase).toBe(4);
  });
  it("no Financeiro não mexe; por aceitar também não", () => {
    const { d } = aceite();
    expect(acertarFaseDasMedidas(d)).toBe(false);
    expect(d.fase).toBe(4);
    const e = seed().deals.find((x) => x.id === 1031)!;
    expect(acertarFaseDasMedidas(e)).toBe(false);
  });
});

describe("o impacto no orçamento, ao vivo (11/11)", () => {
  it("as medidas: sem mudança, nada; com mais área, sobe", () => {
    const { S, d } = pago();
    const [k] = camposMedida(LINHAS[d.linha])[0];
    const antes = medida(d.visita.med, k);
    expect(impactoDasMedidas(d, S, { [k]: antes })?.medidas).toBe(0);
    const imp = impactoDasMedidas(d, S, { [k]: antes + 2 })!;
    expect(imp.medidas).toBeGreaterThan(0);
    expect(imp.dif).toBeCloseTo(imp.medidas + imp.acertos, 1);
  });
  it("o plano: horas a mais, ao preço por hora do serviço", () => {
    const { S, d, A } = pago();
    S.role = "operacoes";
    const ti = d.obra.plano!.tasks.findIndex((t) => t.svcs[0] && S.svc[t.svcs[0]]?.h > 0);
    A.ajustarTarefa(d.id, ti, { h: d.obra.plano!.tasks[ti].h + 4 });
    const i = impactoDoPlano(d, S);
    expect(i.horas).toBeCloseTo(4, 1);
    expect(i.valor).toBeGreaterThan(0);
  });
});
