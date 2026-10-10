import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { filtrarLeads, historicoDe, infoLead, itensNegocios, leadsDe, somarDias, tempoDesde } from "./leadsDocs";

const nomes = (S = seed()) => leadsDe(S).map((p) => p.nome);

describe("leads · quem é lead", () => {
  it("fora quem tem negócio em fase 4 ou 5 ou contrato assinado", () => {
    const n = nomes();
    for (const fora of ["Tiago Almeida", "Marta Lima", "Joana Ribeiro"]) expect(n).not.toContain(fora);
    for (const dentro of ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Carla Nunes", "Sérgio Pinto"]) expect(n).toContain(dentro);
    expect(n).toHaveLength(8);
  });
  it("contrato assinado tira a pessoa, mesmo na fase 3", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1031)!.orc!.contrato = "assinado";
    expect(nomes(S)).not.toContain("Carla Nunes");
  });
  it("perdidos ficam fora", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1044)!.perdido = true;
    expect(nomes(S)).not.toContain("Pedro Lopes");
  });
  it("uma pessoa com vários negócios aparece uma só vez", () => {
    const S = seed();
    const ana = S.deals.find((d) => d.id === 1043)!;
    S.deals.push({ ...structuredClone(ana), id: 2001 });
    const n = nomes(S);
    expect(n.filter((x) => x === "Ana Martins")).toHaveLength(1);
    expect(leadsDe(S).find((p) => p.nome === "Ana Martins")!.negocios).toHaveLength(2);
  });
  it("as atrasadas vêm primeiro", () => {
    expect(nomes()[0]).toBe("Pedro Lopes");
  });
});

describe("leads · filtros", () => {
  it("por contactar, com visita, atrasadas e só as minhas", () => {
    const ls = leadsDe(seed());
    const f = (filtro: string, minhas = false, q = "") => filtrarLeads(ls, filtro, minhas, q).map((p) => p.nome);
    expect(f("todas")).toHaveLength(8);
    expect(f("por_contactar").sort()).toEqual(["Ana Martins", "Pedro Lopes", "Rita Sousa"]);
    expect(f("visita").sort()).toEqual(["Hugo Matos", "Luísa Freitas"]);
    expect(f("atrasadas")).toEqual(["Pedro Lopes"]);
    expect(f("todas", true)).toHaveLength(8);
    expect(f("todas", false, "rita")).toEqual(["Rita Sousa"]);
  });
});

describe("leads · negócios da pessoa", () => {
  it("incluem um item por negócio, os de exemplo também (a Carla tem 3 e o Sérgio 2)", () => {
    const S = seed();
    const ls = leadsDe(S);
    const carla = itensNegocios(S, ls.find((p) => p.nome === "Carla Nunes")!);
    expect(carla.length).toBe(3);
    expect(carla.filter((i) => i.demo)).toHaveLength(2);
    const sergio = itensNegocios(S, ls.find((p) => p.nome === "Sérgio Pinto")!);
    expect(sergio.map((i) => [i.servico, i.demo])).toEqual([["WC", false], ["Pintura interior", true]]);
    expect(sergio.some((i) => i.conjunta)).toBe(false);
  });
  it("sem orçamento mostra a etapa da pessoa", () => {
    const S = seed();
    const rita = itensNegocios(S, leadsDe(S).find((p) => p.nome === "Rita Sousa")!);
    expect(rita).toHaveLength(1);
    expect(rita[0].tipo).toBe("Lead");
    expect(rita[0].valor).toBeNull();
  });
});

describe("leads · informação", () => {
  it("contacto com telefone, email e consentimento; a origem vem dos toques e não daqui", () => {
    const S = seed();
    const info = infoLead(leadsDe(S).find((p) => p.nome === "Rita Sousa")!);
    const rotulos = info.contacto.map((c) => c.rotulo);
    expect(rotulos).toEqual(expect.arrayContaining(["Telefone", "Email", "Consentimento (RGPD)"]));
    expect(info.comercial).toBe("Rúben");
    expect(info).not.toHaveProperty("origem");
  });
});

