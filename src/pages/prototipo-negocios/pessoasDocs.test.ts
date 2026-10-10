import { describe, expect, it } from "vitest";
import { seed, tot, type Estado, type Papel } from "./motor";
import { leadsDe } from "./leadsDocs";
import {
  SEM_FILTROS, clientesApp, comerciaisDe, contagens, dadosCliente, documentosDe, filtrarPessoas, filtrarTexto, itensPessoa, leadsApp, negociosDemo,
  ordenarPessoas, origensDe, pessoasDoSeparador, separadorPorDefeito, todosApp, valorPessoa,
} from "./pessoasDocs";
import { resumoClientes, resumoLeads, resumoTodos } from "./perfilDocs";

const LEADS = ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Carla Nunes", "Sérgio Pinto"];
const CLIENTES = ["Tiago Almeida", "Marta Lima", "Joana Ribeiro"];
const nomes = (l: { nome: string }[]): string[] => l.map((p) => p.nome);
const clone = (S: Estado, id: number, novoId: number, mudar: Record<string, unknown> = {}): void => {
  const base = S.deals.find((d) => d.id === id)!;
  S.deals.push({ ...structuredClone(base), id: novoId, ...mudar } as typeof base);
};

describe("pessoas · quem é lead e quem é cliente", () => {
  it("com a seed: 8 leads e 3 clientes, os mesmos da página de Leads", () => {
    const S = seed();
    expect(nomes(leadsApp(S)).sort()).toEqual([...LEADS].sort());
    expect(nomes(clientesApp(S)).sort()).toEqual([...CLIENTES].sort());
    expect(nomes(leadsApp(S))).toEqual(nomes(leadsDe(S)));
    expect(leadsApp(S).every((p) => p.papel === "lead")).toBe(true);
    expect(clientesApp(S).every((p) => p.papel === "cliente")).toBe(true);
  });
  it("negócio em fase 4 ou 5, ou contrato assinado, faz da pessoa um cliente", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1031)!.orc!.contrato = "assinado";
    expect(nomes(clientesApp(S))).toContain("Carla Nunes");
    expect(nomes(leadsApp(S))).not.toContain("Carla Nunes");
    const S2 = seed();
    S2.deals.find((d) => d.id === 1030)!.fase = 4;
    expect(nomes(clientesApp(S2))).toContain("Sérgio Pinto");
  });
  it("só negócios perdidos: a pessoa não é lead nem cliente", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1044)!.perdido = true;
    expect(nomes(todosApp(S))).not.toContain("Pedro Lopes");
  });
  it("um perdido em fase 4 mais um aberto em fase 1 mantém a pessoa como lead", () => {
    const S = seed();
    clone(S, 1038, 2102, { fase: 4, perdido: true });
    expect(nomes(leadsApp(S))).toContain("Manuel Costa");
    expect(nomes(clientesApp(S))).not.toContain("Manuel Costa");
  });
});

describe("pessoas · cliente que pede algo novo", () => {
  it("com a seed só a Marta Lima tem um negócio novo (de exemplo), e só aparece em Clientes", () => {
    const S = seed();
    const marcados = clientesApp(S).filter((p) => p.novoNegocio);
    expect(nomes(marcados)).toEqual(["Marta Lima"]);
    expect(nomes(leadsApp(S))).not.toContain("Marta Lima");
    expect(leadsApp(S).some((p) => p.novoNegocio)).toBe(false);
  });
  it("o negócio de exemplo é um orçamento de cozinha em fase de orçamento, derivado de um existente", () => {
    const S = seed();
    const marta = clientesApp(S).find((p) => p.nome === "Marta Lima")!;
    expect(marta.extra).toHaveLength(1);
    const d = marta.extra[0];
    expect(d.fase).toBe(3);
    expect(d.linha).toBe("coz");
    expect(d.orc?.enviada).toBeNull();
    expect(S.deals.some((x) => x.id === d.id)).toBe(false);
    const itens = itensPessoa(S, marta);
    const demo = itens.find((i) => i.demo)!;
    expect(demo).toBeDefined();
    expect(demo.tipo).toBe("Orçamento");
    expect(demo.valor).toBeGreaterThan(0);
    expect(demo.negocioId).toBe(1022);
  });
  it("um negócio aberto a sério, antes de contrato, também deixa o cliente em Clientes com a marca", () => {
    const S = seed();
    clone(S, 1043, 2201, { nome: "Tiago Almeida", tel: "913 220 410" });
    expect(nomes(leadsApp(S))).not.toContain("Tiago Almeida");
    const t = clientesApp(S).find((p) => p.nome === "Tiago Almeida")!;
    expect(t.novoNegocio).toBe(true);
    expect(t.extra).toHaveLength(0);
  });
  it("outros clientes e leads não têm negócio de exemplo", () => {
    const S = seed();
    for (const p of todosApp(S).filter((x) => x.nome !== "Marta Lima")) expect(p.extra).toHaveLength(0);
    expect(itensPessoa(S, leadsApp(S)[0]).some((i) => i.demo)).toBe(false);
  });
});

