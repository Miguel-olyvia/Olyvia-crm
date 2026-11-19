// 19/11/2026 (auditoria, ponto 4): «Seguir sem adenda» só pedia orcamento.editar: o comercial deixava a obra maior pelo preço antigo, sem
// ninguém ver a margem. Agora calcula-se a margem do orçamento refeito com as medidas novas (contra o preço aceite) e, abaixo do mínimo
// da organização, como no envio da proposta, é a Direção que decide. Fica registado quem decidiu.
import { describe, expect, it } from "vitest";
import { LINHAS, PAPEIS, acertoDoValorPendente, acoes, camposMedida, margemSemAdenda, medida, minhas, seed, tot, type Estado, type Negocio } from "./motor";
import { passosPreparacao } from "./preparacaoObra";

/** O 1031 com o contrato assinado e pago; as medidas retificadas com mais área: o valor sobe (o acerto por decidir). */
function comAcerto(min?: number): { S: Estado; d: Negocio; A: ReturnType<typeof acoes> } {
  const S = seed(), d = S.deals.find((x) => x.id === 1031)!;
  const A = acoes(S, () => {}, (fn) => fn());
  A.aceitar(d.id); S.role = "comercial"; A.enviarContrato(d.id); A.assinar(d.id);
  S.role = "financeiro"; d.fin.fatura = { n: "FT TESTE/1031", q: "hoje" }; A.validar(d.id);
  const [k] = camposMedida(LINHAS[d.linha])[0];
  S.role = "operacoes"; A.supervisorMedidas(d.id, "hn"), A.retificarMedidas(d.id, { [k]: medida(d.visita.med, k) + 2 });
  if (min != null) S.cfg.min = min;
  return { S, d, A };
}

describe("a margem de seguir sem adenda", () => {
  it("é a do preço aceite contra o custo do orçamento refeito com as medidas novas (mais trabalho, menos margem)", () => {
    const { S, d } = comAcerto();
    const M = margemSemAdenda(d, S)!;
    expect(M.pf).toBeCloseTo(d.orc!.totalAceite!.pf, 2);
    expect(M.m).toBeLessThan(tot(d, S).m);
    expect(M.custo).toBeGreaterThan(tot(d, S).custo);
  });
});

describe("«Seguir sem adenda» com a margem abaixo do mínimo pede a Direção", () => {
  it("o comercial não segue: fica pedida a aprovação, no Hoje da Direção", () => {
    const { S, d, A } = comAcerto(95);
    expect(margemSemAdenda(d, S)!.abaixo).toBe(true);
    S.role = "comercial";
    expect(A.semAdendaDoValor(d.id)).toBe(false);
    expect(d.f.acerto_valor).toBeUndefined();
    expect(acertoDoValorPendente(d)).toBe(true);
    expect(d.f.acerto_sem_adenda_aprov).toBe("pedida");
    expect(d.hist[0].t).toMatch(/pedida aprovação à Direção .*margem .* mínimo 95%/);
    expect(passosPreparacao(d, S).find((x) => x.id === "ac")).toMatchObject({ who: "direcao", act: "aprovarSemAdenda", estado: "agora" });
    expect(minhas(S, "direcao").some((x) => x.d === d && x.p.act === "aprovarSemAdenda")).toBe(true);
    // carregar outra vez não repete o pedido
    const n = d.hist.length;
    A.semAdendaDoValor(d.id);
    expect(d.hist.length).toBe(n);
  });

  it("a Direção aprova: segue sem adenda, com quem decidiu registado", () => {
    const { S, d, A } = comAcerto(95);
    S.role = "comercial"; A.semAdendaDoValor(d.id);
    S.role = "comercial";
    expect(A.aprovarSemAdenda(d.id)).toBe(false); // não é da Direção
    S.role = "direcao";
    expect(A.aprovarSemAdenda(d.id)).toBe(true);
    expect(d.f).toMatchObject({ acerto_valor: "sem adenda", acerto_sem_adenda_aprov: "ok", acerto_sem_adenda_por: PAPEIS.direcao.n });
    expect(acertoDoValorPendente(d)).toBe(false);
    expect(d.hist[0].t).toMatch(/aprovado pela Direção/);
    expect(passosPreparacao(d, S).find((x) => x.id === "ac")?.t).toMatch(/aprovado por/);
  });

  it("a Direção recusa: o pedido sai e o acerto continua por decidir", () => {
    const { S, d, A } = comAcerto(95);
    S.role = "comercial"; A.semAdendaDoValor(d.id);
    S.role = "direcao";
    expect(A.recusarSemAdenda(d.id)).toBe(true);
    expect(d.f.acerto_sem_adenda_aprov).toBeUndefined();
    expect(acertoDoValorPendente(d)).toBe(true);
    expect(passosPreparacao(d, S).find((x) => x.id === "ac")?.who).toBe("comercial");
  });

  it("com a margem acima do mínimo, o comercial segue logo e fica registado", () => {
    const { S, d, A } = comAcerto(0);
    S.role = "comercial";
    expect(A.semAdendaDoValor(d.id)).toBe(true);
    expect(d.f).toMatchObject({ acerto_valor: "sem adenda", acerto_sem_adenda_por: PAPEIS.comercial.n });
    expect(d.f.acerto_sem_adenda_aprov).toBeUndefined();
  });
});
