// 19/11/2026 (Rúben): os pagamentos pelas condições do contrato. 100%: uma vez, no início. 50-50: no início e no fim, antes da entrega.
// 50-25-25: no início, no arranque (carregar em «Arrancar a obra» manda a parcela ao Financeiro) e no fim. Em todos, sem a fatura final
// paga não há auto de receção.
import { beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario } from "./inventario/loja";
import { acoes, minhas, proximo, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { aprovarPos, receberTudo } from "./testeObra";
import { faltaParaAuto, momentoDe, parcelasDoContrato } from "./parcelas";
import { prestacoes, PAGAMENTO_50_25_25 } from "./planoObra";
import { passosPreparacao } from "./preparacaoObra";
import { financeiroDe } from "./real/financeiroReal";

const REF = "CT 2026/1027";
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
type Ac = ReturnType<typeof acoes>;
/** 1027 (contrato assinado), com as condições de pagamento dadas: a 1.ª parcela paga, as medidas e o plano aprovados, os materiais no armazém. */
function prontaAArrancar(pagamento: string) {
  esquecerInventario();
  const S = seed(), avisos: string[] = [];
  const A = acoes(S, (a) => avisos.push(`${a.msg} · ${a.sub ?? ""}`), (fn) => fn());
  const d = S.deals.find((x) => x.id === 1027)!;
  d.f.pagamento = pagamento;
  preencher(d, FINANCEIRO); preencher(d, [OBRA[0]]);
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  A.role("operacoes"); A.retificarMedidas(d.id); A.aprovarPlano(d.id);
  expect(aprovarPos(REF)).toBe("");
  expect(receberTudo(REF)).toBe("");
  return { S, A, d, avisos };
}
const concluir = (d: Negocio) => { d.obra.plano!.estado = "concluída"; };
const doFinanceiro = (S: Estado, d: Negocio) => minhas(S, "financeiro").filter((x) => x.d.id === d.id).map((x) => x.p.act);
const pagarParcela = (A: Ac, d: Negocio, t: string, n: string) => { A.role("financeiro"); expect(A.registarFaturaParcela(d.id, t, n)).toBe(true); A.validarParcela(d.id, t); };

describe("as parcelas pelas condições de pagamento", () => {
  beforeEach(() => esquecerInventario());

  it("o momento de cada parcela: 100%, 50-50 e 50-25-25", () => {
    const m = (pg: string) => prestacoes(pg).map((_, i, L) => momentoDe(L, i));
    expect(m("100% na adjudicação")).toEqual(["inicio"]);
    expect(m("50% + 50% no fim")).toEqual(["inicio", "fim"]);
    expect(m(PAGAMENTO_50_25_25)).toEqual(["inicio", "arranque", "fim"]);
    expect(prestacoes(PAGAMENTO_50_25_25).map((x) => x.p)).toEqual([0.5, 0.25, 0.25]);
  });

  it("100%: vai ao Financeiro uma vez, no início; arranca e há auto de receção sem mais faturas", () => {
    const { S, A, d } = prontaAArrancar("100% na adjudicação");
    const P = parcelasDoContrato(S, d);
    expect(P).toHaveLength(1);
    expect(P[0]).toMatchObject({ momento: "inicio", paga: true });
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
    expect(doFinanceiro(S, d)).toEqual([]);
    concluir(d);
    expect(faltaParaAuto(S, d)).toEqual([]);
    A.enviarAuto(d.id);
    expect(d.obra.auto?.estado).toBe("por assinar");
  });

  it("50-50: 50% no início; os outros 50% só no fim e, sem eles pagos, não há auto de receção", () => {
    const { S, A, d, avisos } = prontaAArrancar("50% + 50% no fim");
    expect(parcelasDoContrato(S, d).map((x) => [x.momento, x.paga, x.devida])).toEqual([["inicio", true, true], ["fim", false, false]]);
    // arranca sem ir ao Financeiro
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
    // a meio da obra ainda não é a vez da parcela final
    A.role("financeiro");
    expect(A.registarFaturaParcela(d.id, "t2", "FT 2026/901")).toBe(false);
    expect(avisos.at(-1)).toMatch(/Ainda não é a vez/);
    // no fim, antes da entrega: cai no Financeiro e o auto espera por ela
    concluir(d);
    expect(proximo(d, S)).toMatchObject({ t: "À espera da fatura final paga", who: "financeiro" });
    expect(passosPreparacao(d, S).find((x) => x.id === "ft-pr-t2")?.estado).toBe("agora");
    A.role("operacoes"); A.enviarAuto(d.id);
    expect(d.obra.auto ?? null).toBeNull();
    expect(avisos.at(-1)).toMatch(/^Ainda não há auto de receção/);
    // a fatura registada vai à base como a da 2.ª prestação (e o pagamento só depois de validado)
    A.role("financeiro");
    expect(A.registarFaturaParcela(d.id, "t2", "FT 2026/901")).toBe(true);
    expect(doFinanceiro(S, d)).toContain("validarParcela");
    const ops = financeiroDe(d);
    expect(ops).toContainEqual(expect.objectContaining({ k: "fatura", chave: "t2", numero: "FT 2026/901" }));
    expect(ops.some((o) => o.k === "pagamento" && o.fatura === "FT 2026/901")).toBe(false);
    expect(d.obra.auto ?? null).toBeNull();
    A.validarParcela(d.id, "t2");
    expect(parcelasDoContrato(S, d).every((x) => x.paga)).toBe(true);
    expect(financeiroDe(d)).toContainEqual(expect.objectContaining({ k: "pagamento", fatura: "FT 2026/901" }));
    // paga: o auto de receção (as Operações enviam-no; o Financeiro não fecha a obra)
    expect(proximo(d, S)).toMatchObject({ act: "enviarAuto", who: "operacoes" });
    A.role("operacoes"); A.enviarAuto(d.id);
    expect(d.obra.auto?.estado).toBe("por assinar");
  });

  it("50-25-25: «Arrancar a obra» manda os 25% ao Financeiro; só arranca pagos; os últimos 25% seguram o auto de receção", () => {
    const { S, A, d, avisos } = prontaAArrancar(PAGAMENTO_50_25_25);
    expect(parcelasDoContrato(S, d).map((x) => x.momento)).toEqual(["inicio", "arranque", "fim"]);
    expect(parcelasDoContrato(S, d)[1].devida).toBe(false);
    // o 1.º clique: a parcela do arranque cai no Financeiro; a obra não arranca
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(d.f.arranque_pedido).toBeTruthy();
    expect(avisos.at(-1)).toMatch(/^A parcela do arranque foi ao Financeiro/);
    expect(proximo(d, S)).toMatchObject({ t: "Faturar a parcela do arranque (25%)", who: "financeiro" });
    expect(passosPreparacao(d, S).find((x) => x.id === "go")?.estado).toBe("espera");
    // o Financeiro vê-a no Hoje
    expect(minhas(S, "financeiro").some((x) => x.d.id === d.id && /parcela do arranque/.test(x.p.t))).toBe(true);
    // carregar outra vez não arranca
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    // faturada e por pagar: continua à espera
    A.role("financeiro"); A.registarFaturaParcela(d.id, "t2", "FT 2026/902");
    A.role("operacoes"); A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    // paga e validada: arranca
    A.role("financeiro"); A.validarParcela(d.id, "t2");
    expect(passosPreparacao(d, S).find((x) => x.id === "go")?.estado).toBe("agora");
    A.role("operacoes"); A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
    // no fim: os últimos 25% antes do auto de receção
    concluir(d);
    expect(faltaParaAuto(S, d)).toEqual(["faturar e receber a parcela final (25%)"]);
    A.enviarAuto(d.id);
    expect(d.obra.auto ?? null).toBeNull();
    pagarParcela(A, d, "t3", "FT 2026/903");
    A.role("operacoes"); A.enviarAuto(d.id);
    expect(d.obra.auto?.estado).toBe("por assinar");
  });

  it("o fim da obra não envia o auto de receção com a fatura final por pagar", () => {
    const { S, A, d } = prontaAArrancar("50% + 50% no fim");
    A.arrancar(d.id);
    expect(parcelasDoContrato(S, d)[1].devida).toBe(false);
    // tarefas todas feitas: a parcela final já cai no Financeiro, antes de encerrar
    for (const t of d.obra.plano!.tasks) t.exec = { estado: "feita", horas: 1, fotos: [] };
    expect(parcelasDoContrato(S, d)[1].devida).toBe(true);
    expect(minhas(S, "financeiro").some((x) => x.d.id === d.id && x.p.act === "abrir")).toBe(true);
  });
});

describe("as adendas também antes da entrega", () => {
  it("uma adenda assinada com uma parcela por pagar segura o auto de receção", () => {
    const { S, A, d } = prontaAArrancar("100% na adjudicação");
    A.arrancar(d.id);
    concluir(d);
    d.adendas = [{ n: "AD 2026/1027-9", estado: "assinada", criada: "19/11", linhas: [{ k: "x", n: "Trabalho a mais", q: 1, preco: 100, custo: 50 }] } as unknown as NonNullable<Negocio["adendas"]>[number]];
    expect(faltaParaAuto(S, d)).toEqual(["faturar e receber a 1.ª parcela da adenda AD 2026/1027-9"]);
    A.enviarAuto(d.id);
    expect(d.obra.auto ?? null).toBeNull();
  });
});
