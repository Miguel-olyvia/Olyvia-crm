import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "./motor";
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
  it("sem contrato exigido (venda direta), a proposta aceite vai para financeiro e não para contrato; só enviada, continua proposta", () => {
    const d = base(1030);
    expect(d.orc!.vendaDireta).toBe(true);
    expect(docFase(d)).toBe("proposta");
    d.orc!.aceite = "08/10";
    expect(docFase(d)).toBe("financeiro");
    d.orc!.vendaDireta = false;
    expect(docFase(d)).toBe("contrato");
  });
  it("fase 4 é financeiro e fase 5 (obra) fica fora, vê-se em Operações", () => {
    expect(docFase(base(1027))).toBe("financeiro");
    expect(docFase(base(1022))).toBeNull();
    const S = seed();
    expect(cartoesV2(S).some((c) => c.id === "neg-1022")).toBe(false);
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
  it("montar os cartões (os de exemplo incluídos) não cria serviços nem muda o estado", () => {
    const S = seed();
    const svcAntes = Object.keys(S.svc).sort();
    const antes = JSON.stringify(S);
    cartoesV2(S);
    expect(Object.keys(S.svc).sort()).toEqual(svcAntes);
    expect(JSON.stringify(S)).toBe(antes);
  });
  it("cada cartão diz a que linhas pertence (casa de banho, cozinha ou nenhuma, nos outros serviços)", () => {
    const cs = cartoesV2(seed());
    expect(cs.every((c) => c.linhasFiltro.every((l) => l === "wc" || l === "coz"))).toBe(true);
    expect(cs.find((c) => c.titulo === "Casa de banho e pintura")!.linhasFiltro).toEqual(["wc"]);
    expect(cs.find((c) => c.titulo === "Varanda fechada")!.linhasFiltro).toEqual([]);
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
  it("os exemplos existem, estão marcados e abrem o negócio da mesma pessoa", () => {
    const S = seed();
    const cs = cartoesV2(S);
    const demo = cs.filter((c) => c.demo);
    expect(demo.length).toBeGreaterThanOrEqual(2);
    for (const c of demo) expect(S.deals.find((d) => d.id === c.negocioId)!.nome).toBe(c.nome);
    expect(cs.filter((c) => !c.demo).every((c) => !c.linhas && c.orcamentos === 1)).toBe(true);
  });
  it("uma pessoa com mais de um negócio tem um cartão por negócio", () => {
    const cs = cartoesV2(seed());
    const m = negociosPorPessoa(cs);
    expect(m["Carla Nunes"]).toBe(3);
    expect(m["Sérgio Pinto"]).toBe(2);
    expect(m["Tiago Almeida"]).toBe(3);
    expect(Object.values(m).filter((n) => n >= 2).length).toBeGreaterThanOrEqual(3); // a V2 só mostra negócios a decorrer: os da Marta e da Joana em obra ficam de fora
  });
  it("um negócio com dois orçamentos é UM cartão: título, '2 orçamentos', o valor total e os orçamentos", () => {
    const S = seed();
    const c = cartoesV2(S).find((x) => x.titulo === "Varanda fechada")!;
    expect(c.doc).toBe("proposta");
    expect(c.demo).toBe(true);
    expect(c.servico).toBe("Varanda fechada · 2 orçamentos");
    expect(c.linhas).toHaveLength(2);
    expect(c.valor).toBeCloseTo(c.linhas!.reduce((a, l) => a + l.valor, 0), 2);
    expect(cartoesV2(S).filter((x) => x.nome === "Carla Nunes" && x.doc === "proposta")).toHaveLength(2);
  });
  it("conta as pessoas ainda em lead, contacto ou visita", () => {
    const S = seed();
    expect(pessoasAntes(S)).toBe(S.deals.filter((d) => !d.perdido && d.fase < 3).length);
  });
});