describe("leads · tempo", () => {
  it("há quanto tempo chegou", () => {
    expect(tempoDesde("08/10 08:15")).toBe("há 2 dias");
    expect(tempoDesde("09/10")).toBe("ontem");
    expect(tempoDesde("hoje 10:00")).toBe("hoje");
    expect(tempoDesde("22/09")).toBe("há 2 semanas");
    expect(tempoDesde("")).toBe("");
  });
  it("somar dias mantém a hora e não inventa datas", () => {
    expect(somarDias("30/09 21:40", 2)).toBe("02/10 21:40");
    expect(somarDias("22/09", 12)).toBe("04/10");
    expect(somarDias("", 2)).toBe("");
    expect(somarDias("hoje 10:00", 2)).toBe("");
  });
});

describe("leads · não mutam o Estado", () => {
  it("nada muda o JSON do Estado", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    const ls = leadsDe(S);
    for (const p of ls) { itensNegocios(S, p); infoLead(p); }
    filtrarLeads(ls, "atrasadas", true, "a");
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("leads · casos de borda", () => {
  const clonar = (S: ReturnType<typeof seed>, id: number, novoId: number, mudar: Record<string, unknown> = {}) => {
    const base = S.deals.find((d) => d.id === id)!;
    const d = { ...structuredClone(base), id: novoId, ...mudar };
    S.deals.push(d as typeof base);
    return d;
  };
  const f = (S: ReturnType<typeof seed>, filtro: string, minhas = false, q = "") => filtrarLeads(leadsDe(S), filtro, minhas, q).map((p) => p.nome);

  it("um negócio em fase 3 e outro em fase 4 tiram a pessoa das leads", () => {
    const S = seed();
    clonar(S, 1031, 2101, { fase: 4 });
    expect(nomes(S)).not.toContain("Carla Nunes");
  });
  it("um perdido em fase 4 mais um aberto em fase 1 mantém a pessoa como lead", () => {
    const S = seed();
    clonar(S, 1038, 2102, { nome: "Manuel Costa", fase: 4, perdido: true });
    const p = leadsDe(S).find((x) => x.nome === "Manuel Costa")!;
    expect(p).toBeDefined();
    expect(p.negocios).toHaveLength(1);
    expect(p.principal.fase).toBe(1);
  });
  it("a pesquisa encontra por telefone e por localidade", () => {
    const S = seed();
    expect(f(S, "todas", false, "934 500")).toEqual(["Rita Sousa"]);
    expect(f(S, "todas", false, "loures")).toEqual(["Rita Sousa"]);
    expect(f(S, "todas", false, "  CASCAIS ")).toEqual(["Manuel Costa"]);
    expect(f(S, "todas", false, "zzz")).toEqual([]);
  });
  it("só as minhas devolve menos do que todas quando há negócios de outro responsável", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1045)!.dono = "direcao";
    const todas = f(S, "todas");
    const minhas = f(S, "todas", true);
    expect(minhas).not.toEqual(todas);
    expect(minhas).not.toContain("Rita Sousa");
    expect(minhas).toHaveLength(todas.length - 1);
  });
  it("só as minhas conta a pessoa se algum dos seus negócios for meu", () => {
    const S = seed();
    clonar(S, 1043, 2103, { dono: "comercial" });
    S.deals.find((d) => d.id === 1043)!.dono = "direcao";
    expect(f(S, "todas", true)).toContain("Ana Martins");
  });
  it("sem leads devolve listas vazias sem rebentar", () => {
    const S = seed();
    for (const d of S.deals) d.perdido = true;
    expect(leadsDe(S)).toEqual([]);
    expect(filtrarLeads([], "atrasadas", true, "x")).toEqual([]);
  });
  it("uma lead sem histórico tem histórico vazio", () => {
    const S = seed();
    const p = leadsDe(S).find((x) => x.nome === "Rita Sousa")!;
    p.negocios.forEach((d) => { d.hist = []; });
    expect(historicoDe(p)).toEqual([]);
  });
  it("quando vazio não inventa data nem para o tempo", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1045)!.quando = "";
    const p = leadsDe(S).find((x) => x.nome === "Rita Sousa")!;
    expect(tempoDesde(p.principal.quando)).toBe("");
  });
});
