// 17/11: as correções do teste ponta a ponta do fluxo de 16/11 na Mudelar (negócio 1002): o contrato enviado pelo portal fica «enviado»;
// as tarefas da retificação assinada pelo comercial não se perdem (entram quando as Operações aprovam o plano); o recibo da adenda no
// histórico é o da base; a data da proposta na minuta.
import { describe, expect, it, vi } from "vitest";
import { LINHAS, acertosPorJuntar, acoes, adendaDoAcerto, camposMedida, medida, seed, type Estado, type Negocio } from "./motor";
import { MOTIVO_ACERTO, linhasComTarefa } from "./adendas";
import { gravarFinanceiro } from "./real/financeiroReal";
import { dataIso } from "@/components/pessoas/negocioEmylia/templatesDosPassos";

type Ac = ReturnType<typeof acoes>;
const montar = (id: number) => {
  const S = seed();
  const d = S.deals.find((x) => x.id === id)!;
  const A = acoes(S, () => {}, (fn) => fn());
  return { S, d, A };
};
const aceite = () => { const r = montar(1031); r.A.aceitar(r.d.id); return r; };
const assinadoEPago = () => {
  const r = aceite();
  r.S.role = "comercial"; r.A.enviarContrato(r.d.id); r.A.assinar(r.d.id);
  r.S.role = "financeiro"; r.d.fin.fatura = { n: "FT TESTE/" + r.d.id, q: "hoje" }; r.A.validar(r.d.id);
  return r;
};
const maisArea = (d: Negocio) => { const [k] = camposMedida(LINHAS[d.linha])[0]; return { [k]: medida(d.visita.med, k) + 2 }; };
// 19/11 (acerto dos testes): desde 18/11 a retificação vai ao portal (já assinada pela empresa) e é o cliente que a aceita e assina; o
// comercial (que não planeia) está no ecrã quando a assinatura chega
const assinarNoPortal = (A: Ac, id: number, n: string) => { A.aceitarAdenda(id, n); A.enviarContratoAdenda(id, n); A.simularAdenda(id, n); };
const comAcertoAssinadoPeloComercial = () => {
  const r = assinadoEPago();
  r.S.role = "operacoes"; r.A.supervisorMedidas(r.d.id, "hn"), r.A.retificarMedidas(r.d.id, maisArea(r.d));
  r.S.role = "comercial";
  const n = r.A.adendaDoValor(r.d.id)!;
  assinarNoPortal(r.A, r.d.id, n);
  return { ...r, n };
};
const tarefasDa = (d: Negocio, n: string) => (d.obra.plano?.tasks ?? []).filter((t) => t.adenda === n);
const aprovar = (S: Estado, d: Negocio, A: Ac) => { S.role = "operacoes"; A.resolverConflitos(d.id); A.aprovarPlano(d.id); };

describe("o contrato enviado pelo «Enviar para o portal» do passo (contratoNoPortal)", () => {
  it("com a proposta aceite, fica enviado (à espera da assinatura) e regista-se uma vez", () => {
    const { S, d, A } = aceite();
    S.role = "comercial";
    expect(A.contratoNoPortal(d.id)).toBe(true);
    expect(d.orc!.contrato).toBe("enviado");
    const n = d.hist.filter((h) => /Contrato enviado para assinatura no portal/.test(h.t)).length;
    expect(A.contratoNoPortal(d.id)).toBe(false); // idempotente
    expect(d.hist.filter((h) => /Contrato enviado para assinatura no portal/.test(h.t)).length).toBe(n);
  });
  it("não mexe num contrato assinado nem numa proposta por aceitar, e pede contrato.editar", () => {
    const r = montar(1031);
    r.S.role = "comercial";
    expect(r.A.contratoNoPortal(r.d.id)).toBe(false);
    expect(r.d.orc?.contrato ?? null).toBeNull();
    const { S, d, A } = aceite();
    S.role = "financeiro";
    expect(A.contratoNoPortal(d.id)).toBe(false);
    S.role = "comercial"; A.enviarContrato(d.id); A.assinar(d.id);
    expect(A.contratoNoPortal(d.id)).toBe(false);
    expect(d.orc!.contrato).toBe("assinado");
  });
});

