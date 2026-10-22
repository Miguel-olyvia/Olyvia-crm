import { describe, expect, it } from "vitest";
import { acoes, proximo, seed, tot, versaoAtual, type Negocio } from "./motor";
import { ESCOLHAS, EXTERIOR, INTERIOR, PROPOSTA, emFalta, gruposArea, type Grupo } from "./campos";

// os campos obrigatórios por preencher do exemplo (fechar a visita e enviar pedem-nos)
function preencher(d: Negocio, gs: Grupo[]) {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
}

// 1031: proposta enviada a 05/10, à espera do cliente
const preparar = () => {
  const S = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1031)!;
  preencher(d, [EXTERIOR, INTERIOR, ...gruposArea(S.campos, d.f), ESCOLHAS, PROPOSTA[0]]);
  return { S, A, d };
};

describe("a versão nova num só sítio (21/10)", () => {
  it("o cliente pede, o comercial muda o preço ali e envia num toque; refazer o orçamento mantém o desconto", () => {
    const { S, A, d } = preparar();
    A.pedirAlteracoes(d.id, "baixar uns 500 €", ["Baixar o preço"]);
    A.novaVersao(d.id, ["Baixar o preço"], "baixar uns 500 €", "orcamento");
    const o = d.orc!, v1 = o.versoes![0];
    expect(v1.totalIva).toBeGreaterThan(v1.total);
    o.desconto = 3;
    A.refazerOrcamento(d.id);
    expect(d.orc!.desconto).toBe(3);
    expect(tot(d, S).pf).toBeLessThan(v1.total);
    // com um bloqueio (a margem de uma linha do exemplo), só envia depois de aprovado
    if (!A.enviarVersao(d.id)) { d.orc!.aprov = "ok"; A.enviarVersao(d.id); }
    expect(d.orc!.enviada).toBe("hoje");
    expect(versaoAtual(d.orc!)).toBe(2);
  });
});

describe("versões da proposta", () => {
  it("só no orçamento: guarda a v1 como substituída e destranca o orçamento", () => {
    const { S, A, d } = preparar();
    const total = tot(d, S).pf;
    A.novaVersao(d.id, ["Baixar o preço"], " prefere pagar em 3 vezes ", "orcamento");
    const o = d.orc!;
    expect(o.versoes).toEqual([{ n: 1, enviada: "05/10", substituida: expect.any(String), total, totalIva: expect.any(Number), motivos: ["Baixar o preço"], nota: "prefere pagar em 3 vezes", onde: "orcamento", prod: expect.any(Array), semParte: [],
      // 22/10 (fase 2): as linhas enviadas (com o custo congelado) e o desconto
      linhas: expect.any(Array), desconto: 0 }]);
    expect(o.enviada).toBeNull();
    expect(o.verif).toBe(false);
    expect(d.fase).toBe(3);
    expect(versaoAtual(o)).toBe(2);
    expect(d.hist[0].t).toBe("Proposta v1 substituída: o cliente pediu baixar o preço, prefere pagar em 3 vezes");
    expect(proximo(d, S).t).toBe("Verificar e enviar a versão 2");
  });

  it("na visita: reabre o levantamento e, ao fechar, o orçamento refeito guarda as versões e o plano", () => {
    const { A, d } = preparar();
    d.orc!.inicioObra = "2026-11-02"; d.orc!.equipa = 2;
    A.novaVersao(d.id, ["Outros materiais"], "", "visita");
    expect(d.fase).toBe(2);
    expect(d.visita.fechada).toBe(false);
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
    expect(d.orc!.versoes?.map((v) => v.n)).toEqual([1]);
    expect(d.orc!).toMatchObject({ inicioObra: "2026-11-02", equipa: 2, enviada: null });
  });

  it("voltar à visita e desistir: o orçamento fica igual, sem pedir os campos em falta", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1031)!;
    d.orc!.enviada = null;
    const linhas = structuredClone(d.orc!.linhas);
    A.reabrirVisita(d.id);
    expect(d.fase).toBe(2);
    A.desistirVisita(d.id);
    expect(d.fase).toBe(3);
    expect(d.visita.fechada).toBe(true);
    expect(d.orc!.linhas).toEqual(linhas);
  });

  it("a v2 enviada fica no histórico com o número", () => {
    const { S, A, d } = preparar();
    A.novaVersao(d.id, ["Outras datas"], "", "orcamento");
    d.orc!.verif = true;
    S.role = "comercial";
    A.enviar(d.id);
    expect(d.orc!.enviada).toBe("hoje");
    expect(d.hist[0].t).toMatch(/^Proposta v2 enviada/);
  });

  it("não refaz uma proposta com o contrato assinado nem uma por enviar", () => {
    const { S, A } = preparar();
    const aceite = S.deals.find((x) => x.id === 1027)!;
    A.novaVersao(aceite.id, ["Baixar o preço"], "", "orcamento");
    expect(aceite.orc!.versoes).toBeUndefined();
    const d = S.deals.find((x) => x.id === 1031)!;
    A.novaVersao(d.id, ["Baixar o preço"], "", "orcamento");
    A.novaVersao(d.id, ["Baixar o preço"], "", "orcamento"); // a v2 ainda não foi enviada: não há o que substituir
    expect(d.orc!.versoes).toHaveLength(1);
  });

  it("aceite mas sem contrato assinado: faz-se a versão seguinte e o contrato enviado fica anulado", () => {
    const { A, d } = preparar();
    Object.assign(d.orc!, { aceite: "13/10", contrato: "enviado" });
    A.novaVersao(d.id, ["Outros materiais"], "", "orcamento");
    expect(d.orc!).toMatchObject({ aceite: null, contrato: null, enviada: null });
    expect(d.orc!.versoes![0]).toMatchObject({ n: 1, aceite: "13/10" });
    expect(d.hist.some((h) => h.t.includes("Contrato CT 2026/1031 anulado"))).toBe(true);
  });
});