describe("pessoas · casos de borda do negócio novo", () => {
  it("negociosDemo devolve [] se o negócio base da Marta Lima não existe, está perdido, ou faltam as medidas", () => {
    expect(negociosDemo(seed())).toHaveLength(1);
    const sem = seed();
    sem.deals = sem.deals.filter((d) => d.id !== 1022);
    expect(negociosDemo(sem)).toEqual([]);
    const perdido = seed();
    perdido.deals.find((d) => d.id === 1022)!.perdido = true;
    expect(negociosDemo(perdido)).toEqual([]);
    const semMedidas = seed();
    semMedidas.deals = semMedidas.deals.filter((d) => d.id !== 1031);
    expect(negociosDemo(semMedidas)).toEqual([]);
  });
  it("sem o negócio base, a Marta Lima deixa de ter negócio novo", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1022)!.perdido = true;
    expect(clientesApp(S).find((p) => p.nome === "Marta Lima")?.novoNegocio ?? false).toBe(false);
  });
  it("um negócio aberto em fase 4 não conta como novo; só o outro, em fase menor, conta", () => {
    const S = seed();
    clone(S, 1027, 2301, { fase: 4 });
    expect(clientesApp(S).find((p) => p.nome === "Tiago Almeida")!.novoNegocio).toBe(false);
    clone(S, 1043, 2302, { nome: "Tiago Almeida", tel: "913 220 410", fase: 2 });
    expect(clientesApp(S).find((p) => p.nome === "Tiago Almeida")!.novoNegocio).toBe(true);
  });
});

describe("pessoas · Todos", () => {
  it("cada pessoa uma só vez e Leads mais Clientes dá Todos", () => {
    const S = seed();
    const t = nomes(todosApp(S));
    expect(new Set(t).size).toBe(t.length);
    expect(t).toHaveLength(leadsApp(S).length + clientesApp(S).length);
    expect([...t].sort()).toEqual([...LEADS, ...CLIENTES].sort());
    expect(contagens(S, "")).toEqual({ leads: 8, clientes: 3, todos: 11 });
  });
  it("uma pessoa com vários negócios aparece uma só vez", () => {
    const S = seed();
    clone(S, 1043, 2001);
    const t = nomes(todosApp(S));
    expect(t.filter((n) => n === "Ana Martins")).toHaveLength(1);
  });
  it("os separadores dão as listas certas", () => {
    const S = seed();
    expect(nomes(pessoasDoSeparador(S, "leads"))).toEqual(nomes(leadsApp(S)));
    expect(nomes(pessoasDoSeparador(S, "clientes"))).toEqual(nomes(clientesApp(S)));
    expect(nomes(pessoasDoSeparador(S, "todos"))).toEqual(nomes(todosApp(S)));
  });
  it("a pesquisa conta nos separadores e encontra por nome, telefone, serviço e local", () => {
    const S = seed();
    expect(nomes(filtrarTexto(todosApp(S), "marta"))).toEqual(["Marta Lima"]);
    expect(nomes(filtrarTexto(todosApp(S), "916 004"))).toEqual(["Marta Lima"]);
    expect(nomes(filtrarTexto(todosApp(S), "  ODIVELAS "))).toEqual(["Marta Lima"]);
    expect(filtrarTexto(todosApp(S), "zzz")).toEqual([]);
    expect(contagens(S, "marta")).toEqual({ leads: 0, clientes: 1, todos: 1 });
  });
});