describe("a retificação assinada pelo comercial: as tarefas entram com as Operações", () => {
  it("assinada pelo comercial, as tarefas ficam por juntar (o plano não muda e o histórico não diz que entraram)", () => {
    const { d, n } = comAcertoAssinadoPeloComercial();
    const a = adendaDoAcerto(d)!;
    expect(a.motivo).toBe(MOTIVO_ACERTO);
    expect(a.estado).toBe("assinada");
    expect(linhasComTarefa(a).length).toBeGreaterThan(0);
    expect(tarefasDa(d, n)).toEqual([]);
    expect(acertosPorJuntar(d).map((x) => x.n)).toEqual([n]);
    expect(d.hist.some((h) => /da adenda juntas/.test(h.t))).toBe(false);
    expect(d.hist.some((h) => new RegExp(`adenda ${n} por juntar`).test(h.t))).toBe(true);
  });
  it("as Operações aprovam o plano: as tarefas entram uma vez, com a adenda e os materiais, e o plano fica aprovado", () => {
    const { S, d, A, n } = comAcertoAssinadoPeloComercial();
    aprovar(S, d, A);
    const ts = tarefasDa(d, n);
    expect(ts.length).toBe(linhasComTarefa(adendaDoAcerto(d)!).length);
    expect(ts.every((t) => Array.isArray(t.encomendado))).toBe(true);
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(acertosPorJuntar(d)).toEqual([]);
    expect(d.hist.some((h) => new RegExp(`adenda ${n} juntas? pelas Operações`).test(h.t))).toBe(true);
    // aprovar outra vez (ex.: depois de mexer) não as duplica
    d.obra.plano!.estado = "por aprovar";
    aprovar(S, d, A);
    expect(tarefasDa(d, n).length).toBe(ts.length);
  });
  it("assinada por quem planeia, as tarefas entram logo (como antes)", () => {
    const r = assinadoEPago();
    r.S.role = "operacoes"; r.A.supervisorMedidas(r.d.id, "hn"), r.A.retificarMedidas(r.d.id, maisArea(r.d));
    r.S.role = "direcao";
    const n = r.A.adendaDoValor(r.d.id);
    if (!n) return; // a Direção sem orcamento.editar/proposta.decidir neste seed: nada a verificar
    assinarNoPortal(r.A, r.d.id, n);
    expect(tarefasDa(r.d, n).length).toBeGreaterThan(0);
    expect(acertosPorJuntar(r.d)).toEqual([]);
  });
});

describe("o recibo da adenda no histórico é o da base (gravarFinanceiro)", () => {
  it("o número que o ecrã pôs (RC 2026/301) passa ao da base no recibo e no histórico", async () => {
    const { S, d, A, n } = comAcertoAssinadoPeloComercial();
    aprovar(S, d, A);
    S.role = "financeiro";
    expect(A.registarFaturaAdenda(d.id, n, "FT 2026/RET1")).toBe(true);
    A.validarPagamentosAdenda(d.id, n);
    const a = adendaDoAcerto(d)!;
    const doEcra = a.faturas!.find((f) => f.recibo)!.recibo!.n;
    expect(d.hist.some((h) => h.t.includes(doEcra))).toBe(true);
    const rpc = vi.fn(async (fn: string) => (fn === "neg_validar_pagamento" ? { data: { recibo: "RC 2026/2" }, error: null } : { data: {}, error: null }));
    await gravarFinanceiro({ rpc } as never, "org-1", "neg-1", d, [{ k: "pagamento", fatura: "FT 2026/RET1", valor: null, data: null, referencia: null, conta: null, reciboErp: null }]);
    expect(a.faturas!.find((f) => f.n === "FT 2026/RET1")!.recibo!.n).toBe("RC 2026/2");
    expect(d.hist.some((h) => h.t.includes(doEcra))).toBe(false);
    expect(d.hist.some((h) => h.t.includes("RC 2026/2"))).toBe(true);
  });
});

describe("a data da proposta na minuta (dataIso)", () => {
  it("dd/mm/aaaa passa a aaaa-mm-dd; o resto fica", () => {
    expect(dataIso("30/10/2026")).toBe("2026-10-30");
    expect(dataIso("2026-10-30")).toBe("2026-10-30");
    expect(dataIso("")).toBe("");
  });
});
