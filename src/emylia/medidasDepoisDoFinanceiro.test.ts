// 16/11 (o fluxo em vigor; antes, 12/11): proposta assinada → contrato gerado e assinado (a venda direta fica só com a proposta) →
// o Financeiro: a fatura e o pagamento validado → na Obra, as medidas e o plano (ao mesmo tempo) → se a retificação mudar o valor, volta ao
// Financeiro: a fatura da retificação (a adenda do acerto, sem o cliente assinar) paga e validada, ou, se baixar, a nota de crédito →
// a encomenda de cliente e a obra. A venda direta também espera pelo pagamento para as medidas e pelo plano para a encomenda.
// Lidos da base, os aceites que ficaram no Negócio (do fluxo de 10/11) passam a Financeiro.
import { describe, expect, it } from "vitest";
import {
  LINHAS, acertarFaseDasMedidas, acertoDoValorPendente, acoes, adendaDoAcerto, camposMedida, difDoAcerto, impactoDasMedidas, impactoDoPlano,
  medida, medidasEPlanoAbertos, medidasRetificadas, minhas, mudancasDeValor, proximo, retificacaoPorPagar, seed, type Estado, type Negocio,
} from "./motor";
import { LINHA_ACERTO_PLANO, MOTIVO_ACERTO, faturasAdenda, linhasComTarefa, primeiraPaga, totalAdenda } from "./adendas";
import { faltaParaArrancar, passosPreparacao } from "./preparacaoObra";

type Ac = ReturnType<typeof acoes>;
const montar = (id: number) => {
  const S = seed();
  const d = S.deals.find((x) => x.id === id)!;
  const A = acoes(S, () => {}, (fn) => fn());
  return { S, d, A };
};
const aceite = () => { const r = montar(1031); r.A.aceitar(r.d.id); return r; }; // proposta enviada, por aceitar
const assinar = (S: Estado, d: Negocio, A: Ac) => { S.role = "comercial"; A.enviarContrato(d.id); A.assinar(d.id); };
const pagar = (S: Estado, d: Negocio, A: Ac) => {
  S.role = "financeiro";
  d.fin.fatura = { n: "FT TESTE/" + d.id, q: "hoje" };
  A.validar(d.id);
};
const assinadoEPago = () => { const r = aceite(); assinar(r.S, r.d, r.A); pagar(r.S, r.d, r.A); return r; };
const medidas = (S: Estado, d: Negocio, A: Ac, med?: Record<string, number>) => { S.role = "operacoes"; A.supervisorMedidas(d.id, "hn"), A.retificarMedidas(d.id, med); };
const aprovar = (S: Estado, d: Negocio, A: Ac) => { S.role = "operacoes"; A.resolverConflitos(d.id); A.aprovarPlano(d.id); };
const maisArea = (d: Negocio) => { const [k] = camposMedida(LINHAS[d.linha])[0]; return { [k]: medida(d.visita.med, k) + 2 }; };
const menosArea = (d: Negocio) => { const [k] = camposMedida(LINHAS[d.linha])[0]; return { [k]: Math.max(0.5, medida(d.visita.med, k) - 1) }; };

describe("o contrato antes do pagamento (16/11)", () => {
  it("aceite, passa a Financeiro mas o próximo passo é gerar o contrato (do comercial); as medidas e o plano esperam", () => {
    const { S, d } = aceite();
    expect(d.fase).toBe(4);
    expect(proximo(d, S)).toMatchObject({ act: "enviarContrato", who: "comercial" });
    const P = passosPreparacao(d, S);
    expect(P.find((x) => x.id === "ct")?.estado).toBe("agora");
    expect(P.find((x) => x.id === "ret")?.estado).toBe("espera");
    expect(P.find((x) => x.id === "pl-ok")?.estado).toBe("espera");
  });
  it("o Financeiro não regista a fatura antes de o contrato estar assinado", () => {
    const { S, d, A } = aceite();
    S.role = "financeiro";
    A.registarFaturaErp(d.id, "FT 2026/9");
    expect(d.fin.fatura).toBeFalsy();
  });
  it("o contrato gera-se e assina-se antes do pagamento; assinado, o próximo passo é a fatura (do Financeiro)", () => {
    const { S, d, A } = aceite();
    assinar(S, d, A);
    expect(d.orc!.contrato).toBe("assinado");
    expect(d.fin.pago).toBe(false);
    expect(proximo(d, S).t).toMatch(/fatura/i);
    expect(proximo(d, S).who).toBe("financeiro");
  });
  it("antes do pagamento, as Operações não aceitam as medidas nem aprovam o plano", () => {
    const { S, d, A } = aceite();
    assinar(S, d, A);
    medidas(S, d, A);
    aprovar(S, d, A);
    expect(d.f.retif_aceite).toBeFalsy();
    expect(d.obra.plano?.estado).toBe("por aprovar");
    expect(minhas(S, "operacoes").filter((x) => x.d.id === d.id)).toEqual([]);
  });
  it("pago, passa à Obra: as medidas e o plano ao mesmo tempo; a encomenda espera pelo plano", () => {
    const { S, d } = assinadoEPago();
    expect(d.fase).toBe(5);
    expect(d.obra.ec).toBeFalsy();
    const acts = minhas(S, "operacoes").filter((x) => x.d.id === d.id).map((x) => x.p.act);
    // 19/11 (auditoria): primeiro as medidas (aceites no local), depois o plano
    expect(acts).toContain("abrirRetificacao");
    expect(acts).not.toContain("aprovarPlano");
    expect(faltaParaArrancar(d)[0]).toBe("retificar as medidas");
  });
  it("sem mudança de valor: com as medidas e o plano, sai a encomenda de cliente (o contrato já está assinado)", () => {
    const { S, d, A } = assinadoEPago();
    medidas(S, d, A);
    aprovar(S, d, A);
    expect(acertoDoValorPendente(d)).toBe(false);
    expect(d.obra.ec).toBeTruthy();
    expect(passosPreparacao(d, S).some((x) => x.id === "ac")).toBe(false);
  });
  it("medidas mudadas com o plano já aprovado: o plano volta a por aprovar e diz porquê", () => {
    const { S, d, A } = assinadoEPago();
    // 19/11 (auditoria): o plano só se aprova com as medidas aceites; medidas aceites de novo e mudadas, o plano volta a por aprovar
    medidas(S, d, A);
    aprovar(S, d, A);
    expect(d.obra.plano?.estado).toBe("aprovado");
    medidas(S, d, A, maisArea(d));
    expect(d.obra.plano?.estado).toBe("por aprovar");
    expect(d.hist.some((l) => /Plano volta a por aprovar: as medidas mudaram/.test(l.t))).toBe(true);
  });
});