describe("pessoas · dados do cliente", () => {
  it("valor total dos contratos assinados, n.º de contratos e obras em curso a partir da seed", () => {
    const S = seed();
    const por = (n: string) => clientesApp(S).find((p) => p.nome === n)!;
    const pf = (id: number) => tot(S.deals.find((d) => d.id === id)!, S).pf;
    expect(dadosCliente(S, por("Tiago Almeida"))).toMatchObject({ valorTotal: pf(1027), contratos: 1, obrasEmCurso: 0 });
    expect(dadosCliente(S, por("Marta Lima"))).toMatchObject({ valorTotal: pf(1022), contratos: 1, obrasEmCurso: 1 });
    expect(dadosCliente(S, por("Joana Ribeiro"))).toMatchObject({ valorTotal: pf(1050), contratos: 1, obrasEmCurso: 0 });
  });
  it("o negócio de exemplo não entra no valor dos contratos", () => {
    const S = seed();
    const marta = clientesApp(S).find((p) => p.nome === "Marta Lima")!;
    expect(dadosCliente(S, marta).valorTotal).toBe(tot(S.deals.find((d) => d.id === 1022)!, S).pf);
  });
  it("o último negócio é o mais recente, o de exemplo incluído", () => {
    const S = seed();
    const por = (n: string) => clientesApp(S).find((p) => p.nome === n)!;
    expect(dadosCliente(S, por("Marta Lima")).ultimo).toMatchObject({ servico: "Cozinha nova", quando: "08/10" });
    expect(dadosCliente(S, por("Tiago Almeida")).ultimo).toMatchObject({ servico: "Cozinha", quando: "15/09" });
  });
  it("uma obra por aprovar também conta como em curso, e a concluída não", () => {
    const S = seed();
    const j = S.deals.find((d) => d.id === 1050)!;
    j.obra.plano!.estado = "por aprovar";
    expect(dadosCliente(S, clientesApp(S).find((p) => p.nome === "Joana Ribeiro")!).obrasEmCurso).toBe(1);
  });
  it("contratos e documentos: contrato, fatura, recibo e obra, derivados dos dados", () => {
    const S = seed();
    const joana = documentosDe(clientesApp(S).find((p) => p.nome === "Joana Ribeiro")!);
    expect(joana.map((d) => d.tipo)).toEqual(["Contrato", "Fatura", "Recibo", "Obra"]);
    expect(joana[0]).toMatchObject({ estado: "Assinado", data: "21/09", negocioId: 1050 });
    expect(joana[1]).toMatchObject({ referencia: "FT 2026/380", data: "22/09" });
    expect(joana[2]).toMatchObject({ referencia: "RC 2026/270", data: "24/09" });
    expect(joana[3].estado).toBe("Concluída");
    const tiago = documentosDe(clientesApp(S).find((p) => p.nome === "Tiago Almeida")!);
    expect(tiago.map((d) => d.tipo)).toEqual(["Contrato"]);
    const marta = documentosDe(clientesApp(S).find((p) => p.nome === "Marta Lima")!);
    expect(marta.map((d) => d.tipo)).toEqual(["Contrato", "Fatura", "Recibo", "Obra"]);
    expect(marta[3].estado).toBe("Em curso");
    expect(marta.every((d) => d.negocioId === 1022)).toBe(true);
  });
  it("um contrato só enviado aparece como enviado", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1022)!;
    d.orc!.contrato = "enviado";
    const docs = documentosDe(clientesApp(S).find((p) => p.nome === "Marta Lima")!);
    expect(docs[0].estado).toBe("Enviado ao cliente");
  });
});

describe("pessoas · separador por defeito", () => {
  it("o comercial abre em Leads e os outros papéis em Clientes", () => {
    expect(separadorPorDefeito("comercial")).toBe("leads");
    for (const r of ["direcao", "financeiro", "armazem", "operacoes"] as Papel[]) expect(separadorPorDefeito(r)).toBe("clientes");
  });
});

