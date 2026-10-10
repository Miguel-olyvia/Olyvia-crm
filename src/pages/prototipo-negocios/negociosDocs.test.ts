import { describe, expect, it } from "vitest";
import { criarOrc, seed, tot, type Negocio } from "./motor";
import { cartoesV2, docFase, negociosPorPessoa, pessoasAntes } from "./negociosDocs";

const base = (id: number): Negocio => structuredClone(seed().deals.find((d) => d.id === id)!);

describe("negociosV2 · fase de documento", () => {
  it("fase 3 sem orçamento ou sem envio é orçamento", () => {
    const d = base(1031);
    d.orc!.enviada = null;
    expect(docFase(d)).toBe("orcamento");
    d.orc = null;
    expect(docFase(d)).toBe("orcamento");
  });
  it("enviada mas não aceite é proposta", () => {
    expect(docFase(base(1031))).toBe("proposta");
  });
  it("aceite sem contrato assinado é contrato", () => {
    const d = base(1031);
    d.orc!.aceite = "06/10";
    d.orc!.contrato = "enviado";
    expect(docFase(d)).toBe("contrato");
    d.orc!.contrato = "assinado";
    expect(docFase(d)).toBe("contrato"); // fase 3 mantém-se até o motor avançar
  });
  it("fase 4 é financeiro e fase 5 (obra) fica fora, vê-se em Operações", () => {
    expect(docFase(base(1027))).toBe("financeiro");
    expect(docFase(base(1022))).toBeNull();
    const S = seed();
    expect(cartoesV2(S).some((c) => c.negocioId === 1022)).toBe(false);
  });
  it("fase abaixo de 3 ou perdido fica fora", () => {
    for (const id of [1043, 1038, 1036]) expect(docFase(base(id))).toBeNull();
    const d = base(1031);
    d.perdido = true;
    expect(docFase(d)).toBeNull();
  });
});

describe("negociosV2 · casos de borda", () => {
  it("um negócio perdido não aparece nos cartões", () => {
    const S = seed();
    const id = cartoesV2(S)[0].negocioId;
    S.deals.find((d) => d.id === id)!.perdido = true;
    expect(cartoesV2(S).some((c) => c.negocioId === id)).toBe(false);
  });
  it("fase 3 com aceite preenchido e contrato null é contrato", () => {
    const d = base(1031);
    d.orc!.aceite = "06/10";
    d.orc!.contrato = null;
    expect(docFase(d)).toBe("contrato");
  });
  it("criar o orçamento de exemplo não cria serviços nem muda o estado", () => {
    const S = seed();
    const svcAntes = Object.keys(S.svc).sort();
    const antes = JSON.stringify(S);
    cartoesV2(S);
    const d = S.deals.find((x) => x.id === 1031)!;
    criarOrc({ ...structuredClone(d), visita: { ...structuredClone(d.visita), extra: {}, off: [] } }, S);
    expect(Object.keys(S.svc).sort()).toEqual(svcAntes);
    expect(JSON.stringify(S)).toBe(antes);
  });
  it("cada cartão tem a(s) sua(s) linha(s) de filtro; a conjunta pode ter as duas", () => {
    const cs = cartoesV2(seed());
    expect(cs.every((c) => c.linhasFiltro.length >= 1)).toBe(true);
    const conj = cs.find((c) => c.conjunta)!;
    expect(conj.linhasFiltro).toHaveLength(conj.linhas![0].rotulo === conj.linhas![1].rotulo ? 1 : 2);
  });
});

describe("negociosV2 · lista de cartões", () => {
  it("não inclui negócios com fase abaixo de 3 nem altera o estado", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    const cs = cartoesV2(S);
    expect(JSON.stringify(S)).toBe(antes);
    const fora = new Set(S.deals.filter((d) => d.fase < 3).map((d) => d.id));
    expect(cs.some((c) => fora.has(c.negocioId))).toBe(false);
    expect(cs.every((c) => c.doc !== null)).toBe(true);
  });
  it("ids são únicos e estáveis", () => {
    const a = cartoesV2(seed()).map((c) => c.id);
    expect(new Set(a).size).toBe(a.length);
    expect(cartoesV2(seed()).map((c) => c.id)).toEqual(a);
  });
  it("os extras demo existem, estão marcados e abrem o negócio da mesma pessoa", () => {
    const S = seed();
    const cs = cartoesV2(S);
    const demo = cs.filter((c) => c.demo);
    expect(demo.length).toBeGreaterThanOrEqual(2);
    for (const c of demo) expect(S.deals.find((d) => d.id === c.negocioId)!.nome).toBe(c.nome);
    expect(cs.filter((c) => !c.demo).every((c) => !c.linhas)).toBe(true);
  });
  it("uma pessoa com segundo orçamento tem 2 negócios", () => {
    const cs = cartoesV2(seed());
    const m = negociosPorPessoa(cs);
    expect(Object.values(m).some((n) => n >= 2)).toBe(true);
  });
  it("a proposta conjunta soma os dois orçamentos", () => {
    const S = seed();
    const conj = cartoesV2(S).find((c) => c.conjunta)!;
    expect(conj.doc).toBe("proposta");
    expect(conj.demo).toBe(true);
    expect(conj.linhas).toHaveLength(2);
    const soma = conj.linhas!.reduce((a, l) => a + l.valor, 0);
    expect(conj.valor).toBeCloseTo(soma, 2);
    const d = S.deals.find((x) => x.id === conj.negocioId)!;
    expect(conj.linhas![0].valor).toBeCloseTo(tot(d, S).pf, 2);
    expect(conj.valor).toBeGreaterThan(conj.linhas![0].valor);
  });
  it("conta as pessoas ainda em lead, contacto ou visita", () => {
    const S = seed();
    expect(pessoasAntes(S)).toBe(S.deals.filter((d) => !d.perdido && d.fase < 3).length);
  });
});
