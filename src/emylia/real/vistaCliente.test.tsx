// A vista do cliente (2/11/2026): o negócio que o portal real recebe sai sem custos e desenha-se igual ao da pré-visualização.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { PortalCliente } from "../PortalCliente";
import { totais } from "../DocsCliente";
import { aplicarRececao, aplicarResposta, caber, comEstadoReal, encomendaParaCliente, lerVista, negocioParaCliente, vistaDoCliente, type RespostaCliente, type VistaCliente } from "./vistaCliente";

afterEach(cleanup);

/** Um negócio do exemplo com a obra em curso, registos dos técnicos, um pedido de correção e custos. */
function comObra(): { S: Estado; d: Negocio } {
  const S = seed();
  const d = S.deals.find((x) => x.orc?.linhas.some((l) => l.t === "svc") && x.obra.plano?.tasks.length) ?? S.deals.find((x) => x.orc?.linhas.some((l) => l.t === "svc"))!;
  const o = d.orc!;
  o.enviada = "01/11/2026"; o.aceite = "01/11/2026"; o.contrato = "assinado"; o.vendaDireta = false; o.aprov = "ok";
  o.linhas = o.linhas.map((l) => (l.t === "svc"
    ? { ...l, cu: 12.5, det: { h: 1, oficios: [{ perfil: "canalizador", n: "Canalizador", h: 1, eh: 18, tecnicos: ["x"] }], mo: 18, eq: 1, cons: 2, taxaEstr: 3, estr: 3, ajuste: 0.5, q: "01/11/2026" } }
    : { ...l, custo: 77, prod: { forn: "Fornecedor X", custoUn: 7, precoUn: 11, q: 1 } }));
  if (!d.obra.plano) d.obra.plano = { tasks: [{ nome: "Canalização", svcs: ["canal"], dia: 0, dur: 1, sk: "Canalizador", h: 8, tec: null, fase: 2 }], estado: "em curso", dia: 0 };
  const p = d.obra.plano;
  p.estado = "em curso";
  p.avisos = [{ tec: "x", ti: 0, t: "aviso interno", q: "hoje" }];
  p.base = [];
  const t = p.tasks[0];
  t.nota = "levar o andaime";
  t.mats = [{ n: "Tubo", q: 2, un: "m", preco: 3.2, forn: "Fornecedor X", produto: "p1" }];
  t.exec = { estado: "feita", horas: 7, ch: 18, motivo: "mal acabado", fotos: ["f1"],
    envios: [
      { q: "seg", dia: 0, quem: "Hugo", k: "registo", horas: 4, ch: 18, fotos: ["a"], nota: "começou" },
      { q: "ter", dia: 1, quem: "Filipe", k: "correcao", nota: "refazer o remate" },
    ] };
  d.obra.real = { tasks: [], custoReal: 999, m: 0.3 };
  d.obra.diario = [{ q: "seg", quem: "Hugo", t: "4 h", k: "horas" }, { q: "seg", quem: "Hugo", t: "Fuga encontrada", k: "ocorrencia" }];
  d.hist.push({ t: "Margem de 18% aprovada pela Direção", q: "hoje", k: "a" }, { t: "Proposta enviada ao cliente", q: "hoje", k: "a" });
  return { S, d };
}