describe("pessoas · não mutam o Estado", () => {
  it("nada muda o JSON do Estado", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    for (const p of todosApp(S)) { itensPessoa(S, p); documentosDe(p); if (p.papel === "cliente") dadosCliente(S, p); }
    contagens(S, "a"); filtrarTexto(todosApp(S), "a");
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("pessoas · resumos por separador face à seed", () => {
  it("o resumo bate com as listas de cada separador", () => {
    const S = seed();
    const l = resumoLeads(S), c = resumoClientes(S), t = resumoTodos(S);
    expect(l.leads).toBe(leadsApp(S).length);
    expect(c.clientes).toBe(clientesApp(S).length);
    expect(t).toEqual({ pessoas: 11, leads: l.leads, clientes: c.clientes });
    expect(l.porContactar).toBe(leadsApp(S).filter((p) => p.principal.fase === 0).length);
    expect(c.valorContratado).toBeCloseTo(clientesApp(S).reduce((a, p) => a + dadosCliente(S, p).valorTotal, 0), 2);
  });
  it("uma lead nova por contactar sobe os números certos", () => {
    const S = seed();
    const antes = resumoLeads(S);
    clone(S, 1043, 2501, { nome: "Nova Pessoa", tel: "910 000 000", atraso: true });
    const depois = resumoLeads(S);
    expect(depois.leads).toBe(antes.leads + 1);
    expect(depois.porContactar).toBe(antes.porContactar + 1);
    expect(depois.atrasadas).toBe(antes.atrasadas + 1);
    expect(resumoTodos(S).pessoas).toBe(12);
  });
});

describe("pessoas · ordenar", () => {
  const S = seed();
  it("urgência mantém a ordem da lista", () => {
    const ls = leadsApp(S);
    expect(nomes(ordenarPessoas(S, ls, "urgencia"))).toEqual(nomes(ls));
    expect(nomes(ordenarPessoas(S, ls, "urgencia"))[0]).toBe("Pedro Lopes");
  });
  it("mais recentes: a que chegou há menos tempo primeiro (Rita Sousa, 08/10) e a mais antiga no fim", () => {
    const o = nomes(ordenarPessoas(S, leadsApp(S), "recentes"));
    expect(o[0]).toBe("Rita Sousa");
    expect(o[o.length - 1]).toBe("Carla Nunes");
    expect(o).toHaveLength(8);
  });
  it("mais recentes com empates: quem chegou ao mesmo tempo mantém a ordem da lista (ordem estável)", () => {
    const S2 = seed();
    clone(S2, 1043, 91001, { nome: "Zé Empate", tel: "910 000 001", quando: "10/10" });
    clone(S2, 1043, 91002, { nome: "Abel Empate", tel: "910 000 002", quando: "10/10" });
    const ls = leadsApp(S2);
    const ordemLista = nomes(ls).filter((n) => n.endsWith("Empate"));
    expect(ordemLista).toHaveLength(2);
    const o = nomes(ordenarPessoas(S2, ls, "recentes"));
    expect(o.filter((n) => n.endsWith("Empate"))).toEqual(ordemLista);
    expect(o.slice(0, 2).sort()).toEqual(["Abel Empate", "Zé Empate"]);
    expect(o[2]).toBe("Rita Sousa");
    expect(nomes(ordenarPessoas(S2, ls, "recentes"))).toEqual(o);
  });
  it("valor: do maior para o menor, e quem não tem orçamento fica no fim pela ordem original", () => {
    const o = ordenarPessoas(S, leadsApp(S), "valor");
    const v = o.map((p) => valorPessoa(S, p));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeLessThanOrEqual(v[i - 1]);
    expect(nomes(o).slice(0, 2).sort()).toEqual(["Carla Nunes", "Sérgio Pinto"]);
    expect(nomes(o).slice(2)).toEqual(nomes(leadsApp(S)).filter((n) => !["Carla Nunes", "Sérgio Pinto"].includes(n)));
  });
  it("não altera a lista de entrada", () => {
    const ls = leadsApp(S), antes = nomes(ls);
    ordenarPessoas(S, ls, "valor");
    expect(nomes(ls)).toEqual(antes);
  });
});

describe("pessoas · filtros extra (origem e comercial)", () => {
  const S = seed();
  it("as origens e os comerciais disponíveis vêm das pessoas", () => {
    expect(origensDe(S, todosApp(S))).toEqual(expect.arrayContaining(["Google Ads", "Meta Ads", "Indicação", "Site", "TikTok Ads"]));
    expect(comerciaisDe(todosApp(S))).toEqual(["Rúben"]);
  });
  it("origem filtra pelo primeiro toque", () => {
    const f = (origem: string) => nomes(filtrarPessoas(S, todosApp(S), { ...SEM_FILTROS, origem }));
    expect(f("Google Ads")).toEqual(["Luísa Freitas"]);
    expect(f("Meta Ads")).toEqual(["Rita Sousa"]);
    expect(f("TikTok Ads")).toEqual(["Ana Martins"]);
    expect(f("Indicação").sort()).toEqual(["Hugo Matos", "Joana Ribeiro"]);
    expect(f("Origem que não existe")).toEqual([]);
    expect(f("")).toHaveLength(11);
  });
  it("comercial filtra por quem é dono do negócio", () => {
    const T = seed();
    clone(T, 1043, 2601, { nome: "Ana Martins", dono: "direcao" });
    T.deals.find((d) => d.id === 1043)!.dono = "direcao";
    const f = (comercial: string) => nomes(filtrarPessoas(T, todosApp(T), { ...SEM_FILTROS, comercial }));
    expect(f("Direção")).toEqual(["Ana Martins"]);
    expect(f("Rúben")).toHaveLength(10);
    expect(comerciaisDe(todosApp(T))).toEqual(["Direção", "Rúben"]);
  });
  it("combina com a pesquisa e com os filtros de lead", () => {
    const r = filtrarPessoas(S, leadsApp(S), { ...SEM_FILTROS, filtro: "visita", origem: "Google Ads" });
    expect(nomes(r)).toEqual(["Luísa Freitas"]);
    expect(filtrarPessoas(S, leadsApp(S), { ...SEM_FILTROS, q: "cascais", origem: "Google Ads" })).toEqual([]);
    expect(nomes(filtrarPessoas(S, leadsApp(S), { ...SEM_FILTROS, filtro: "atrasadas" }))).toEqual(["Pedro Lopes"]);
  });
});
