import { describe, expect, it } from "vitest";
import { acoes, minhas, seed } from "./motor";
import { adendaBloqueada, diasAdenda, migrarAdenda, parcelasAdenda, totaisAdenda, totaisLinhas, totalAdenda, totalComIva, valorContrato, type Adenda } from "./adendas";
import { adendaPorAssinar } from "./testeAdenda";

// 1027 Tiago Almeida: contrato assinado, plano do orçamento por aprovar
const preparar = () => { const S = seed(); return { S, A: acoes(S, () => {}, (fn) => fn()), d: S.deals.find((x) => x.id === 1027)! }; };

describe("trabalhos a mais (adenda)", () => {
  it("a adenda nasce por verificar; vai ao cliente com o preço e os dias; assinada, as tarefas entram no plano na fase do serviço", () => {
    const { A, d } = preparar();
    const n0 = d.obra.plano!.tasks.length;
    A.aprovarPlano(d.id);
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    const a = d.adendas![0];
    expect(a).toMatchObject({ n: "AD 2026/1027-1", estado: "rascunho", motivo: "O cliente pediu", verif: false });
    expect(totalAdenda(a.linhas)).toBeGreaterThan(0);
    expect(totalComIva(a.linhas)).toBeCloseTo(totalAdenda(a.linhas) * 1.06, 2);
    expect(diasAdenda(a.linhas)).toBeGreaterThanOrEqual(1);
    A.assinarAdenda(d.id, a.n); // sem proposta aceite nem contrato da adenda, não se assina
    expect(a.estado).toBe("rascunho");
    expect(d.obra.plano!.tasks).toHaveLength(n0); // só entra quando o cliente assina
    adendaPorAssinar(A, d.id, a.n);
    expect(a).toMatchObject({ estado: "aceite", contrato: "enviado", verif: true });
    expect(a.enviada).toBeTruthy();
    expect(a.aceite).toBeTruthy();
    A.assinarAdenda(d.id, a.n);
    const p = d.obra.plano!;
    expect(a.estado).toBe("assinada");
    expect(p.tasks).toHaveLength(n0 + 1);
    const t = p.tasks.find((x) => /adenda AD 2026\/1027-1/.test(x.nome))!;
    expect(t.svcs).toEqual(["pint"]);
    expect(p.estado).toBe("por aprovar"); // o plano estava aprovado: volta às Operações
    // as tarefas das fases seguintes andam para a frente; as anteriores ficam
    expect(p.tasks.filter((x) => (x.fase ?? 4) > t.fase!).every((x) => x.dia >= t.dia + t.dur)).toBe(true);
  });
  it("antes do contrato não há adenda (muda-se a proposta)", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1031)!;
    A.criarAdenda(d.id, [{ sid: "pint", q: 5 }], "O cliente pediu");
    expect(d.adendas).toBeUndefined();
  });
});

describe("o IVA por taxa e as parcelas (21/10)", () => {
  it("mão de obra a 6%, os materiais das linhas livres a 23%, com o desconto nas duas partes", () => {
    const L = [
      { sid: "pint", n: "Pintura", un: "m²", q: 10, pu: 20, h: 0.3, perfil: "Pintor" },
      { sid: "livre-1", n: "Trocar o cano", un: "vg", q: 1, pu: 200, h: 6, perfil: "Canalização", livre: true as const, mats: [{ n: "Tubo", q: 2, un: "un", preco: 50 }] },
    ];
    const T = totaisLinhas(L);
    expect(T).toMatchObject({ mo: 400, mat: 100 });
    expect(T.ivaMo).toBeCloseTo(24, 6);
    expect(T.ivaMat).toBeCloseTo(23, 6);
    expect(T.total).toBeCloseTo(547, 6);
    const D = totaisLinhas(L, 10);
    expect(D.mo).toBeCloseTo(360, 6);
    expect(D.mat).toBeCloseTo(90, 6);
    expect(totalComIva(L)).toBe(547);
  });
  it("as parcelas são as do contrato (50% + 50% no fim, por omissão) e somam o total; o valor do contrato usa o IVA por taxa", () => {
    const { S, A, d } = preparar();
    A.criarAdenda(d.id, [{ sid: "pint", q: 13 }], "O cliente pediu");
    const a = d.adendas![0];
    const P = parcelasAdenda(d, a), total = Math.round(totaisAdenda(a).total * 100) / 100;
    expect(P.map((x) => x.p)).toEqual([0.5, 0.5]);
    expect(P[0].l).toBe("Na adjudicação");
    expect(Math.round((P[0].v + P[1].v) * 100) / 100).toBe(total);
    adendaPorAssinar(A, d.id, a.n);
    A.simularAdenda(d.id, a.n);
    expect(valorContrato(d, S).adendas).toBeCloseTo(total, 2);
    // com "30% + 40% + 30%" no contrato, a adenda paga-se em três
    d.f.pagamento = "30% + 40% + 30%";
    expect(parcelasAdenda(d, a).map((x) => x.p)).toEqual([0.3, 0.4, 0.3]);
  });
});