describe("a venda direta: só a proposta, e também espera pelo pagamento (16/11)", () => {
  const vd = () => { const r = montar(1030); r.A.aceitar(r.d.id); return r; };
  it("aceite, passa ao Financeiro sem contrato: o próximo passo é a fatura", () => {
    const { S, d } = vd();
    expect(d.orc!.vendaDireta).toBe(true);
    expect(d.fase).toBe(4);
    expect(proximo(d, S).t).toMatch(/fatura/i);
    expect(passosPreparacao(d, S).some((x) => x.id === "ct")).toBe(false);
  });
  it("as medidas e o plano só depois do pagamento; a encomenda de cliente só com o plano aprovado", () => {
    const { S, d, A } = vd();
    expect(medidasEPlanoAbertos(d)).toBe(false);
    pagar(S, d, A);
    expect(medidasEPlanoAbertos(d)).toBe(true);
    expect(d.obra.ec).toBeFalsy();
    medidas(S, d, A);
    aprovar(S, d, A);
    expect(d.obra.ec).toBeTruthy();
  });
});

describe("a retificação muda o valor: volta ao Financeiro (16/11)", () => {
  const comMedidaMaior = () => { const r = assinadoEPago(); medidas(r.S, r.d, r.A, maisArea(r.d)); return r; };
  it("o valor sobe: o comercial envia a retificação ao Financeiro; o plano só se aprova depois", () => {
    const { S, d, A } = comMedidaMaior();
    expect(mudancasDeValor(d)[0]).toMatch(/→/);
    expect(acertoDoValorPendente(d)).toBe(true);
    expect(difDoAcerto(d, S)).toBeGreaterThan(0);
    expect(minhas(S, "comercial").filter((x) => x.d.id === d.id).map((x) => x.p.act)).toContain("adendaDoValor");
    aprovar(S, d, A);
    expect(d.obra.plano?.estado).toBe("por aprovar");
  });
  it("18/11 (Rúben: «a adenda não foi enviada ao cliente… não pode acontecer»): a adenda do acerto vai ao portal do cliente, já assinada pela empresa, com o serviço a mais ao preço da proposta", () => {
    const { S, d, A } = comMedidaMaior();
    S.role = "comercial";
    const v0 = d.orc!.versoes?.length ?? 0;
    expect(A.adendaDoValor(d.id)).toBeTruthy();
    const a = adendaDoAcerto(d)!;
    expect(a.estado).toBe("enviada");
    expect(a.enviada).toBeTruthy();
    expect(a.motivo).toBe(MOTIVO_ACERTO);
    expect(a.empresa?.nome).toBeTruthy();
    const svc = a.linhas.find((x) => !x.livre)!;
    const naProposta = d.orc!.linhas.find((l) => l.t === "svc" && l.sid === svc.sid);
    expect(naProposta?.t === "svc" ? naProposta.pu : NaN).toBe(svc.pu);
    expect(d.orc!.versoes?.length ?? 0).toBe(v0);
    expect(acertoDoValorPendente(d)).toBe(false);
    expect(retificacaoPorPagar(d)).toBe(true);
    // sem o cliente assinar, o Financeiro não fatura
    S.role = "financeiro";
    expect(A.registarFaturaAdenda(d.id, a.n, "FT 2026/RET0")).toBe(false);
  });
  it("a encomenda de cliente espera pela adenda assinada pelo cliente e pela fatura dela paga; só então sai", () => {
    const { S, d, A } = comMedidaMaior();
    S.role = "comercial";
    const n = A.adendaDoValor(d.id)!;
    aprovar(S, d, A);
    expect(d.obra.plano?.estado).toBe("aprovado");
    expect(d.obra.ec).toBeFalsy();
    // o cliente aceita e assina no portal
    A.aceitarAdenda(d.id, n);
    S.role = "comercial";
    A.enviarContratoAdenda(d.id, n);
    expect(adendaDoAcerto(d)!.contrato).toBe("enviado");
    A.simularAdenda(d.id, n);
    expect(adendaDoAcerto(d)!.estado).toBe("assinada");
    expect(d.obra.ec).toBeFalsy();
    S.role = "financeiro";
    expect(A.registarFaturaAdenda(d.id, n, "FT 2026/RET1")).toBe(true);
    A.validarPagamentosAdenda(d.id, n);
    const a = adendaDoAcerto(d)!;
    expect(faturasAdenda(a).length).toBeGreaterThan(0);
    expect(primeiraPaga(a)).toBe(true);
    expect(retificacaoPorPagar(d)).toBe(false);
    expect(d.obra.ec).toBeTruthy();
  });
  it("o valor baixa (raro): o Financeiro regista a nota de crédito e o negócio segue", () => {
    const r = assinadoEPago();
    const { S, d, A } = r;
    medidas(S, d, A, menosArea(d));
    expect(acertoDoValorPendente(d)).toBe(true);
    expect(difDoAcerto(d, S)).toBeLessThan(0);
    expect(passosPreparacao(d, S).find((x) => x.id === "ac")).toMatchObject({ estado: "agora", who: "financeiro" });
    S.role = "comercial";
    expect(A.registarNotaCredito(d.id, "NC 2026/1")).toBe(false); // é do Financeiro
    S.role = "financeiro";
    expect(A.registarNotaCredito(d.id, "NC 2026/1")).toBe(true);
    expect(d.f.nota_credito).toBe("NC 2026/1");
    expect(acertoDoValorPendente(d)).toBe(false);
    aprovar(S, d, A);
    expect(d.obra.ec).toBeTruthy();
  });
  it("o total da adenda é o que as medidas mudam no orçamento (o número que o comercial vê)", () => {
    const { S, d, A } = comMedidaMaior();
    const mi = impactoDasMedidas(d, S, medidasRetificadas(d))!;
    S.role = "comercial";
    A.adendaDoValor(d.id);
    const a = adendaDoAcerto(d)!;
    expect(totalAdenda(a.linhas, a.desconto)).toBeCloseTo(mi.medidas, 0);
  });
  it("as horas a mais do plano entram como valor, sem nova tarefa", () => {
    const { S, d, A } = assinadoEPago();
    S.role = "operacoes";
    const ti = d.obra.plano!.tasks.findIndex((t) => t.svcs[0] && S.svc[t.svcs[0]]?.h > 0);
    A.ajustarTarefa(d.id, ti, { h: d.obra.plano!.tasks[ti].h + 4 });
    medidas(S, d, A);
    expect(impactoDoPlano(d, S).horas).toBeCloseTo(4, 1);
    S.role = "comercial";
    A.adendaDoValor(d.id);
    const a = adendaDoAcerto(d)!;
    expect(a.linhas.some((x) => x.n === LINHA_ACERTO_PLANO)).toBe(true);
    expect(linhasComTarefa(a).some((x) => x.n === LINHA_ACERTO_PLANO)).toBe(false);
  });
  it("«Seguir sem acerto» fica registado e o negócio segue", () => {
    const { S, d, A } = comMedidaMaior();
    S.role = "comercial";
    A.semAdendaDoValor(d.id);
    expect(d.f.acerto_valor).toBe("sem adenda");
    expect(acertoDoValorPendente(d)).toBe(false);
    aprovar(S, d, A);
    expect(d.obra.ec).toBeTruthy();
  });
  it("só quem edita o orçamento e regista a decisão do cliente envia a retificação", () => {
    const { S, d, A } = comMedidaMaior();
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
    const { S, d } = assinadoEPago();
    const [k] = camposMedida(LINHAS[d.linha])[0];
    const antes = medida(d.visita.med, k);
    expect(impactoDasMedidas(d, S, { [k]: antes })?.medidas).toBe(0);
    const imp = impactoDasMedidas(d, S, { [k]: antes + 2 })!;
    expect(imp.medidas).toBeGreaterThan(0);
    expect(imp.dif).toBeCloseTo(imp.medidas + imp.acertos, 1);
  });
  it("o plano: horas a mais, ao preço por hora do serviço", () => {
    const { S, d, A } = assinadoEPago();
    S.role = "operacoes";
    const ti = d.obra.plano!.tasks.findIndex((t) => t.svcs[0] && S.svc[t.svcs[0]]?.h > 0);
    A.ajustarTarefa(d.id, ti, { h: d.obra.plano!.tasks[ti].h + 4 });
    const i = impactoDoPlano(d, S);
    expect(i.horas).toBeCloseTo(4, 1);
    expect(i.valor).toBeGreaterThan(0);
  });
});