describe("vista do cliente: o que sai do CRM", () => {
  it("tira os custos, as horas registadas, as correções internas e o real da obra", () => {
    const { S, d } = comObra();
    const v = vistaDoCliente(d, S);
    const c = v.d;
    for (const l of c.orc!.linhas) {
      if (l.t === "svc") { expect(l.cu).toBe(0); if (l.det) { expect(l.det.oficios).toEqual([]); expect([l.det.mo, l.det.eq, l.det.cons, l.det.estr, l.det.ajuste]).toEqual([0, 0, 0, 0, 0]); } }
      else { expect(l.custo).toBe(0); expect(l.prod?.forn).toBeUndefined(); expect(l.prod?.custoUn ?? 0).toBe(0); }
    }
    expect(c.orc!.aprov).toBeNull();
    expect(c.obra.real).toBeNull();
    const t = c.obra.plano!.tasks[0];
    expect(t.nota).toBeUndefined();
    expect(t.mats).toEqual([{ n: "Tubo", q: 2, un: "m" }]);
    expect(t.exec!.horas).toBe(0);
    expect(t.exec!.motivo).toBeUndefined();
    expect(t.exec!.envios!.map((e) => e.k)).toEqual(["registo"]);
    expect(t.exec!.envios![0].horas).toBeUndefined();
    expect(c.obra.plano!.avisos).toBeUndefined();
    expect(c.obra.diario!.map((e) => e.k)).toEqual(["ocorrencia"]);
    expect(c.hist.some((e) => /margem/i.test(e.t))).toBe(false);
    expect(c.hist.some((e) => e.t === "Proposta enviada ao cliente")).toBe(true);
    for (const s of Object.values(v.svc)) expect([s.eh, s.eq, s.cons]).toEqual([0, 0, 0]);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/Fornecedor X|levar o andaime|mal acabado|refazer o remate|aviso interno|"custoReal":999/);
  });

  it("não mexe no negócio do CRM", () => {
    const { S, d } = comObra();
    vistaDoCliente(d, S);
    expect(d.obra.real?.custoReal).toBe(999);
    expect(d.obra.plano!.tasks[0].exec!.horas).toBe(7);
  });

  it("os preços que o cliente vê são os mesmos depois de limpos", () => {
    const { S, d } = comObra();
    const v = lerVista({ vista: JSON.parse(JSON.stringify(vistaDoCliente(d, S))) })!;
    const S2 = seed(); S2.svc = v.svc as Estado["svc"]; S2.deals = [v.d];
    expect(totais(v.d, S2).total).toBeCloseTo(totais(d, S).total, 2);
  });

  it("lerVista recusa o que não é uma vista desta versão", () => {
    expect(lerVista(null)).toBeNull();
    expect(lerVista({ vista: { v: 99, d: {} } })).toBeNull();
    expect(lerVista({ vista: { v: 1 } })).toBeNull();
  });

  it("com fotografias pesadas, a vista cabe no limite da base", () => {
    const { S, d } = comObra();
    const grande = "x".repeat(1_000_000);
    d.obra.plano!.tasks[0].exec!.fotos = Array(4).fill(grande);
    d.obra.diario!.push({ q: "ter", quem: "Hugo", t: "foto", k: "foto", fotos: Array(4).fill(grande) });
    const v = caber(vistaDoCliente(d, S));
    expect(JSON.stringify(v).length).toBeLessThanOrEqual(5_500_000);
  });
});

describe("vista do cliente: o estado real por cima", () => {
  const base = (): Negocio => { const { d } = comObra(); const o = d.orc!; o.aceite = null; o.contrato = null; d.perdido = false; return d; };
  it("proposta aceite no portal: passa a esperar o contrato", () => {
    const d = comEstadoReal(base(), "accepted", null);
    expect(d.orc!.aceite).toBeTruthy();
    expect(d.orc!.contrato).toBeNull();
  });
  it("contrato enviado para assinar e depois assinado", () => {
    expect(comEstadoReal(comEstadoReal(base(), "accepted", null), "accepted", "pending_signature").orc!.contrato).toBe("enviado");
    expect(comEstadoReal(base(), "accepted", "signed").orc!.contrato).toBe("assinado");
  });
  it("proposta recusada", () => {
    const d = comEstadoReal(base(), "rejected", null);
    expect(d.perdido).toBe(true);
    expect(d.orc!.recusada).toBeTruthy();
  });
});

describe("respostas do cliente aplicadas com as ações da V1 (CRM e portal)", () => {
  const resp = (o: Partial<RespostaCliente>): RespostaCliente => ({ id: "r1", negocio: "u", tipo: "pagamento", ref: "", nome: "Ana", telemovel: null, em: "2026-11-21T10:30:00Z", assinatura: null, dados: {}, ...o });
  const comAdendaSimples = (estado: string, contrato?: string) => {
    const S = seed();
    const d = S.deals.find((x) => x.orc)!;
    d.adendas = [{ n: "A1", estado, criada: "01/11", enviada: "02/11", contrato: contrato ?? null, linhas: [] } as unknown as NonNullable<Negocio["adendas"]>[number]];
    return { S, d, A: acoes(S, vi.fn(), (fn) => fn()) };
  };
  it("aceitar, pedir alterações e não aceitar a adenda", () => {
    let x = comAdendaSimples("enviada");
    expect(aplicarResposta(x.d, x.A, resp({ tipo: "adenda_aceitar", ref: "A1" }))).toBe(true);
    expect(x.d.adendas![0].estado).toBe("aceite");
    x = comAdendaSimples("enviada");
    aplicarResposta(x.d, x.A, resp({ tipo: "adenda_alterar", ref: "A1", dados: { nota: "mais barato", motivos: ["Baixar o preço"] } }));
    expect(x.d.adendas![0].pedidoCliente?.motivos).toEqual(["Baixar o preço"]);
    x = comAdendaSimples("enviada");
    aplicarResposta(x.d, x.A, resp({ tipo: "adenda_recusar", ref: "A1", dados: { motivo: "caro" } }));
    expect(x.d.adendas![0].estado).toBe("recusada");
  });
  it("assinar o contrato da adenda fica com a assinatura por SMS", () => {
    const x = comAdendaSimples("aceite", "enviado");
    aplicarResposta(x.d, x.A, resp({ tipo: "adenda_assinar", ref: "A1", assinatura: "SMS-123", telemovel: "+351 ••• 676" }));
    expect(x.d.adendas![0].assinatura?.tipo).toBe("sms");
  });
  it("o aviso de pagamento de uma prestação fica no comprovativo do negócio (o Financeiro vê-o)", () => {
    const S = seed(); const d = S.deals.find((x) => x.orc)!; d.fin.fatura = null;
    aplicarResposta(d, acoes(S, vi.fn(), (fn) => fn()), resp({ tipo: "pagamento", ref: "FT 2026/10", dados: { referencia: "TRF 123" } }));
    expect(d.f.comprovativo).toBe("Fatura FT 2026/10: TRF 123");
  });
  it("a encomenda vai para o cliente sem fornecedores nem ids internos", () => {
    const po = { id: "PO-9", forn: "Fornecedor X", estado: "x", fase: "encomendada" as never, prometida: null, uuid: "u", prevista: "2026-11-30" };
    const r = encomendaParaCliente({ id: "EC-1", eliminada: false, estado: "open" as never, rotulo: "", ajustes: [], pronta: false,
      tot: { linhas: 1, servidas: 0, prontas: 0, aBordo: 0, aFornecedor: 1, semForn: 0 }, pos: [po],
      linhas: [{ ec: "EC-1", id: "l", sku: "s", n: "Tubo", q: 1, un: "m", st: "open" as never, rotulo: "", aBordo: false, saida: 0, pronto: 0, aChegar: 1, semForn: 0, pos: [po] }] });
    expect(JSON.stringify(r)).not.toMatch(/Fornecedor X|PO-9|"uuid"/);
    expect(r!.linhas[0].pos[0].fase).toBe("encomendada");
  });
});