describe("a verificação antes de enviar (as regras do orçamento)", () => {
  it("com o desconto a deixar a margem abaixo do mínimo: não se envia sem a Direção; aprovada, envia", () => {
    const { S, A, d } = preparar();
    const n = A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu", { desconto: 25 })!;
    const a = d.adendas![0];
    expect(A.verificarEnviarAdenda(d.id, n)).toBe(false);
    expect(a).toMatchObject({ estado: "rascunho", verif: true });
    expect(adendaBloqueada(d, S, a)).toBe(true);
    expect(minhas(S, "comercial").find((x) => x.d === d && x.p.t === `Resolver os bloqueios da adenda ${n}`)?.p.act).toBe("pedirAprovAdenda");
    A.pedirAprovAdenda(d.id);
    expect(minhas(S, "direcao").find((x) => x.d === d)?.p).toMatchObject({ t: `Aprovar a exceção à margem da adenda ${n}`, act: "aprovarAdenda" });
    S.role = "direcao"; // 23/10: só quem pode aprovar a margem (margin.approve)
    A.aprovarAdenda(d.id);
    expect(adendaBloqueada(d, S, a)).toBe(false);
    A.enviarAdenda(d.id);
    expect(a.estado).toBe("enviada");
  });
  it("uma linha livre abaixo do custo não se aprova: corrige-se o preço", () => {
    const { S, A, d } = preparar();
    const n = A.criarAdenda(d.id, [], "Surpresa em obra", { livres: [{ n: "Trocar o cano", h: 8, preco: 100, perfil: "Canalização", mats: [] }] })!;
    A.verificarAdenda(d.id, n);
    const a = d.adendas![0];
    expect(adendaBloqueada(d, S, a)).toBe(true);
    expect(minhas(S, "comercial").find((x) => x.d === d && x.p.t.startsWith("Resolver os bloqueios"))?.p.act).toBeUndefined();
  });
});

describe("as adendas guardadas antes do percurso novo", () => {
  it("a enviada fica aceite com o contrato por assinar; a fatura única passa a ser a parcela única", () => {
    const a = { n: "AD 2026/1027-1", estado: "enviada", criada: "20/10", motivo: "x", linhas: [] } as Adenda;
    expect(migrarAdenda(a)).toBe(true);
    expect(a).toMatchObject({ estado: "aceite", contrato: "enviado", enviada: "20/10", aceite: "20/10" });
    expect(migrarAdenda(a)).toBe(false);
    const b = { n: "AD 2026/1027-2", estado: "assinada", criada: "20/10", motivo: "x", linhas: [], fatura: { n: "FT 2026/500", q: "21/10" }, recibo: { n: "RC 2026/400", q: "22/10" } } as Adenda;
    migrarAdenda(b);
    expect(b.faturas).toEqual([expect.objectContaining({ n: "FT 2026/500", i: 0, p: 1, recibo: { n: "RC 2026/400", q: "22/10" } })]);
    expect(b.fatura).toBeUndefined();
  });
});
