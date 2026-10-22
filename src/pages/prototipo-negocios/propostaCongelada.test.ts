// Fase 2 (22/10/2026): a proposta enviada congela o custo detalhado de cada linha (ofícios × €/h, equipamento, consumíveis, estrutura;
// produtos com o fornecedor); o detalhe interno e o prazo leem o congelado; o custo já não se atualiza com o Catálogo depois do envio;
// as adendas congelam o custo no envio.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { acoes, alertas, bloqueado, custoUn, oficiosDaProposta, partes, seed, tot, type Estado, type Negocio } from "./motor";
import { derivarServicos } from "./v2/custosModelo";
import { tarefasPrevistas } from "./ganttOrcamento";
import { margemAdenda } from "./adendas";
import { catalogo0 } from "./v2/catalogoModelo";
import { ligarCatalogo } from "./produtosVisita";
import { emFalta, AREA, ESCOLHAS, EXTERIOR, INTERIOR, PROPOSTA, type Grupo } from "./campos";

afterEach(() => ligarCatalogo(null));

const avisos: { msg: string; kind?: string }[] = [];
function preparar() {
  const S = seed(); S.role = "direcao";
  const A = acoes(S, (a) => { avisos.push(a); }, (fn) => fn());
  return { S, A };
}
const preencher = (d: Negocio, gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "data" ? "2026-11-02" : "1"; };
/** O Hugo Neves passa a custar 30 €/h (a retribuição mudada no RH chega à ficha do técnico) e os serviços acompanham. */
function hugoA30(S: Estado) { S.tecnicos!.find((t) => t.id === "hn")!.custoHora = 30; derivarServicos(S); }

describe("a proposta enviada congela o custo", () => {
  it("cada linha guarda os ofícios com as horas e o €/h do envio; mudar o RH depois não mexe na proposta, só nas novas", () => {
    const { S, A } = preparar();
    const d = S.deals.find((x) => x.id === 1035)!;
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    A.fecharVisita(d.id);
    preencher(d, [PROPOSTA[0]]);
    A.verificar(d.id); A.enviar(d.id);
    expect(d.orc!.enviada).toBeTruthy();
    const rev = d.orc!.linhas.find((l) => l.t === "svc" && l.sid === "revest")!;
    expect(rev.t === "svc" && rev.det).toMatchObject({ h: 0.75, mo: 13.35, oficios: [{ perfil: "ladrilhador", h: 0.75, eh: 17.8, tecnicos: ["Sérgio Faria", "Hugo Neves"] }], ajuste: 0 });
    const antes = { tot: tot(d, S), partes: partes(d, S), of: oficiosDaProposta(d, S), gantt: tarefasPrevistas(d, S).map((t) => t.custo.total) };
    // a soma das partes congeladas bate com o custo da proposta
    const P = antes.partes;
    expect(P.mo + P.eq + P.cons + P.estr + P.mat).toBeCloseTo(antes.tot.custo, 1);
    hugoA30(S);
    expect(S.svc.revest.eh).toBeCloseTo((17.8 + 30) / 2, 2); // um orçamento novo já usa o €/h novo
    expect(tot(d, S)).toEqual(antes.tot);
    expect(partes(d, S)).toEqual(antes.partes);
    expect(oficiosDaProposta(d, S)).toEqual(antes.of);
    expect(tarefasPrevistas(d, S).map((t) => t.custo.total)).toEqual(antes.gantt);
    // os alertas de margem da proposta enviada continuam com o custo dela
    expect(alertas(d, S).some((a) => /Margem abaixo/.test(a.t))).toBe(false);
  });

  it("'Atualizar o custo com o Catálogo' não muda uma proposta enviada", () => {
    const { S, A } = preparar();
    const d = S.deals.find((x) => x.id === 1031)!; // enviada a 05/10
    const i = d.orc!.linhas.findIndex((l) => l.t === "svc" && l.sid === "revest");
    const l = d.orc!.linhas[i];
    const cu = l.t === "svc" ? l.cu : 0;
    hugoA30(S);
    A.recalc(d.id, i);
    expect(l.t === "svc" && l.cu).toBe(cu);
    expect(avisos.at(-1)).toMatchObject({ kind: "bad", msg: "O custo não foi atualizado" });
  });

  it("as propostas de exemplo já enviadas vêm congeladas; a versão substituída guarda as linhas com o custo", () => {
    const { S, A } = preparar();
    const d = S.deals.find((x) => x.id === 1031)!;
    expect(d.orc!.linhas.filter((l) => l.t === "svc").every((l) => l.t === "svc" && !!l.det)).toBe(true);
    A.novaVersao(d.id, ["Baixar o preço"], "", "orcamento");
    const v1 = d.orc!.versoes![0];
    expect(v1.linhas!.find((l) => l.t === "svc" && l.sid === "revest")).toMatchObject({ det: { mo: 13.35 } });
    expect(v1.desconto).toBe(0);
  });

  it("o produto enviado guarda o fornecedor, o custo e o preço por unidade", () => {
    const { S, A } = preparar();
    const K = catalogo0();
    ligarCatalogo(() => K);
    const d = S.deals.find((x) => x.id === 1035)!;
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    A.manter(d.id, "loucas", "nao"); A.manter(d.id, "pav", "sim");
    A.produto(d.id, K.produtos.find((p) => p.n === "Sanita suspensa com estrutura")!, 1);
    A.fecharVisita(d.id);
    preencher(d, [PROPOSTA[0]]);
    A.verificar(d.id);
    if (bloqueado(d, S)) { A.pedirAprov(d.id); A.aprovar(d.id); }
    A.enviar(d.id);
    const l = d.orc!.linhas.find((x) => x.t === "mat" && x.d.includes("Sanita suspensa"))!;
    expect(l.t === "mat" && l.prod).toMatchObject({ forn: K.produtos.find((p) => p.n === "Sanita suspensa com estrutura")!.fornecedor, custoUn: 285, q: 1 });
    // a instalação que a sanita traz também fica congelada
    expect(d.orc!.linhas.find((x) => x.t === "svc" && x.sid === "s-moissusp")).toMatchObject({ det: { oficios: expect.arrayContaining([expect.objectContaining({ perfil: "canalizador", eh: 18.5 }), expect.objectContaining({ perfil: "pedreiro" })]) } });
  });
});

describe("a adenda congela o custo no envio", () => {
  it("enviada, a margem da adenda não muda com o RH; a versão nova volta ao custo de agora", () => {
    const { S, A } = preparar();
    const d = S.deals.find((x) => x.id === 1027)!;
    const n = A.criarAdenda(d.id, [{ sid: "revest", q: 10 }], "O cliente pediu")!;
    const a = d.adendas!.find((x) => x.n === n)!;
    expect(a.linhas[0].cu).toBeUndefined(); // rascunho: ao vivo
    A.verificarEnviarAdenda(d.id, n);
    expect(a.estado).toBe("enviada");
    expect(a.linhas[0].cu).toBeCloseTo(custoUn(S.svc.revest, S), 2);
    const m = margemAdenda(d, S, a);
    hugoA30(S);
    expect(margemAdenda(d, S, a)).toBe(m);
    A.novaVersaoAdenda(d.id, n, [{ sid: "revest", q: 10 }]);
    expect(a.linhas[0].cu).toBeUndefined();
    expect(margemAdenda(d, S, a)).toBeLessThan(m);
  });
});