describe("portal real com o ecrã da V1", () => {
  function montar(v: VistaCliente, real: Partial<Parameters<typeof PortalCliente>[0]["real"]> = {}) {
    const S = seed(); S.svc = v.svc as Estado["svc"]; S.deals = [v.d];
    const A = acoes(S, vi.fn(), (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    const abrirProposta = vi.fn(), abrirContrato = vi.fn();
    const receberObra = vi.fn((reservas: string | undefined) => <p>RECEBER-SMS {reservas ?? "tudo bem"}</p>);
    const assinarComSms = vi.fn((o: { fim: string; ref: string }) => <p>SMS {o.fim} {o.ref}</p>);
    const avisarPagamento = vi.fn(async () => {});
    render(<PortalCliente ctx={ctx} d={v.d} fechar={() => {}} real={{ abrirProposta, abrirContrato, conversa: <p>CONVERSA-REAL</p>, receberObra, assinarComSms, avisarPagamento, avisados: [], ...real }} />);
    return { abrirProposta, abrirContrato, receberObra, assinarComSms, avisarPagamento, A };
  }

  /** Uma adenda enviada ao cliente (a proposta por responder), com uma linha do Catálogo e custos (que não podem ir). */
  function comAdenda(): { S: Estado; d: Negocio } {
    const { S, d } = comObra();
    const sid = Object.keys(S.svc)[0];
    d.adendas = [{ n: "A1", estado: "enviada", criada: "01/11/2026", enviada: "02/11/2026", motivo: "Pedido do cliente",
      linhas: [{ sid, n: S.svc[sid].n, un: S.svc[sid].un, q: 2, pu: 50, h: 1, perfil: S.svc[sid].perfil, cu: 30, mo: 20 }] } as unknown as NonNullable<Negocio["adendas"]>[number]];
    return { S, d };
  }

  it("adenda por responder: aceitar pede o código por SMS (não a confirmação simulada)", () => {
    const { S, d } = comAdenda();
    const v = vistaDoCliente(d, S);
    expect(JSON.stringify(v.d.adendas)).not.toMatch(/"cu"|"mo"/);
    const { assinarComSms } = montar(v);
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Aceitar a adenda" }));
    expect(assinarComSms).toHaveBeenCalled();
    expect(screen.getByText("SMS adenda_aceitar A1")).toBeTruthy();
  });

  it("fatura por pagar: «Já paguei» avisa com a referência; depois de avisado, diz que recebemos", () => {
    const { S, d } = comObra();
    d.fin.tranches = [{ id: "f2-t2", numero: "FT 2026/10", data: "2026-11-20", valor: 100, tranche: "t2" }];
    const v = vistaDoCliente(d, S);
    const { avisarPagamento } = montar(v);
    fireEvent.change(screen.getByRole("textbox", { name: "Referência do pagamento" }), { target: { value: "TRF 123" } });
    fireEvent.click(screen.getByRole("button", { name: "Já paguei" }));
    expect(avisarPagamento).toHaveBeenCalledWith("FT 2026/10", "TRF 123");
    cleanup();
    montar(v, { avisados: ["FT 2026/10"] });
    expect(screen.getByText(/Recebemos o seu aviso/)).toBeTruthy();
  });

  it("as faturas das prestações: a paga com o recibo, a por pagar com o cartão, e cada uma abre o documento", () => {
    const { S, d } = comObra();
    const total = totais(d, S).total;
    d.fin.tranches = [
      { id: "f1-t1", numero: "FT 2026/9", data: "2026-11-01", valor: Math.round(total * 0.5 * 100) / 100, tranche: "t1", pagamento: { data: "2026-11-02", conta: "PT50", ref: "x" }, recibo: "RC 2026/3" },
      { id: "f2-t2", numero: "FT 2026/10", data: "2026-11-20", valor: Math.round(total * 0.5 * 100) / 100, tranche: "t2" },
    ];
    montar(vistaDoCliente(d, S));
    expect(screen.getByText("Pagar a fatura FT 2026/10")).toBeTruthy();
    expect(screen.queryByText("Pagar a fatura FT 2026/9")).toBeNull();
    const docs = screen.getByRole("region", { name: "Documentos" });
    fireEvent.click(within(docs).getByRole("button", { name: /Fatura FT 2026\/9 · .* · paga \(recibo RC 2026\/3\)/ }));
    expect(document.body.textContent).toMatch(/Paga · RC 2026\/3/);
  });

  it("obra concluída: escolhe como encontrou a obra e assina o auto com o código por SMS (não simulado)", () => {
    const { S, d } = comObra();
    d.obra.plano!.estado = "concluída";
    d.obra.auto = { n: "AR 2026/7", q: "20/11/2026", estado: "por assinar" };
    const { receberObra } = montar(vistaDoCliente(d, S));
    expect(screen.getByRole("heading", { name: "Receber o serviço" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tenho uma observação" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "falta um rodapé" } });
    fireEvent.click(screen.getByRole("button", { name: /Assinar o auto de receção/ }));
    expect(receberObra).toHaveBeenCalled();
    expect(screen.getByText("RECEBER-SMS falta um rodapé")).toBeTruthy();
    expect(screen.queryByText(/Chave Móvel Digital/)).toBeNull();
  });

  it("auto assinado no portal: o relatório final da obra", () => {
    const { S, d } = comObra();
    d.obra.plano!.estado = "concluída";
    d.obra.auto = { n: "AR 2026/7", q: "20/11/2026", estado: "por assinar" };
    const v = vistaDoCliente(d, S);
    expect(aplicarRececao(v.d, { auto: "AR 2026/7", reservas: null, nome: "Ana", telemovel: "+351 ••• 676", em: "2026-11-21T10:30:00Z", id: "SMS-abc" })).toBe(true);
    expect(v.d.obra.auto!.estado).toBe("assinado");
    expect(v.d.obra.auto!.assinatura?.tipo).toBe("sms");
    montar(v);
    expect(screen.getByRole("heading", { name: "O relatório da sua obra" })).toBeTruthy();
  });

  it("a receção de outro auto não mexe neste", () => {
    const { d } = comObra();
    d.obra.auto = { n: "AR 2026/7", q: "20/11/2026", estado: "por assinar" };
    expect(aplicarRececao(d, { auto: "AR 2026/8", reservas: null, nome: "Ana", telemovel: null, em: "2026-11-21T10:30:00Z", id: "x" })).toBe(false);
    expect(d.obra.auto.estado).toBe("por assinar");
  });

  it("obra em curso: o plano fase a fase, a conversa da base e sem dados bancários de exemplo", () => {
    const { S, d } = comObra();
    d.fin.fatura = { n: "FT 2026/1", q: "01/11/2026" }; d.fin.pago = false;
    montar(vistaDoCliente(d, S));
    expect(screen.getByRole("heading", { name: "O plano, fase a fase" })).toBeTruthy();
    expect(screen.getByText("CONVERSA-REAL")).toBeTruthy();
    expect(screen.getByText("Pagar a fatura FT 2026/1")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Dados de exemplo|PT50 0035|Como quer pagar/);
  });

  it("proposta por responder: o botão abre a proposta real", () => {
    const { S, d } = comObra();
    const o = d.orc!; o.aceite = null; o.contrato = null;
    const { abrirProposta } = montar(vistaDoCliente(d, S));
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Responder à proposta" }));
    expect(abrirProposta).toHaveBeenCalledTimes(1);
  });

  it("contrato por assinar: o botão abre o contrato real, sem a assinatura simulada", () => {
    const { S, d } = comObra();
    d.orc!.contrato = "enviado";
    const { abrirContrato } = montar(vistaDoCliente(d, S));
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: /Assinar o contrato/ }));
    expect(abrirContrato).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Chave Móvel Digital/)).toBeNull();
  });
});
